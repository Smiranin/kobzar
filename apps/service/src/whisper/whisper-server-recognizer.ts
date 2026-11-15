import { spawn, type ChildProcess } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { connect } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  PCM_BYTES_PER_SAMPLE,
  PCM_SAMPLE_RATE,
  RecognitionFailedError,
  RecognizerNotReadyError,
  type EngineStatus,
  type Language,
  type RecognitionInput,
  type Recognizer,
} from '@kobzar/core';
import { z } from 'zod';
import { WAV_HEADER_BYTES, wavHeader } from './wav.js';

/** whisper-server always listens on loopback (ADR 0001). */
const ENGINE_HOST = '127.0.0.1';
/** A recognition that takes longer is treated as a hung engine. */
export const RECOGNITION_TIMEOUT_MS = 120_000;
/** Restarts after an unexpected exit before the engine is reported as failed. */
export const MAX_ENGINE_RESTARTS = 3;
/** Loading `large-v3` from a cold disk takes well under this. */
const READY_TIMEOUT_MS = 120_000;
const READY_POLL_MS = 200;
const STOP_GRACE_MS = 5_000;
/** Engine output kept while it loads, to explain a failed start; dropped once it is ready. */
const STARTUP_LOG_BYTES = 4_000;
/**
 * The warm-up: the first inference after loading is slow while the GPU is prepared (0.69 s against
 * 0.25 s in Stage 0). One second of silence with VAD off makes the model run; its text is ignored,
 * and no recorded voice needs to ship with Kobzar.
 */
const WARM_UP_SECONDS = 1;

/** Recordings are sent as a WAV file, which whisper-server reads by itself. */
const inferenceResponseSchema = z.object({
  text: z.string(),
  segments: z.array(z.object({ text: z.string() })).optional(),
});

export class EngineSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineSetupError';
  }
}

export interface EngineLog {
  info(message: string): void;
  error(message: string): void;
}

export interface WhisperServerOptions {
  binaryPath: string;
  modelPath: string;
  vadModelPath: string;
  port: number;
  log: EngineLog;
  timeoutMs?: number;
  maxRestarts?: number;
}

interface InferenceRequest {
  pcm: Uint8Array;
  language: Language;
  prompt: string;
  vad: boolean;
  signal?: AbortSignal;
}

async function requireFile(path: string, what: string): Promise<void> {
  try {
    await access(path, constants.R_OK);
  } catch {
    throw new EngineSetupError(`${what} is missing at ${path}; run: mise run setup`);
  }
}

/** True when something already accepts connections on the port. */
function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: ENGINE_HOST, port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

/**
 * whisper.cpp's `whisper-server` as a child process that keeps the model in memory. It is restarted
 * after an unexpected exit up to a limit; its output is never written anywhere, because after
 * loading it can contain recognised text.
 */
export class WhisperServerRecognizer implements Recognizer {
  private statusValue: EngineStatus = 'loading';
  private child: ChildProcess | undefined;
  private stopping = false;
  private restarts = 0;
  private readonly timeoutMs: number;
  private readonly maxRestarts: number;

  constructor(private readonly options: WhisperServerOptions) {
    this.timeoutMs = options.timeoutMs ?? RECOGNITION_TIMEOUT_MS;
    this.maxRestarts = options.maxRestarts ?? MAX_ENGINE_RESTARTS;
  }

  status(): EngineStatus {
    return this.statusValue;
  }

  async start(): Promise<void> {
    try {
      await requireFile(this.options.binaryPath, 'whisper-server');
      await requireFile(this.options.modelPath, 'The model file');
      await requireFile(this.options.vadModelPath, 'The VAD model file');
      if (await portInUse(this.options.port)) {
        throw new EngineSetupError(
          `enginePort ${this.options.port} is already in use; stop what listens there or change enginePort in kobzar.yaml`,
        );
      }
      await this.launch();
    } catch (error) {
      this.statusValue = 'failed';
      throw error;
    }
  }

  async recognise(input: RecognitionInput): Promise<{ segments: string[] }> {
    if (this.statusValue !== 'ready') throw new RecognizerNotReadyError(this.statusValue);
    return this.infer({
      pcm: input.pcm,
      language: input.language,
      prompt: input.modelPrompt,
      vad: true,
      ...(input.signal && { signal: input.signal }),
    });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (!child || child.exitCode !== null) return;
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), STOP_GRACE_MS);
    await exited;
    clearTimeout(timer);
  }

  /** Spawns the engine, waits until it answers, warms it up. Rejects if it exits or hangs first. */
  private async launch(): Promise<void> {
    this.statusValue = 'loading';
    const child = spawn(
      this.options.binaryPath,
      [
        '--host',
        ENGINE_HOST,
        '--port',
        String(this.options.port),
        '-m',
        this.options.modelPath,
        '--vad',
        '-vm',
        this.options.vadModelPath,
      ],
      // Its own process group: Ctrl-C in the terminal reaches Kobzar only, which then stops the
      // engine itself instead of seeing it die and restarting it.
      { stdio: ['ignore', 'ignore', 'pipe'], detached: true },
    );
    this.child = child;
    // If Kobzar exits without stop() (a crash), the engine must not stay behind holding the GPU.
    const killOnExit = () => child.kill('SIGKILL');
    process.once('exit', killOnExit);
    child.once('exit', () => process.off('exit', killOnExit));

    let startupLog = '';
    const collect = (chunk: Buffer) => {
      startupLog = (startupLog + chunk.toString('utf8')).slice(-STARTUP_LOG_BYTES);
    };
    child.stderr?.on('data', collect);

    let exitedEarly: string | undefined;
    const exited = new Promise<void>((resolve) => {
      child.once('error', (error) => {
        exitedEarly = error.message;
        resolve();
      });
      child.once('exit', (code, signal) => {
        exitedEarly = `exited with ${signal ?? code}`;
        resolve();
        this.onExit(child);
      });
    });

    try {
      await this.waitUntilAnswering(exited, () => exitedEarly !== undefined);
      if (exitedEarly !== undefined) throw new Error(`whisper-server ${exitedEarly}`);
      await this.infer({
        pcm: new Uint8Array(WARM_UP_SECONDS * PCM_SAMPLE_RATE * PCM_BYTES_PER_SAMPLE),
        language: 'en',
        prompt: '',
        vad: false,
      });
    } catch (error) {
      if (child.exitCode === null) child.kill('SIGKILL');
      throw new EngineSetupError(
        `whisper-server did not start: ${(error as Error).message}\n${startupLog.trim()}`,
      );
    } finally {
      // From here on the output may hold recognised text: drain it without keeping it.
      child.stderr?.off('data', collect);
      child.stderr?.resume();
    }
    this.statusValue = 'ready';
    this.restarts = 0;
    this.options.log.info(`whisper-server ready on ${ENGINE_HOST}:${this.options.port}`);
  }

  private async waitUntilAnswering(exited: Promise<void>, hasExited: () => boolean): Promise<void> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (!hasExited()) {
      if (Date.now() > deadline) throw new Error(`not ready after ${READY_TIMEOUT_MS / 1000} s`);
      try {
        const response = await fetch(`${this.baseUrl()}/health`);
        if (response.ok) return;
      } catch {
        // Not listening yet: the model is still loading.
      }
      await Promise.race([sleep(READY_POLL_MS), exited]);
    }
  }

  /** An exit nobody asked for, after the engine was ready, restarts it; exits while loading are handled by `launch`. */
  private onExit(child: ChildProcess): void {
    if (child !== this.child) return;
    this.child = undefined;
    if (this.stopping || this.statusValue !== 'ready') return;
    this.options.log.error('whisper-server exited unexpectedly; restarting it');
    void this.restart();
  }

  private async restart(): Promise<void> {
    this.statusValue = 'loading';
    while (this.restarts < this.maxRestarts && !this.stopping) {
      this.restarts += 1;
      try {
        await this.launch();
        return;
      } catch (error) {
        this.options.log.error(
          `Restart ${this.restarts} of ${this.maxRestarts} failed: ${(error as Error).message}`,
        );
      }
    }
    if (!this.stopping) {
      this.statusValue = 'failed';
      this.options.log.error('whisper-server keeps failing; restart Kobzar');
    }
  }

  private baseUrl(): string {
    return `http://${ENGINE_HOST}:${this.options.port}`;
  }

  private async infer(request: InferenceRequest): Promise<{ segments: string[] }> {
    const wav = new Uint8Array(WAV_HEADER_BYTES + request.pcm.byteLength);
    wav.set(wavHeader(request.pcm.byteLength), 0);
    wav.set(request.pcm, WAV_HEADER_BYTES);
    const form = new FormData();
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'recording.wav');
    form.append('language', request.language);
    form.append('prompt', request.prompt);
    // The model prompt then applies to every 30-second window, not only the first.
    form.append('carry_initial_prompt', 'true');
    form.append('vad', String(request.vad));
    form.append('response_format', 'verbose_json');

    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl()}/inference`, { method: 'POST', body: form, signal });
    } catch (error) {
      if (timeout.aborted) {
        // A hung engine: kill it, and the restart brings it back.
        this.child?.kill('SIGKILL');
        throw new RecognitionFailedError(
          `The recognition took longer than ${this.timeoutMs / 1000} seconds.`,
          { cause: error },
        );
      }
      throw new RecognitionFailedError('The recognition engine did not answer.', { cause: error });
    }
    if (!response.ok) {
      throw new RecognitionFailedError(`The recognition engine failed (HTTP ${response.status}).`);
    }
    const parsed = inferenceResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new RecognitionFailedError('The recognition engine gave an answer Kobzar cannot read.');
    }
    const { text, segments } = parsed.data;
    return { segments: segments ? segments.map((segment) => segment.text) : [text] };
  }
}
