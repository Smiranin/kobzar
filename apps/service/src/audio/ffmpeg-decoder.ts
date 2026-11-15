import { spawn } from 'node:child_process';
import {
  PCM_SAMPLE_RATE,
  UnreadableRecordingError,
  pcmDurationMs,
  type AudioDecoder,
  type DecodedRecording,
} from '@kobzar/core';

/** The last lines of ffmpeg's error output kept for the log; they name the codec, not the words. */
const STDERR_TAIL_BYTES = 2_000;

export class FfmpegMissingError extends Error {
  constructor(command: string) {
    super(`${command} was not found; install it with: brew install ffmpeg`);
    this.name = 'FfmpegMissingError';
  }
}

function isMissingCommand(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

/**
 * Decodes a Recording to 16 kHz mono PCM with ffmpeg. It reads from the file, because an MP4 from
 * Safari cannot be read from a pipe, and takes the PCM from standard output, so no second temp file
 * exists and five minutes stay under 10 MB in memory.
 */
export class FfmpegDecoder implements AudioDecoder {
  constructor(private readonly command = 'ffmpeg') {}

  /** Fails at startup with the fix when ffmpeg is not installed. */
  async checkAvailable(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.command, ['-version'], { stdio: 'ignore' });
      child.on('error', (error) =>
        reject(isMissingCommand(error) ? new FfmpegMissingError(this.command) : error),
      );
      child.on('exit', (code) =>
        code === 0 ? resolve() : reject(new Error(`${this.command} -version exited with ${code}`)),
      );
    });
  }

  decode(input: { path: string; maxSeconds: number }): Promise<DecodedRecording> {
    // An argument array, never a shell string: the path is never interpreted.
    const args = [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      input.path,
      '-t',
      String(input.maxSeconds + 1),
      '-vn',
      '-ac',
      '1',
      '-ar',
      String(PCM_SAMPLE_RATE),
      '-f',
      's16le',
      '-acodec',
      'pcm_s16le',
      'pipe:1',
    ];
    return new Promise<DecodedRecording>((resolve, reject) => {
      const child = spawn(this.command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      const chunks: Buffer[] = [];
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString('utf8')).slice(-STDERR_TAIL_BYTES);
      });
      child.on('error', (error) =>
        reject(isMissingCommand(error) ? new FfmpegMissingError(this.command) : error),
      );
      child.on('close', (code) => {
        if (code !== 0) {
          reject(
            new UnreadableRecordingError('Kobzar could not read this Recording.', {
              cause: new Error(`ffmpeg exited with ${code}: ${stderr.trim()}`),
            }),
          );
          return;
        }
        const pcm = new Uint8Array(Buffer.concat(chunks));
        if (pcm.byteLength === 0) {
          reject(new UnreadableRecordingError('The Recording contains no audio.'));
          return;
        }
        resolve({ pcm, durationMs: pcmDurationMs(pcm) });
      });
    });
  }
}
