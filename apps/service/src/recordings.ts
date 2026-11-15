import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';
import { KobzarError } from './errors.js';

/** Largest request body Kobzar reads: five minutes of any sensible phone codec fits well inside. */
export const MAX_BODY_BYTES = 30 * 1024 * 1024;

/**
 * Kobzar's own folder for Recordings in flight. Each Recording gets a fresh subfolder that is
 * removed as soon as its Transcript is returned (SPEC requirement 14).
 */
export class RecordingsFolder {
  constructor(readonly root: string) {}

  /** Removes what a crash may have left behind; called once at startup. */
  async sweep(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const entries = await readdir(this.root);
    await Promise.all(
      entries.map((entry) => rm(join(this.root, entry), { recursive: true, force: true })),
    );
  }

  /** A fresh folder for one request; the caller removes it with `discard` in a `finally`. */
  async create(): Promise<string> {
    await mkdir(this.root, { recursive: true });
    return mkdtemp(join(this.root, 'recording-'));
  }

  async discard(folder: string): Promise<void> {
    await rm(folder, { recursive: true, force: true });
  }
}

/** Writes an uploaded file part to `path` and returns its size in bytes. */
export async function saveUpload(part: MultipartFile, path: string): Promise<number> {
  const out = createWriteStream(path);
  await pipeline(part.file, out);
  if (part.file.truncated) {
    throw new KobzarError('recording_too_long', 'The Recording is larger than Kobzar accepts.');
  }
  return out.bytesWritten;
}

/** The form field that carries the Recording, in every multipart request. */
export const RECORDING_FIELD = 'recording';

export interface RecordingForm {
  recording: { path: string; bytes: number; mimeType: string } | undefined;
  fields: Record<string, string>;
}

/**
 * Reads every part of a multipart request: the Recording is written into `folder`, the text fields
 * are collected. Parts may come in any order, so nothing is validated until all are read.
 */
export async function readRecordingForm(
  request: FastifyRequest,
  folder: string,
): Promise<RecordingForm> {
  const form: RecordingForm = { recording: undefined, fields: {} };
  for await (const part of request.parts()) {
    if (part.type === 'field') {
      form.fields[part.fieldname] = String(part.value);
      continue;
    }
    if (part.fieldname !== RECORDING_FIELD || form.recording !== undefined) {
      throw new KobzarError(
        'invalid_request',
        `Only one file is accepted, in the field "${RECORDING_FIELD}".`,
      );
    }
    const path = join(folder, RECORDING_FIELD);
    form.recording = { path, bytes: await saveUpload(part, path), mimeType: part.mimetype };
  }
  return form;
}

/** The Recording of a form that must have one; an empty upload is unreadable. */
export function requireRecording(form: RecordingForm): NonNullable<RecordingForm['recording']> {
  if (!form.recording) {
    throw new KobzarError('invalid_request', `The field "${RECORDING_FIELD}" is missing.`);
  }
  if (form.recording.bytes === 0) {
    throw new KobzarError('unreadable_recording', 'The Recording is empty.');
  }
  return form.recording;
}
