import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

/** Where Kobzar's files live, relative to the repository it runs from. */
export const REPO_ROOT = resolve(here, '../../..');
export const DEFAULT_SETTINGS_PATH = join(REPO_ROOT, 'kobzar.yaml');
export const INVENTED_PHRASES_PATH = join(REPO_ROOT, 'invented-phrases.txt');
export const TEST_PAGE_DIST = join(REPO_ROOT, 'apps/test-page/dist');
export const SERVICE_PACKAGE_JSON = join(REPO_ROOT, 'apps/service/package.json');

/** Built and downloaded by `scripts/setup-engine.sh`. */
export const WHISPER_SERVER_PATH = join(REPO_ROOT, 'vendor/whisper.cpp/build/bin/whisper-server');
export const MODELS_DIR = join(REPO_ROOT, 'models');
/** Must match VAD_MODEL in `scripts/setup-engine.sh`. */
export const VAD_MODEL_PATH = join(MODELS_DIR, 'ggml-silero-v6.2.0.bin');

export function modelPath(model: string): string {
  return join(MODELS_DIR, `ggml-${model}.bin`);
}

/** Recordings in flight; in the user's private temp folder, swept at startup. */
export const RECORDINGS_DIR = join(tmpdir(), 'kobzar-recordings');
