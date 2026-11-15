import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsError, loadSettings } from '../src/settings.js';

describe('loadSettings', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kobzar-settings-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('uses the defaults when kobzar.yaml is missing, with paths resolved beside it', async () => {
    const loaded = await loadSettings(join(dir, 'kobzar.yaml'), {});

    expect(loaded.settings.port).toBe(4900);
    expect(loaded.dictionaryPath).toBe(join(dir, 'dictionary.txt'));
    expect(loaded.samplesDir).toBe(join(dir, 'samples'));
  });

  it('reads the keys of the file', async () => {
    await writeFile(
      join(dir, 'kobzar.yaml'),
      'defaultLanguage: en\nmodel: large-v3\nallowedOrigins: [https://dojo.ts.net]\n',
    );

    const { settings } = await loadSettings(join(dir, 'kobzar.yaml'), {});

    expect(settings).toMatchObject({
      defaultLanguage: 'en',
      model: 'large-v3',
      allowedOrigins: ['https://dojo.ts.net'],
    });
  });

  it('names the key of an invalid file', async () => {
    await writeFile(join(dir, 'kobzar.yaml'), 'port: many\n');

    await expect(loadSettings(join(dir, 'kobzar.yaml'), {})).rejects.toThrow(/port/);
    await expect(loadSettings(join(dir, 'kobzar.yaml'), {})).rejects.toBeInstanceOf(SettingsError);
  });

  it('refuses a public host', async () => {
    await writeFile(join(dir, 'kobzar.yaml'), 'host: 0.0.0.0\n');

    await expect(loadSettings(join(dir, 'kobzar.yaml'), {})).rejects.toThrow(/host/);
  });

  it('adds the dev origin from the environment', async () => {
    const { settings } = await loadSettings(join(dir, 'kobzar.yaml'), {
      KOBZAR_DEV_ORIGIN: 'http://localhost:5173',
    });

    expect(settings.allowedOrigins).toEqual(['http://localhost:5173']);
  });
});
