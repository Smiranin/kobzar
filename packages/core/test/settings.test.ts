import { describe, expect, it } from 'vitest';
import { defaultSettings, settingsSchema } from '../src/index.js';

describe('settings schema', () => {
  it('fills every key with its default', () => {
    expect(defaultSettings()).toEqual({
      host: '127.0.0.1',
      port: 4900,
      publicUrl: '',
      allowedOrigins: [],
      defaultLanguage: 'ru',
      model: 'large-v3-turbo',
      enginePort: 4901,
      dictionaryPath: './dictionary.txt',
      samplesDir: './samples',
    });
  });

  it('accepts origins and refuses a URL with a path or a trailing slash', () => {
    expect(
      settingsSchema.safeParse({
        publicUrl: 'https://mac.tail1234.ts.net:8443',
        allowedOrigins: ['https://mac.tail1234.ts.net'],
      }).success,
    ).toBe(true);
    expect(settingsSchema.safeParse({ publicUrl: 'https://mac.ts.net/' }).success).toBe(false);
    expect(settingsSchema.safeParse({ allowedOrigins: ['https://dojo/app'] }).success).toBe(false);
  });

  it('refuses an unknown language, a model name with a path and an unknown key', () => {
    expect(settingsSchema.safeParse({ defaultLanguage: 'uk' }).success).toBe(false);
    expect(settingsSchema.safeParse({ model: '../secret' }).success).toBe(false);
    expect(settingsSchema.safeParse({ prot: 4900 }).success).toBe(false);
  });

  it('refuses a host that is not loopback', () => {
    expect(settingsSchema.safeParse({ host: '0.0.0.0' }).success).toBe(false);
    expect(settingsSchema.safeParse({ host: 'localhost' }).success).toBe(true);
  });

  it('refuses the same port for Kobzar and the engine', () => {
    expect(settingsSchema.safeParse({ port: 5000, enginePort: 5000 }).success).toBe(false);
  });
});
