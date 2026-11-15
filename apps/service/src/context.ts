import type { AudioDecoder, Recognizer, Settings } from '@kobzar/core';
import type { LocalFiles } from './local-files.js';
import type { SerialQueue } from './queue.js';
import type { RecordingsFolder } from './recordings.js';
import type { SamplesStore } from './sample-store.js';

/** Everything the routes need, built once by `buildApp`. Ports only, never concrete adapters. */
export interface ServiceContext {
  settings: Settings;
  version: string;
  recognizer: Recognizer;
  decoder: AudioDecoder;
  queue: SerialQueue;
  localFiles: LocalFiles;
  recordings: RecordingsFolder;
  samples: SamplesStore;
}
