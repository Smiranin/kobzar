import { MAX_RECORDING_SECONDS } from '@kobzar/core';

/**
 * Containers in order of preference. Chrome records Opus in WebM; Safari and every browser on iOS
 * record AAC in MP4. Kobzar decodes either with ffmpeg.
 */
const CONTAINERS = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];

function supportedContainer(): string | undefined {
  return CONTAINERS.find((type) => MediaRecorder.isTypeSupported(type));
}

export class RecorderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecorderError';
  }
}

/** One phrase from the microphone, kept in memory only. */
export class Recorder {
  private recorder: MediaRecorder | undefined;
  private stream: MediaStream | undefined;
  private chunks: Blob[] = [];
  private limitTimer: number | undefined;
  private finished: ((recording: Blob) => void) | undefined;
  private startedAt = 0;

  get recording(): boolean {
    return this.recorder?.state === 'recording';
  }

  elapsedMs(): number {
    return this.recording ? Date.now() - this.startedAt : 0;
  }

  /** Starts recording; `onLimit` gets the Recording if it reaches the five-minute limit. */
  async start(onLimit: (recording: Blob) => void): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new RecorderError(
        'The browser gives no microphone: the page must be on HTTPS or localhost.',
      );
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      throw new RecorderError('No access to the microphone.');
    }
    const mimeType = supportedContainer();
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    });
    this.recorder.addEventListener('stop', () => {
      const recording = new Blob(this.chunks, { type: this.recorder?.mimeType ?? mimeType ?? '' });
      this.release();
      this.finished?.(recording);
      this.finished = undefined;
    });
    this.finished = onLimit;
    this.recorder.start();
    this.startedAt = Date.now();
    this.limitTimer = window.setTimeout(() => this.recorder?.stop(), MAX_RECORDING_SECONDS * 1000);
  }

  /** Stops and gives the Recording. */
  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.recorder || this.recorder.state !== 'recording') {
        reject(new RecorderError('Not recording.'));
        return;
      }
      this.finished = resolve;
      this.recorder.stop();
    });
  }

  private release(): void {
    window.clearTimeout(this.limitTimer);
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = undefined;
  }
}
