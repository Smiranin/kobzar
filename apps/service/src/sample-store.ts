import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { samplesListSchema, type Language, type Sample } from '@kobzar/core';
import { z } from 'zod';
import { KobzarError } from './errors.js';

export const SAMPLES_FILE = 'samples.json';

/** File extensions for the containers phone browsers record, so the folder is readable by hand. */
const EXTENSIONS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/flac': 'flac',
};
/** Anything else is still stored: ffmpeg reads the content, not the name. */
const UNKNOWN_EXTENSION = 'audio';

function extensionOf(mimeType: string): string {
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return EXTENSIONS[base] ?? UNKNOWN_EXTENSION;
}

export interface NewSample {
  language: Language;
  expectedText: string;
  mimeType: string;
  durationMs: number;
  /** The uploaded Recording; it is copied into the Samples folder. */
  recordingPath: string;
}

/**
 * The Samples: `samples.json` plus one Recording per Sample, stored as uploaded so that a run goes
 * through the real decoding path. Changes are serialised, and the list is rewritten atomically.
 */
export class SamplesStore {
  private writing: Promise<unknown> = Promise.resolve();

  constructor(readonly dir: string) {}

  async list(): Promise<Sample[]> {
    let text: string;
    try {
      text = await readFile(join(this.dir, SAMPLES_FILE), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const parsed = samplesListSchema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      throw new Error(
        `${join(this.dir, SAMPLES_FILE)} is damaged: ${z.prettifyError(parsed.error)}`,
      );
    }
    return parsed.data.samples;
  }

  async get(id: string): Promise<Sample> {
    const sample = (await this.list()).find((candidate) => candidate.id === id);
    if (!sample) throw new KobzarError('not_found', 'There is no such Sample.');
    return sample;
  }

  recordingPath(sample: Sample): string {
    return join(this.dir, `${sample.id}.${extensionOf(sample.mimeType)}`);
  }

  add(input: NewSample): Promise<Sample> {
    return this.change(async (samples) => {
      const sample: Sample = {
        id: randomUUID(),
        language: input.language,
        expectedText: input.expectedText,
        mimeType: input.mimeType,
        durationMs: input.durationMs,
        createdAt: new Date().toISOString(),
      };
      await copyFile(input.recordingPath, this.recordingPath(sample));
      return { samples: [...samples, sample], result: sample };
    });
  }

  update(id: string, expectedText: string): Promise<Sample> {
    return this.change(async (samples) => {
      const sample = samples.find((candidate) => candidate.id === id);
      if (!sample) throw new KobzarError('not_found', 'There is no such Sample.');
      const updated = { ...sample, expectedText };
      return {
        samples: samples.map((candidate) => (candidate.id === id ? updated : candidate)),
        result: updated,
      };
    });
  }

  remove(id: string): Promise<void> {
    return this.change(async (samples) => {
      const sample = samples.find((candidate) => candidate.id === id);
      if (!sample) throw new KobzarError('not_found', 'There is no such Sample.');
      await rm(this.recordingPath(sample), { force: true });
      return { samples: samples.filter((candidate) => candidate.id !== id), result: undefined };
    });
  }

  /** Runs one change after the previous one, then writes the list to a temp file and renames it. */
  private change<T>(
    apply: (samples: Sample[]) => Promise<{ samples: Sample[]; result: T }>,
  ): Promise<T> {
    const next = this.writing.then(async () => {
      await mkdir(this.dir, { recursive: true });
      const { samples, result } = await apply(await this.list());
      const path = join(this.dir, SAMPLES_FILE);
      const temp = `${path}.${randomUUID()}.tmp`;
      await writeFile(temp, `${JSON.stringify({ samples }, null, 2)}\n`);
      await rename(temp, path);
      return result;
    });
    // A failed change must not block the ones after it.
    this.writing = next.catch(() => undefined);
    return next;
  }
}
