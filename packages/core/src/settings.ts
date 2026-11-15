import { z } from 'zod';
import { languageSchema } from './contract/common.js';

/** True when `value` is exactly an origin (`scheme://host[:port]`), the form the guard compares. */
function isOrigin(value: string): boolean {
  try {
    return new URL(value).origin === value;
  } catch {
    return false;
  }
}

const originSchema = z.string().refine(isOrigin, {
  message: 'must be an origin such as https://mac.tailnet.ts.net:8443 (no path, no trailing slash)',
});

/** The interfaces Kobzar may listen on. */
export const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost'] as const;

const portSchema = z.number().int().min(1).max(65_535);

/** `kobzar.yaml`; every key is optional and a missing file means these defaults. */
export const settingsSchema = z
  .object({
    /**
     * Loopback only (ADR 0001): the tailnet reaches Kobzar through `tailscale serve`, and the Host
     * check would refuse requests addressed to any other interface anyway.
     */
    host: z.enum(LOOPBACK_HOSTS).default('127.0.0.1'),
    port: portSchema.default(4900),
    /** The HTTPS address of Kobzar in the tailnet; makes the test page allowed there. */
    publicUrl: z.union([z.literal(''), originSchema]).default(''),
    /** Other sites that may send Recordings, e.g. the Dojo's address. */
    allowedOrigins: z.array(originSchema).default([]),
    defaultLanguage: languageSchema.default('ru'),
    /** Name of the model file `models/ggml-<model>.bin`. */
    model: z
      .string()
      .regex(/^[a-z0-9][a-z0-9.-]*$/, 'must be a model name such as large-v3-turbo')
      .default('large-v3-turbo'),
    /** Port of `whisper-server`, which always listens on loopback. */
    enginePort: portSchema.default(4901),
    dictionaryPath: z.string().min(1).default('./dictionary.txt'),
    samplesDir: z.string().min(1).default('./samples'),
  })
  .strict()
  .refine((settings) => settings.port !== settings.enginePort, {
    message: 'port and enginePort must differ',
    path: ['enginePort'],
  });

export type Settings = z.infer<typeof settingsSchema>;

export function defaultSettings(): Settings {
  return settingsSchema.parse({});
}
