/** Jobs that may wait while one runs; one more is refused as busy. */
export const MAX_WAITING_JOBS = 4;

export class QueueFullError extends Error {
  constructor() {
    super('The waiting line is full');
    this.name = 'QueueFullError';
  }
}

/** The job's caller went away before the job started. */
export class JobAbandonedError extends Error {
  constructor() {
    super('The caller went away before the job started');
    this.name = 'JobAbandonedError';
  }
}

interface Waiting {
  start: () => void;
  abandon: () => void;
}

/**
 * Runs jobs one at a time in arrival order (SPEC requirement 11). A job whose signal is aborted
 * while it waits is dropped without running, so a Client that gave up costs no recognition.
 */
export class SerialQueue {
  private running = false;
  private readonly waiting: Waiting[] = [];

  constructor(private readonly maxWaiting = MAX_WAITING_JOBS) {}

  run<T>(job: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new JobAbandonedError());
    if (!this.running) return this.execute(job);
    if (this.waiting.length >= this.maxWaiting) return Promise.reject(new QueueFullError());

    return new Promise<T>((resolve, reject) => {
      const entry: Waiting = {
        start: () => {
          signal?.removeEventListener('abort', onAbort);
          this.execute(job).then(resolve, reject);
        },
        abandon: () => reject(new JobAbandonedError()),
      };
      const onAbort = () => {
        const index = this.waiting.indexOf(entry);
        if (index === -1) return;
        this.waiting.splice(index, 1);
        entry.abandon();
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiting.push(entry);
    });
  }

  private async execute<T>(job: () => Promise<T>): Promise<T> {
    this.running = true;
    try {
      return await job();
    } finally {
      this.running = false;
      this.waiting.shift()?.start();
    }
  }
}
