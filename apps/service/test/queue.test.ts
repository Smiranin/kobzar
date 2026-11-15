import { describe, expect, it } from 'vitest';
import { JobAbandonedError, QueueFullError, SerialQueue } from '../src/queue.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('SerialQueue', () => {
  it('runs jobs one at a time in arrival order', async () => {
    const queue = new SerialQueue();
    const order: string[] = [];
    const first = deferred();

    const a = queue.run(async () => {
      order.push('a start');
      await first.promise;
      order.push('a end');
    });
    const b = queue.run(async () => {
      order.push('b');
    });
    await Promise.resolve();
    expect(order).toEqual(['a start']);
    first.resolve();
    await Promise.all([a, b]);

    expect(order).toEqual(['a start', 'a end', 'b']);
  });

  it('refuses a job when the waiting line is full', async () => {
    const queue = new SerialQueue(1);
    const gate = deferred();
    const running = queue.run(() => gate.promise);
    const waiting = queue.run(async () => 'second');

    await expect(queue.run(async () => 'third')).rejects.toBeInstanceOf(QueueFullError);
    gate.resolve();
    await running;
    expect(await waiting).toBe('second');
  });

  it('drops a waiting job whose caller went away, without running it', async () => {
    const queue = new SerialQueue();
    const gate = deferred();
    const running = queue.run(() => gate.promise);
    const controller = new AbortController();
    let ran = false;
    const abandoned = queue.run(async () => {
      ran = true;
    }, controller.signal);

    controller.abort();
    gate.resolve();
    await running;

    await expect(abandoned).rejects.toBeInstanceOf(JobAbandonedError);
    expect(ran).toBe(false);
  });

  it('keeps going after a job fails', async () => {
    const queue = new SerialQueue();
    await expect(queue.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(await queue.run(async () => 'next')).toBe('next');
  });
});
