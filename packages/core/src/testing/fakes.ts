import type { EngineStatus } from '../contract/health.js';
import {
  RecognizerNotReadyError,
  UnreadableRecordingError,
  type AudioDecoder,
  type DecodedRecording,
  type RecognitionInput,
  type Recognizer,
} from '../ports.js';

/** A Recognizer whose answers the test scripts; it records every call that crossed the port. */
export class FakeRecognizer implements Recognizer {
  statusValue: EngineStatus = 'ready';
  /** The segments the next calls return, unless `respond` is set. */
  segments: string[] = [' Привет, это проверка.'];
  /** Overrides `segments`: may throw or return per call. */
  respond: ((input: RecognitionInput) => Promise<{ segments: string[] }>) | undefined;
  readonly calls: RecognitionInput[] = [];
  started = 0;
  stopped = 0;
  private gate: Promise<void> | undefined;

  async start(): Promise<void> {
    this.started += 1;
  }

  status(): EngineStatus {
    return this.statusValue;
  }

  async recognise(input: RecognitionInput): Promise<{ segments: string[] }> {
    if (this.statusValue !== 'ready') throw new RecognizerNotReadyError(this.statusValue);
    this.calls.push(input);
    if (this.gate) await this.gate;
    if (this.respond) return this.respond(input);
    return { segments: [...this.segments] };
  }

  async stop(): Promise<void> {
    this.stopped += 1;
  }

  /** Makes every recognition wait until the returned function is called. */
  hold(): () => void {
    let release!: () => void;
    this.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return () => {
      this.gate = undefined;
      release();
    };
  }
}

/** An AudioDecoder that reports a scripted length; it records the paths it was given. */
export class FakeAudioDecoder implements AudioDecoder {
  durationMs = 5_000;
  /** When set, every decode fails as an unreadable Recording with this message. */
  unreadable: string | undefined;
  readonly calls: { path: string; maxSeconds: number }[] = [];

  async decode(input: { path: string; maxSeconds: number }): Promise<DecodedRecording> {
    this.calls.push(input);
    if (this.unreadable !== undefined) throw new UnreadableRecordingError(this.unreadable);
    // The length the real decoder would report: it stops one second past the limit.
    const durationMs = Math.min(this.durationMs, (input.maxSeconds + 1) * 1000);
    return { pcm: new Uint8Array(0), durationMs };
  }
}
