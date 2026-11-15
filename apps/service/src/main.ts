// Composition root: loads kobzar.yaml, wires the real adapters, starts the engine, listens.
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { buildApp, type BuiltApp } from './app.js';
import { FfmpegDecoder } from './audio/ffmpeg-decoder.js';
import {
  DEFAULT_SETTINGS_PATH,
  INVENTED_PHRASES_PATH,
  RECORDINGS_DIR,
  SERVICE_PACKAGE_JSON,
  TEST_PAGE_DIST,
  VAD_MODEL_PATH,
  WHISPER_SERVER_PATH,
  modelPath,
} from './paths.js';
import { loadSettings } from './settings.js';
import { WhisperServerRecognizer } from './whisper/whisper-server-recognizer.js';

async function readVersion(): Promise<string> {
  const pkg = z
    .object({ version: z.string() })
    .parse(JSON.parse(await readFile(SERVICE_PACKAGE_JSON, 'utf8')));
  return pkg.version;
}

async function main(): Promise<void> {
  const settingsPath = process.env.KOBZAR_CONFIG ?? DEFAULT_SETTINGS_PATH;
  const { settings, dictionaryPath, samplesDir } = await loadSettings(settingsPath, process.env);

  const decoder = new FfmpegDecoder();
  await decoder.checkAvailable();

  // The engine logs through the app's logger; it is called only after `built` exists, from start().
  const engineLog = {
    info: (message: string) => built.app.log.info(message),
    error: (message: string) => built.app.log.error(message),
  };
  const recognizer = new WhisperServerRecognizer({
    binaryPath: WHISPER_SERVER_PATH,
    modelPath: modelPath(settings.model),
    vadModelPath: VAD_MODEL_PATH,
    port: settings.enginePort,
    log: engineLog,
  });

  const built: BuiltApp = await buildApp({
    settings,
    version: await readVersion(),
    recognizer,
    decoder,
    dictionaryPath,
    inventedPhrasesPath: INVENTED_PHRASES_PATH,
    samplesDir,
    recordingsDir: RECORDINGS_DIR,
    testPageDist: TEST_PAGE_DIST,
    logger: true,
  });
  const { app, context, servesTestPage } = built;
  await context.recordings.sweep();
  await app.listen({ host: settings.host, port: settings.port });
  app.log.info(
    {
      model: settings.model,
      defaultLanguage: settings.defaultLanguage,
      dictionaryPath,
      samplesDir,
    },
    `Kobzar listening on http://${settings.host}:${settings.port}`,
  );
  if (!servesTestPage) {
    app.log.warn('The test page is not built; run: mise run build (mise run start does it)');
  }

  // Not awaited: /v1/health answers `loading` while the model loads.
  recognizer.start().catch((error: unknown) => {
    app.log.error(error instanceof Error ? error.message : String(error));
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await recognizer.stop();
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
