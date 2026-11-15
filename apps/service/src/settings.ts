import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { settingsSchema, type Settings } from '@kobzar/core';
import { parse } from 'yaml';
import { z } from 'zod';

export class SettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsError';
  }
}

export interface LoadedSettings {
  settings: Settings;
  /** Absolute, resolved against the directory of `kobzar.yaml`. */
  dictionaryPath: string;
  samplesDir: string;
}

/**
 * Loads `kobzar.yaml`; a missing file means the defaults. `KOBZAR_DEV_ORIGIN` in `env` adds one
 * allowed origin: the dev task sets it to the Vite dev server, so the guard has no bypass.
 */
export async function loadSettings(
  path: string,
  env: Record<string, string | undefined>,
): Promise<LoadedSettings> {
  let raw: unknown = {};
  try {
    raw = parse(await readFile(path, 'utf8')) ?? {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new SettingsError(`Cannot read ${path}: ${(error as Error).message}`);
    }
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SettingsError(`${path} must be a YAML mapping`);
  }
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) throw new SettingsError(`${path}: ${z.prettifyError(parsed.error)}`);

  const settings = parsed.data;
  const devOrigin = env.KOBZAR_DEV_ORIGIN;
  if (devOrigin) {
    const withDev = settingsSchema.safeParse({
      ...settings,
      allowedOrigins: [...settings.allowedOrigins, devOrigin],
    });
    if (!withDev.success) {
      throw new SettingsError(`KOBZAR_DEV_ORIGIN: ${z.prettifyError(withDev.error)}`);
    }
    settings.allowedOrigins = withDev.data.allowedOrigins;
  }

  const base = dirname(resolve(path));
  return {
    settings,
    dictionaryPath: resolve(base, settings.dictionaryPath),
    samplesDir: resolve(base, settings.samplesDir),
  };
}
