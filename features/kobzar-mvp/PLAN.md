# Kobzar MVP: Implementation Plan

**SPEC:** ./SPEC.md
**ADRs:** ../../adr/0001-local-recognition-on-the-owners-mac.md, ../../adr/0002-standalone-service-with-thin-clients.md
**Glossary:** ../../GLOSSARY.md
**Related:** ../../../dojo/features/voice-input/SPEC.md (the first Client), ../../../dojo/adr/0005-phone-talks-to-pysar-directly.md (both on the other laptop; the Dojo's microphone button is built in a separate session, not here)
**Status:** Stages 0 to 7 done; Stage 8 (phone, tailnet, the owner's Samples) open
**Written:** 2026-11-11

## Summary

Kobzar is built as a small TypeScript service on Fastify, in the repository `~/Projects/Kobzar` (this folder, documents already in it), with the same toolchain and conventions as the owner's Dojo (`~/Projects/dojo`, public at `github.com/Smiranin/dojo`): pnpm workspace, mise, strict TypeScript, Vitest, ESLint, Prettier. The Dojo repository is the reference for shape and test style; read it, do not import it.

Recognition is done by Whisper `large-v3-turbo` running in whisper.cpp's own HTTP program, `whisper-server`, which Kobzar starts as a child process and keeps alive so the model stays in memory (ADR 0001: everything on the Mac). Kobzar itself owns everything around the model: the contract with Clients, decoding the Recording with ffmpeg, the five-minute limit, the one-at-a-time queue, the Dictionary, the removal of invented phrases, the Samples and the test page. The model sits behind one port, `Recognizer`, so a different model or runtime can be tried without touching the rest (ADR 0002: the recognition is the expensive, reusable part).

Three workspace packages:

- `packages/core` (`@kobzar/core`): pure TypeScript, no Node-only imports, also bundled into the test page. The contract schemas, the error codes, the Dictionary parser, the builder of the model prompt, the filter for invented phrases, the word diff and the totals of a Samples run.
- `apps/service` (`@kobzar/service`): the Fastify composition root. Settings, routes, the origin guard, the queue, the Samples store, and the two adapters that touch the outside world: `FfmpegDecoder` and `WhisperServerRecognizer`.
- `apps/test-page` (`@kobzar/test-page`): one page in plain TypeScript built with Vite and served by the service. No React, no router.

Why this shape. `whisper-server` is the only runtime found that has all of: a model that stays loaded, a per-request model prompt that is carried into every 30-second window, built-in Silero voice activity detection, and no Python. Putting it behind a child process isolates crashes and keeps the choice replaceable. Converting the Recording in Kobzar (not with `whisper-server --convert`) gives one place that knows the Recording's length and one place that deletes it.

Decisions taken during /to-plan (accepted by the owner on 2026-11-11 unless marked "author"):

1. **Stack:** TypeScript + Fastify, as in the Dojo; the model runs in a separate whisper.cpp process behind the `Recognizer` port. Python (FastAPI + mlx-whisper) was the alternative and was rejected.
2. **Model:** Whisper `large-v3-turbo` by default, `large-v3` compared against it in Stage 0; the model is a setting. The speed target (thirty seconds in about three) is plausible but unmeasured on an M5 Pro; Stage 0 measures it.
3. **Contract:** `POST /v1/transcripts` (multipart) and `GET /v1/health`, errors as `{ error: { code, message } }`. Details under Interfaces and Contracts.
4. **Dictionary:** `dictionary.txt`, one entry per line, ignored by git, with a committed `dictionary.example.txt`. Read on every request. It reaches the model only through the model prompt, which is limited to 223 tokens: hints always fit first, then Dictionary entries from the top of the file until the budget is used; the response says how many entries were used and the test page warns when some were left out. No replacement of words after recognition (it would contradict SPEC requirement 4).
5. **Silence:** voice activity detection in front of the model, plus a committed list of phrases the model is known to invent, removed from the Transcript.
6. **Samples:** the whole `samples/` folder is local and ignored by git, expected texts included. This closes the SPEC's second open question.
7. **Test page:** one page, plain TypeScript, Vite, served by the service.
8. **Test seam:** one: HTTP through Fastify `inject` with a fake `Recognizer` and a fake `AudioDecoder`. One live test with the real model and real ffmpeg, switched on by an environment variable.
9. **Settings and start:** `kobzar.yaml`; `mise run setup` installs dependencies, builds whisper.cpp from source and downloads the models; `mise run start` runs Kobzar. Homebrew's whisper.cpp is not used: its formula is built without `whisper-server`.
10. (author) `kobzar.yaml` is ignored by git and `kobzar.example.yaml` is committed, because the settings hold the owner's tailnet addresses and the repository is public. A missing `kobzar.yaml` means defaults.
11. (author) The test page drives a Samples run one Sample at a time (`POST /v1/samples/:id/run`) and computes the totals itself with a core function. One button for the owner, visible progress, no minute-long HTTP request.
12. (author) Browser requests are refused, not merely left without CORS headers, when their `Origin` is not allowed: a multipart POST needs no preflight, so CORS headers alone would not stop a foreign page from making Kobzar work.

## Current State

Only the documents exist: `~/Projects/Kobzar` holds `GLOSSARY.md`, `adr/` and `features/kobzar-mvp/`, and is not yet a git repository. The implementing agent runs `git init` in this folder and builds the code beside the documents; the owner adds the remote and commits; the agent never commits.

Machine. Kobzar is developed and run only on the owner's personal MacBook (M5 Pro, 48 GB), the one with Tailscale. This plan was written on the work laptop, which must not have Tailscale and takes no part. Checked on the personal Mac on 2026-11-11: Apple M5 Pro, 48 GB, Tailscale, mise, pnpm, git, Xcode tools and the macOS voice Milena are present; `cmake` and `ffmpeg` are missing (`brew install cmake ffmpeg`).

Reference code in the Dojo repository:

| What                                                                                               | Path in `~/Projects/dojo`                                                                                                            |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Workspace, mise tasks, tsconfig, ESLint, Prettier, root Vitest config                              | `package.json`, `pnpm-workspace.yaml`, `mise.toml`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `vitest.config.ts` |
| Fastify app builder, context, routes as `registerXRoutes(app, ctx)`, error mapping, static serving | `apps/server/src/app.ts`, `context.ts`, `routes/*.ts`, `errors.ts`, `static.ts`                                                      |
| Settings file read and validated with zod                                                          | `apps/server/src/settings.ts`, `packages/core/test/settings.test.ts`                                                                 |
| Test helper: app on temp folders with a fake port, driven with `inject`                            | `apps/server/test/helpers.ts`, `apps/server/test/health.test.ts`                                                                     |
| Fake implementation of a port, exported from `core/testing`                                        | `packages/core/src/testing/`                                                                                                         |
| Pure package consumed by both the Node app and the browser bundle                                  | `packages/core`                                                                                                                      |

External facts, from research on 2026-11-10. "Verified" means read in the primary source that day; everything else must be confirmed in Stage 0.

- whisper.cpp v1.9.5 (2026-10-06), `github.com/ggml-org/whisper.cpp`. `whisper-server` keeps the model loaded and accepts per-request form fields including the model prompt, `carry_initial_prompt`, the language and the VAD switches (verified in `examples/server/README.md` at that tag). The exact field names, the inference path and the readiness check are to be copied from that README in Stage 0, not from memory.
- The Homebrew formula builds whisper.cpp with `-DWHISPER_BUILD_SERVER=OFF`, without a model (verified). Hence the build from source.
- `whisper-server` decodes WAV, MP3, FLAC and Vorbis by itself. A phone browser records `audio/webm;codecs=opus` (Chrome on the desktop and Android) or `audio/mp4` with AAC (Safari and every browser on iOS); neither is decoded natively (verified), so ffmpeg is required.
- The model prompt is limited to 223 tokens (`n_text_ctx / 2 - 1`). When it is longer, whisper.cpp keeps the last tokens and drops the first (verified).
- With VAD on, a Recording in which no speech is found returns no text and the model is not run (verified in source). The VAD model is Silero, file `ggml-silero-v6.2.0.bin`.
- Without VAD, Whisper invents subtitle credits on silence ("Субтитры сделал DimaTorzok", "Продолжение следует..."). No public Russian list of such phrases was found; Kobzar keeps its own.
- Speed: a short clip took 1.23 s with turbo on an M4 with 24 GB. No figure exists for an M-series Pro.
- Not verified: whether turbo is worse than `large-v3` on the owner's speech; whether Core ML still speeds turbo up; how the VAD treats breathing and keyboard noise.

### Stage 0 outcome, part 1 (2026-11-14, synthetic speech)

Measured with the macOS voice Milena, not yet with the owner's voice; part 2 follows with the owner's Recordings.

- Engine: whisper.cpp v1.9.5 built from source with `scripts/setup-engine.sh` (idempotent, a second run takes under a second). Model files: turbo 1.6 GB, `large-v3` 3.1 GB, Silero VAD 0.9 MB.
- Interface, read in `examples/server/server.cpp`: `POST /inference`, multipart; the Recording in field `file`; per-request fields `language`, `prompt`, `carry_initial_prompt`, `vad` (and `vad_threshold` and the other VAD knobs), `response_format` (`json` gives `{ text }`, `verbose_json` adds `segments[].text`). Readiness: `GET /health` returns `{"status":"ok"}` with 200 once the model is loaded. VAD needs `--vad -vm <file>` at start and can be switched per request.
- Speed, turbo: ready 4 s after start; a 6-second phrase took 0.69 s the first time and 0.25 s after (so the warm-up is worth having); a 31-second Recording took 0.94 s, far inside the three-second target. `large-v3`: the same 31 seconds took 2.15 s.
- Accuracy: with a model prompt holding the terms, turbo wrote Fastify, Vitest, zod and Kubernetes correctly in the short phrase; without it, "Festify" and "iTest". `large-v3` was not better on these phrases (it wrote "Кьюберниц", "Виспер"). Default stays turbo; confirmed or changed in part 2.
- Silence: with VAD on, an empty Transcript in 0.02 s; with VAD off, "Продолжение следует...". VAD stays on for every request.
- Segments: the engine sometimes splits a word between two segments ("очер" + "едь"), hence the joining rule under Invented phrases.
- Still open for part 2: the owner's phrases, the cough or breath test (step 7), the token calibration (step 6).

### Stage 0 outcome, part 2 (2026-11-14, the owner's voice)

Seven Recordings from the owner's phone (Opus in Ogg, 5 to 52 seconds): three Russian phrases with terms, one English, one 52-second monologue, silence, a breath sound. Model prompt: a punctuated Russian lead-in sentence followed by the terms.

- **Default model: `large-v3-turbo`, confirmed.** With the model prompt it gave correct punctuation and capitals, the terms right (TPS, workaround, AI agents, Dojo, speech-to-text) and kept every filler word ("Так, значит, смотри", "вот"). `large-v3` with the same prompt dropped those filler words, which breaks the verbatim rule (SPEC requirement 4), and was twice as slow.
- **The model prompt is needed for punctuation, not only for terms.** Without it turbo returned two of the Russian phrases with no punctuation and no capitals and dropped the first word of one. The lead-in sentence must be written as punctuated text.
- **Speed, turbo with the prompt:** about 0.3 s for 10 to 12 seconds, 0.95 s for 52 seconds.
- **Silence:** empty Transcript. **English** with `language=en`: correct.
- **Breath or cough alone:** VAD treats it as speech and the model writes a short sound word ("Хух-хух.", "_Класс_", "Хоу."). `suppress_nst` and a VAD threshold up to 0.8 did not stop it. Accepted as a known limit: a Recording of only a breath is not a real use; no filter is built. If it shows up inside real Samples, it is taken to the owner.
- **The model never wrote out the model prompt's words** on the breath Recording (step 7): no fix needed.
- **Token calibration (step 6),** from the engine's "initial prompt is too long (N tokens)" warning: Latin terms 2.87 characters per token, Cyrillic words 2.24, a typical mixed prompt 2.64. One constant is kept: 2.0 characters per token (below the Cyrillic worst case), so the budget of 200 tokens is about 400 characters.
- Open: "Suptron" came out as "Suptroon" once even with the term in the prompt; to be watched in the Samples.

### Implementation outcome (2026-11-14, Stages 1 to 7)

Built end to end in one run; `mise run check` passes (88 tests) and the live test passes with the real engine. Departures from the text below, each small:

- **Error code `internal_error` (500)** added for a fault in Kobzar itself, so that a bug is never reported as `recognition_failed`. Its message says only "see the log".
- **`host` accepts only `127.0.0.1` or `localhost`**: any other value is refused at startup. The Host check would refuse such requests anyway, so the setting could only mislead.
- **The Samples store is `apps/service/src/sample-store.ts`**, not `src/samples/store.ts`: `.gitignore` ignores every folder named `samples/`, which would have kept the source out of git. The ignore rule stays broad on purpose.
- **Warm-up:** one second of silence sent with VAD off, so the model really runs and no recorded voice ships with Kobzar.
- **The engine runs in its own process group** and is killed if Kobzar exits without stopping it. Ctrl-C reaches only Kobzar, which stops the engine itself, so the engine is not seen to die and restarted.
- **`mise run dev` does not watch the service:** `tsx watch` SIGKILLs the service on a second signal, which left `whisper-server` behind, and every restart reloads the model anyway. The page keeps Vite's hot reload; the Vite proxy uses `changeOrigin` so the guard sees Kobzar's own Host, and `KOBZAR_DEV_ORIGIN` allows the dev origin.
- **Live test phrase:** Milena reads "Vitest" in Russian ("вайтест"), so the Russian live test checks "Fastify" instead.
- Measured through the service: a 6-second phrase took 0.45 s, an 11.7-second phrase of the owner's 0.52 s; killing `whisper-server` by hand gave `loading`, then `ready` within a second; `lsof` shows 4900 and 4901 on `127.0.0.1` only; the log holds no Transcript.

Stage 8 is the owner's: Tailscale was stopped on the Mac during the run. The commands are in the README under "From the phone": `tailscale serve --bg --https=8443 http://127.0.0.1:4900`, then `publicUrl` in `kobzar.yaml` and a restart.

## Target Architecture

### Modules and Responsibilities

```
Kobzar/
  package.json  pnpm-workspace.yaml  mise.toml  tsconfig.base.json  vitest.config.ts
  eslint.config.js  .prettierrc.json  .editorconfig  .gitignore
  README.md  LICENSE  CLAUDE.md
  kobzar.example.yaml          committed
  dictionary.example.txt      committed
  invented-phrases.txt        committed
  scripts/setup-engine.sh     builds whisper.cpp, downloads the models
  kobzar.yaml                  local, ignored
  dictionary.txt              local, ignored
  samples/                    local, ignored: samples.json + one Recording per Sample
  vendor/whisper.cpp/         local, ignored: pinned checkout and build
  models/                     local, ignored: ggml model files
  packages/core/
  apps/service/
  apps/test-page/
```

`packages/core` (pure, no I/O):

| Module                    | Owns                                                                                                                       | Must not know about        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `src/contract/`           | zod schemas and types of every request and response, the `Language` and `Mode` unions, the error codes                     | Fastify, files             |
| `src/settings.ts`         | the settings schema and `defaultSettings()`                                                                                | where the settings file is |
| `src/dictionary.ts`       | `parseDictionary(text)`: lines to entries (trim, skip blanks and `#` comments, drop duplicates)                            | the file system            |
| `src/model-prompt.ts`     | `buildModelPrompt(...)`: which hints and Dictionary entries go into the model prompt within the token budget, and its text | whisper.cpp                |
| `src/invented-phrases.ts` | `parseInventedPhrases(text)` and `removeInventedPhrases(segments, phrases)`                                                | where the list is stored   |
| `src/diff.ts`             | `diffWords(expected, actual)` and `summariseRun(results)`                                                                  | the page, the store        |
| `src/ports.ts`            | the `Recognizer` and `AudioDecoder` interfaces and their error classes                                                     | any implementation         |
| `src/testing/`            | `FakeRecognizer`, `FakeAudioDecoder` (scripted, record their calls)                                                        |                            |

`apps/service`:

| Module                                                 | Owns                                                                                                                  | Must not know about                             |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `src/settings.ts`                                      | reading `kobzar.yaml`, validating it, resolving paths                                                                 | routes                                          |
| `src/app.ts`, `src/context.ts`                         | `buildApp(options)`: plugins, hooks, routes, the context object handed to routes                                      | process lifecycle                               |
| `src/main.ts`                                          | the composition root: settings, real adapters, start the engine, listen, shut down on signals                         | request handling                                |
| `src/origin-guard.ts`                                  | the `onRequest` hook that refuses a disallowed `Host` or `Origin`, and the CORS options                               | what a route does                               |
| `src/errors.ts`                                        | `KobzarError` (code, HTTP status, message) and the Fastify error handler that renders every failure as the error body |                                                 |
| `src/queue.ts`                                         | `SerialQueue`: runs jobs one at a time in arrival order, bounded waiting line                                         | what a job is                                   |
| `src/transcribe.ts`                                    | `transcribe(input, ctx)`: the pipeline shared by the transcripts route and a Sample run                               | HTTP                                            |
| `src/local-files.ts`                                   | reading `dictionary.txt` and `invented-phrases.txt` fresh for each Recording                                          | parsing (core does it)                          |
| `src/audio/ffmpeg-decoder.ts`                          | `FfmpegDecoder`: a Recording on disk to 16 kHz mono PCM plus its length                                               | the model                                       |
| `src/whisper/whisper-server-recognizer.ts`             | `WhisperServerRecognizer`: spawn, readiness, restart, one inference call, shutdown                                    | the Dictionary, HTTP of Kobzar                  |
| `src/sample-store.ts`                                  | `SamplesStore`: `samples.json` and the Recordings beside it                                                           | recognition                                     |
| `src/routes/health.ts`, `transcripts.ts`, `samples.ts` | request parsing and response shaping only                                                                             | adapters directly (they go through the context) |
| `src/static.ts`                                        | serving the built test page                                                                                           |                                                 |

`apps/test-page`: `index.html`, `src/main.ts` (wiring), `src/recorder.ts` (MediaRecorder wrapper, picks the container the browser supports), `src/api.ts` (fetch client returning typed values or a typed error), `src/views/` (the record panel, the Samples list, the run table), `src/style.css`. It knows the contract through `@kobzar/core` and nothing about the service's internals.

### Relations and Data Flow

Dependencies point one way: `apps/service` and `apps/test-page` depend on `packages/core`; core depends on nothing of ours. Routes depend on the context; the context holds ports, never concrete adapters.

One Recording:

```
Client ──POST /v1/transcripts──▶ origin guard ─▶ route: parse multipart, validate fields
                                                   │  Recording written to a temp file
                                                   ▼
                                             SerialQueue (one job at a time)
                                                   ▼
                                transcribe():
                                  AudioDecoder.decode ──▶ PCM + durationMs   (ffmpeg)
                                  durationMs > limit  ──▶ recording_too_long
                                  read dictionary.txt, invented-phrases.txt
                                  buildModelPrompt(dictionary, hints, language)
                                  Recognizer.recognise ─▶ segments           (whisper-server, VAD on)
                                  removeInventedPhrases ─▶ text
                                                   ▼
                                finally: temp file deleted, PCM dropped
Client ◀── { text, language, mode, durationMs, processingMs, dictionary } ──┘
```

A Sample run is the same `transcribe()` called with the Sample's stored Recording, followed by `diffWords` against the expected text. It goes through the same queue, so a run and a Client never recognise at the same time.

The engine: `main.ts` calls `recognizer.start()` without waiting for it before listening, so `GET /v1/health` answers `loading` while the model loads and `ready` after. If the child exits, the recognizer restarts it a bounded number of times and reports `failed` after that.

### Patterns and Technologies

Applied:

- **Ports and adapters** for the two things outside the process (`Recognizer`, `AudioDecoder`); fakes in `core/testing`. Same idea as the Dojo's `Sensei` port.
- **Composition root** in `main.ts`; `buildApp` takes everything as options so tests build the app with fakes and temp folders.
- **Schema-first contract**: zod schemas in core are the single definition; the service validates with them and the test page takes its types from them.
- **Typed errors**: adapters throw named error classes; one handler maps them to codes. No failure is swallowed, and no route builds an error body by hand.
- **Read on use** for the Dictionary and the invented phrases: the files are small, so they are read for every Recording. No watcher, no cache.

Not applied: no database, no file watcher, no Server-Sent Events, no React, no state library, no authentication (ADR 0001), no Core ML build (Metal only unless Stage 0 shows the speed target is missed), no Node binding to whisper.cpp.

Libraries: `fastify`, `@fastify/multipart`, `@fastify/cors`, `@fastify/static`, `zod`, `yaml`, `diff` (jsdiff, for `diffArrays`), `tsx`; `vite` for the test page; `vitest`, `eslint`, `prettier`, `typescript` at the root. Node and pnpm versions pinned in `mise.toml` to the Dojo's (Node 26.10.0, pnpm 12.6.0). External programs: `ffmpeg` and `cmake` (the owner installs them with Homebrew; `setup-engine.sh` checks for them and says what to install), `whisper-server` built from the pinned tag.

## Interfaces and Contracts

### Client contract (`packages/core/src/contract/`)

`POST /v1/transcripts`, `multipart/form-data`:

| Field       | Required | Meaning                                                                   |
| ----------- | -------- | ------------------------------------------------------------------------- |
| `recording` | yes      | the Recording, any container ffmpeg reads                                 |
| `language`  | no       | `ru` or `en`; the default language from settings when absent              |
| `hints`     | no       | a JSON array of strings, at most 50 entries of at most 64 characters each |
| `mode`      | no       | `verbatim` (default); any other value is refused                          |

The parts may come in any order; the route reads all of them before validating.

Response 200:

```ts
interface TranscriptResponse {
  text: string; // '' when there was no speech
  language: 'ru' | 'en';
  mode: 'verbatim';
  durationMs: number; // length of the Recording
  processingMs: number; // decode + recognise, excluding time spent waiting in the queue
  dictionary: { total: number; used: number }; // entries in the Dictionary, entries that fitted the model prompt
}
```

`GET /v1/health`, always 200 while the process is up:

```ts
interface HealthResponse {
  status: 'loading' | 'ready' | 'failed';
  version: string;
  defaultLanguage: 'ru' | 'en';
  languages: ['ru', 'en'];
  modes: ['verbatim'];
  maxRecordingSeconds: 300;
}
```

Errors, every non-2xx response:

```ts
interface ErrorResponse {
  error: { code: ErrorCode; message: string };
}
```

| `code`                 | HTTP | When                                                         |
| ---------------------- | ---- | ------------------------------------------------------------ |
| `invalid_request`      | 400  | no `recording`, unknown `language`, malformed `hints`        |
| `origin_not_allowed`   | 403  | a browser request from a site that is not allowed            |
| `not_found`            | 404  | unknown route or Sample                                      |
| `recording_too_long`   | 413  | longer than five minutes, or the body exceeds the size limit |
| `unreadable_recording` | 422  | ffmpeg cannot decode it, or it is empty                      |
| `unsupported_mode`     | 422  | `mode` is anything but `verbatim`                            |
| `busy`                 | 503  | the waiting line is full                                     |
| `not_ready`            | 503  | the engine is `loading` or `failed`                          |
| `recognition_failed`   | 500  | the engine returned an error or timed out                    |
| `internal_error`       | 500  | a fault in Kobzar itself (a bug); details only in the log    |

Messages are written for the owner to read on a phone: one sentence saying what happened.

### Test page API (same schemas folder, not part of the Client contract)

- `GET /v1/samples` → `{ samples: Sample[] }`
- `POST /v1/samples` multipart `recording`, `language`, `expectedText` → 201 `Sample`
- `PATCH /v1/samples/:id` JSON `{ expectedText }` → `Sample`
- `DELETE /v1/samples/:id` → 204
- `GET /v1/samples/:id/recording` → the stored Recording, for playback
- `POST /v1/samples/:id/run` → `SampleRunResult`

```ts
interface Sample {
  id: string; // generated by the service
  language: 'ru' | 'en';
  expectedText: string;
  mimeType: string; // as uploaded
  durationMs: number;
  createdAt: string; // ISO
}

interface SampleRunResult {
  sampleId: string;
  expectedText: string;
  text: string;
  durationMs: number;
  processingMs: number;
  diff: DiffPart[]; // { kind: 'same' | 'missing' | 'extra'; words: string[] }
  wordErrors: number;
  wordCount: number; // words in the expected text
}

interface RunTotals {
  // summariseRun(results), computed on the page
  samples: number;
  failed: number;
  wordErrors: number;
  wordCount: number;
  wordErrorRate: number;
  recordedMs: number;
  processingMs: number;
  speedFactor: number; // recordedMs / processingMs
}
```

`diffWords` compares words with punctuation removed, ignoring letter case and treating `ё` as `е`; the parts keep the original spelling for display. `wordErrors` for a changed stretch is the larger of its missing and extra word counts.

### Ports (`packages/core/src/ports.ts`)

```ts
interface AudioDecoder {
  /** Throws UnreadableRecordingError. Decodes at most maxSeconds + 1 so a forgotten recording is cut early. */
  decode(input: {
    path: string;
    maxSeconds: number;
  }): Promise<{ pcm: Uint8Array; durationMs: number }>;
}

interface Recognizer {
  start(): Promise<void>;
  status(): 'loading' | 'ready' | 'failed';
  /** Throws RecognizerNotReadyError, RecognitionFailedError. */
  recognise(input: {
    pcm: Uint8Array;
    language: Language;
    modelPrompt: string;
    signal?: AbortSignal;
  }): Promise<{ segments: string[] }>;
  stop(): Promise<void>;
}
```

`pcm` is 16 kHz mono signed 16-bit little-endian without a header; `WhisperServerRecognizer` prepends the 44-byte WAV header itself. `FfmpegDecoder` reads the Recording from a file (an MP4 from Safari is not readable from a pipe) and takes raw PCM from ffmpeg's standard output, so a five-minute Recording is under 10 MB in memory and no second temp file exists.

### Model prompt (`packages/core/src/model-prompt.ts`)

```ts
function buildModelPrompt(input: {
  dictionary: string[];
  hints: string[];
  language: Language;
  tokenBudget?: number;
}): { text: string; dictionaryUsed: number };
```

Rules: hints are always included; Dictionary entries are added from the top of the file while the estimated token count stays within the budget; duplicates between the two are dropped ignoring case. The text is a short fixed lead-in sentence in the request's language followed by the entries separated by commas, Dictionary entries first and hints last (if the estimate is ever wrong, whisper.cpp cuts from the start, so hints survive). Kobzar has no Whisper tokenizer, so tokens are estimated from characters with a deliberately cautious ratio: 2.0 characters per token, measured in Stage 0 (Cyrillic is the worst case at 2.24); the budget (200 of the 223) and the ratio are named constants. `carry_initial_prompt` is always on, so the model prompt applies to every 30-second window.

### Invented phrases

`invented-phrases.txt`: one phrase per line, `#` comments. `removeInventedPhrases` drops a segment whose text, lower-cased and stripped of punctuation, equals a listed phrase, then concatenates the rest as they are (each segment carries its own leading space, and the engine sometimes splits a word between two segments, so inserting spaces would break it), collapses runs of whitespace and line breaks into single spaces and trims. It never removes part of a segment, so real speech that merely contains such words is untouched.

### Settings (`kobzar.yaml`, all keys optional)

```yaml
host: 127.0.0.1 # never a public interface (ADR 0001)
port: 4900
publicUrl: '' # the HTTPS address of Kobzar in the tailnet; makes the test page allowed there
allowedOrigins: [] # other sites that may send Recordings, e.g. the Dojo's address
defaultLanguage: ru
model: large-v3-turbo # models/ggml-<model>.bin
enginePort: 4901 # whisper-server, loopback only
dictionaryPath: ./dictionary.txt
samplesDir: ./samples
```

Host and origin rule, two checks on every request, both exact string comparisons:

1. `Host` must be `127.0.0.1:<port>`, `localhost:<port>` or the host of `publicUrl`; otherwise `origin_not_allowed`. This is what stops DNS rebinding: a browser sends no `Origin` on a same-origin GET, so a rebound page reading `GET /v1/samples` or a Sample's Recording is caught only by its foreign `Host`.
2. A request without an `Origin` header then passes (curl, native Clients, same-origin GETs). A request with one passes only if it equals `http://127.0.0.1:<port>`, `http://localhost:<port>`, `publicUrl`, or an entry of `allowedOrigins`; otherwise `origin_not_allowed`.

In development (`mise run dev`) the Vite dev server's origin is added to the allowed list by the dev task, never by a bypass in the guard.

### Samples on disk

`samples/samples.json` holds `{ samples: Sample[] }` and is rewritten atomically (write a temp file, rename). Each Recording is stored as uploaded, `samples/<id>.<ext>`, so a run exercises the real decoding path. Deleting a Sample removes both.

### Constants worth naming

Five-minute limit (300 s), body size limit (30 MB), waiting line length (4), recognition timeout (120 s), engine restart attempts (3), model prompt budget (200 tokens), hint limits (50 × 64). Each is a named constant in one place.

## Testing Strategy

One seam: the HTTP surface of `buildApp`, driven with Fastify `inject`, with `FakeRecognizer` and `FakeAudioDecoder` from `@kobzar/core/testing` and temp folders for the Dictionary and the Samples. Copy the shape of `~/Projects/dojo/apps/server/test/helpers.ts`: a `testService(options)` helper returning the app, the fakes, the temp paths and a `cleanup()`.

A good test here states behaviour a Client or the owner can observe: "a Recording longer than five minutes is refused with `recording_too_long`", "a word added to `dictionary.txt` is in the model prompt of the next Recording", "a second Recording waits and both get their own Transcript", "a request from an unlisted site is refused and the Recognizer is never called", "after a Transcript is returned the temp folder is empty". Assertions on the fakes are limited to what crossed the port (the model prompt, the language); nothing asserts on private functions of the service.

Pure functions in core get direct unit tests because their rules are the product: `parseDictionary`, `buildModelPrompt` (budget, order, duplicates, hints never dropped), `removeInventedPhrases`, `diffWords`, `summariseRun`, the settings schema. Prior art: `~/Projects/dojo/packages/core/test/*.test.ts`.

One live test, `apps/service/test/live.test.ts`, skipped unless `KOBZAR_LIVE=1`: builds the app with the real `FfmpegDecoder` and `WhisperServerRecognizer` and sends Recordings produced on the spot, so no voice is committed: speech from macOS `say` (`say -v Milena -o <tmp>.m4a "..."` for Russian, an English voice for English) and silence from ffmpeg (`anullsrc`). It asserts that speech gives a non-empty Transcript containing an expected word, that silence gives `''`, and that an unreadable upload gives `unreadable_recording`. It runs only on the personal Mac and is not part of `mise run check`.

The test page has no automated tests; it is thin wiring over tested core functions and a tested API, and it is verified by hand in Stage 7 and on the phone in Stage 8.

`mise run check` (typecheck, lint, format check, tests) must pass at the end of every stage.

## Stages

### Stage 0: Prove the engine on the personal Mac

- **Goal:** know, before writing the service, that whisper.cpp with turbo is fast and accurate enough on the owner's speech, and record the exact `whisper-server` interface.
- **Depends on:** none.
- **Touches:** `scripts/setup-engine.sh`, `.gitignore`, this file (a "Stage 0 outcome" paragraph appended under Current State).
- **Steps:**
  1. Create the repository folder, `git init`, a `.gitignore` that already lists `kobzar.yaml`, `dictionary.txt`, `samples/`, `vendor/`, `models/`, `node_modules/`, `dist/`.
  2. Check the machine: `cmake`, `ffmpeg`, `mise`, Xcode command line tools, `tailscale`. Report what is missing to the owner instead of installing system software unasked.
  3. Write `scripts/setup-engine.sh`, idempotent: clone whisper.cpp at tag `v1.9.5` into `vendor/whisper.cpp`, build it with the server enabled (Metal, no Core ML), download `ggml-large-v3-turbo.bin`, `ggml-large-v3.bin` and the Silero VAD model into `models/` using the download scripts shipped in that checkout. It exits non-zero with a clear message on any failure.
  4. Start `whisper-server` by hand and read `examples/server/README.md` at the tag: write down the inference path, the form field names (model prompt, carry, language, VAD, response format), the readiness check, and what the JSON response with segments looks like.
  5. With the owner: five to ten phrases recorded on the phone (Russian with English terms, plain English, one of silence, one of thirty seconds), converted with ffmpeg and sent with curl. Compare turbo and `large-v3`, each with and without a model prompt holding the terms; note times, the first-request delay after start, and what silence returns with VAD on and off.
  6. Calibrate the token estimate: send a model prompt near the budget and check the engine's log for the truncation warning.
  7. With a long model prompt, send a short Recording of a cough or a breath: note whether the model writes out the prompt's words as if they were spoken. Only if it does is a fix designed, with the owner, from what was seen.
  8. Record the outcome in this file: chosen default model, measured times, the interface facts, the calibrated constants, any invented phrases seen.
- **Verify:** `scripts/setup-engine.sh` run twice succeeds both times; a curl call returns the text of a spoken phrase; the outcome paragraph exists. **Gate:** if a thirty-second Recording takes well over three seconds with turbo, or terms from the model prompt are still mostly wrong, stop and take the findings to the owner (options then: a Core ML build, `large-v3`, the code-switching fine-tune, or GigaAM-v3 as a second `Recognizer`) before Stage 1.

### Stage 1: Workspace scaffold

- **Goal:** an empty but green workspace with the Dojo's toolchain and the privacy rules in place.
- **Depends on:** Stage 0.
- **Touches:** root config files, `packages/core`, `apps/service`, `apps/test-page` (skeletons), `README.md`, `CLAUDE.md`, `kobzar.example.yaml`, `dictionary.example.txt`, `invented-phrases.txt`.
- **Steps:**
  1. Copy and adapt from the Dojo: `package.json` scripts, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js` (without the React plugin), Prettier, EditorConfig, root `vitest.config.ts`.
  2. `mise.toml` with tasks `setup` (pnpm install, then `scripts/setup-engine.sh`), `dev`, `build`, `start`, `typecheck`, `test`, `lint`, `format`, `check`.
  3. Three packages with a `package.json`, `tsconfig.json` and one placeholder export or test each.
  4. The committed example and list files; `README.md` with the glossary table and what is private; `CLAUDE.md` with the layout, commands and hard rules (never bind publicly, never commit the Dictionary, Samples or `kobzar.yaml`, never log a Transcript, the agent does not commit).
- **Verify:** `mise run check` passes; `git status --ignored` shows the private paths as ignored.

### Stage 2: Core: contract and the pure rules

- **Goal:** everything that can be decided without I/O exists and is tested.
- **Depends on:** Stage 1.
- **Touches:** `packages/core/src/**`, `packages/core/test/**`.
- **Steps:**
  1. Contract schemas, types and error codes; the settings schema with `defaultSettings()`.
  2. `parseDictionary`, `buildModelPrompt` with the constants from Stage 0, `parseInventedPhrases`, `removeInventedPhrases`.
  3. `ports.ts` with the two interfaces and their error classes (they use only `Uint8Array` and `AbortSignal`, so core stays free of Node imports); `FakeRecognizer` and `FakeAudioDecoder` under `src/testing/`, exported as `@kobzar/core/testing`.
  4. Unit tests for each rule listed under Testing Strategy.
- **Verify:** `pnpm --filter @kobzar/core test` and `mise run check` pass.

### Stage 3: Service skeleton: settings, health, origin guard, errors

- **Goal:** a running service that reports its state and refuses foreign sites, with no recognition yet.
- **Depends on:** Stage 2.
- **Touches:** `apps/service/src/{app,context,main,settings,errors,origin-guard}.ts`, `src/routes/health.ts`, `apps/service/test/{helpers,health,origin,settings}.test.ts`.
- **Steps:**
  1. `settings.ts` reading `kobzar.yaml` (missing file means defaults, an invalid file is a startup error naming the key).
  2. `buildApp(options)` with the error handler, the origin guard, `@fastify/cors` configured from the same allowed list, and `GET /v1/health` reading `recognizer.status()`.
  3. `main.ts` wiring settings and, for now, a recognizer that is never ready, so the service starts and answers `loading`.
  4. `testService()` helper; tests for health in each engine state, for allowed, unlisted and absent `Origin`, for a GET without `Origin` but with a foreign `Host` (refused), for the CORS headers on an allowed origin, for unknown routes returning the error body.
- **Verify:** `mise run check` passes; `mise run dev` then `curl 127.0.0.1:4900/v1/health` returns the health body; `curl -H 'Origin: https://example.com' ...` returns 403 `origin_not_allowed`.

### Stage 4: The transcripts route on fakes

- **Goal:** the whole Client contract works end to end against the fakes.
- **Depends on:** Stage 3.
- **Touches:** `apps/service/src/{queue,transcribe,local-files}.ts`, `src/routes/transcripts.ts`, `apps/service/test/transcripts.test.ts`, `queue.test.ts`.
- **Steps:**
  1. `@fastify/multipart` with the body limit; the route validates fields with the core schemas and writes the Recording to a fresh temp folder.
  2. `SerialQueue` with the bounded waiting line; a job whose Client has gone away is dropped before it starts.
  3. `transcribe()` as drawn under Relations and Data Flow, with the temp file removed in a `finally` and a sweep of leftover temp folders at startup.
  4. Logging rule: log the code, the two durations and the Dictionary counts; never the Transcript, the hints or the Dictionary.
  5. Tests through `inject`: the happy path and its response fields; default and explicit language; hints and Dictionary reaching the model prompt; a Dictionary edit applying to the next request; an empty Transcript from no segments; an invented phrase removed; each error code in the table; two concurrent requests answered in order; the waiting line overflowing into `busy`; `not_ready` while loading; temp folder empty afterwards.
- **Verify:** `mise run check` passes.

### Stage 5: Real adapters and the single start command

- **Goal:** Kobzar transcribes a real Recording; success criterion 1 is reachable with curl.
- **Depends on:** Stage 4 (and the interface facts from Stage 0).
- **Touches:** `apps/service/src/audio/ffmpeg-decoder.ts`, `src/whisper/whisper-server-recognizer.ts`, `src/main.ts`, `apps/service/test/live.test.ts`, `mise.toml`, `README.md`.
- **Steps:**
  1. `FfmpegDecoder`: spawn ffmpeg with an argument array (never a shell string), cap the decoded length, map a non-zero exit or empty output to `UnreadableRecordingError`, a missing ffmpeg to a startup error that names the fix.
  2. `WhisperServerRecognizer`: spawn `whisper-server` on `127.0.0.1:<enginePort>` with the model and VAD files, wait for readiness, run one warm-up recognition of a short built-in phrase before reporting `ready` (the first inference after loading is slow while the GPU is prepared), send one multipart request per `recognise` with the fields recorded in Stage 0, apply the timeout, restart on unexpected exit up to the limit, stop the child on shutdown. A missing binary or model file, or a busy `enginePort`, is an explicit startup error. The child's output is not written to disk.
  3. `main.ts` uses the real adapters and handles `SIGINT` and `SIGTERM`.
  4. The live test; `mise run start` documented in the README as the single command.
- **Verify:** `KOBZAR_LIVE=1 pnpm --filter @kobzar/service test live` passes on the personal Mac; `mise run start`, then `curl -F recording=@phrase.m4a 127.0.0.1:4900/v1/transcripts` returns the Transcript; killing `whisper-server` by hand shows `loading` then `ready` again in `/v1/health`; `mise run check` passes.

### Stage 6: Samples

- **Goal:** Samples can be saved, edited, deleted and run through the API.
- **Depends on:** Stage 4 (Stage 5 for running them for real).
- **Touches:** `packages/core/src/diff.ts` and its test, `apps/service/src/sample-store.ts`, `src/routes/samples.ts`, `apps/service/test/samples.test.ts`.
- **Steps:**
  1. `diffWords` and `summariseRun` in core with unit tests (identical texts, a substituted term, missing and extra words, case and punctuation ignored, empty Transcript).
  2. `SamplesStore` with atomic writes; a Recording is decoded once on save to learn its length and to refuse an unreadable one.
  3. The six routes; `POST /v1/samples/:id/run` calls `transcribe()` through the queue and returns the result with the diff.
  4. Tests through `inject` for each route, including that deleting removes the Recording from disk and that nothing is written to `samples/` by `POST /v1/transcripts`.
- **Verify:** `mise run check` passes; with the service running, a Sample saved with curl is listed, runs and can be deleted.

### Stage 7: Test page

- **Goal:** the owner checks and tunes Kobzar from a browser; SPEC requirements 15 to 17.
- **Depends on:** Stages 5 and 6.
- **Touches:** `apps/test-page/**`, `apps/service/src/static.ts`, `mise.toml` (`dev` runs Vite with a proxy to the service; `start` builds the page first).
- **Steps:**
  1. Record panel: language switch (Russian preselected), an optional hints field, start and stop, elapsed time, then the Transcript, the Recording's length, Kobzar's `processingMs` and the round trip measured on the page, and a note when `dictionary.used < dictionary.total`. Errors are shown with their message. The recorded phrase stays in memory only.
  2. Save as Sample: an expected-text field prefilled with the Transcript, sending the phrase held in memory.
  3. Samples list: play, edit the expected text, delete (with a confirmation).
  4. Run all: one button; Samples are run one after another with progress; a table with the expected text, the Transcript, the differences marked, both times; totals from `summariseRun`. A Sample that fails shows its error and counts as failed without stopping the run.
  5. Health shown at the top; the record button is disabled unless the status is `ready`.
  6. Layout usable on an iPhone screen and on the Mac.
- **Verify:** `mise run check` passes; on the Mac at `http://localhost:4900` (a secure context for the microphone) in Chrome and Safari: record, see the Transcript, save a Sample, edit it, run all, delete it.

### Stage 8: Private network, the phone, and the owner's judgement

- **Goal:** the MVP's success criteria are met on the owner's devices.
- **Depends on:** Stage 7.
- **Touches:** `kobzar.yaml` (local), `README.md` ("Running Kobzar"), this file (results), the SPEC's Open Questions.
- **Steps:**
  1. Publish Kobzar inside the tailnet with HTTPS using `tailscale serve` on an HTTPS port the Dojo does not use (the Dojo takes 443 if set up per its plan; 8443 is the candidate, check `tailscale serve --help` for the allowed ports). Never `tailscale funnel`.
  2. Set `publicUrl` to that address and add the Dojo's address to `allowedOrigins`.
  3. On the iPhone in Safari and in Chrome: open the test page, allow the microphone, record, save.
  4. The owner records twenty to thirty Samples and fills `dictionary.txt`; run all; adjust the Dictionary order, the lead-in sentence, the invented phrases and, if needed, the model; run again.
  5. Check criterion 4 without the Dojo: from a page on another allowed origin (or with curl sending that `Origin`), `GET /v1/health` and `POST /v1/transcripts` succeed with CORS headers.
  6. Write the measured speed and accuracy and the final settings into this file, set the status, and propose the SPEC's Open Questions answers to the owner.
- **Verify:** the four success criteria of the SPEC, judged by the owner; `tailscale serve status` shows Kobzar only inside the tailnet; `lsof -iTCP -sTCP:LISTEN` shows ports 4900 and 4901 bound to `127.0.0.1`.

## Risks and Rollback

| Risk                                                                                                     | How it shows                                                          | Response                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Turbo misses the speed or accuracy target on the M5 Pro                                                  | Stage 0 measurements                                                  | The gate in Stage 0: nothing else is built until the owner picks among Core ML, `large-v3`, the fine-tune, or another `Recognizer`.                                    |
| The Dictionary outgrows the model prompt and the nine-in-ten target fails for entries that were left out | `dictionary.used < total` on the test page; misspelled terms in a run | Reorder the file so the important entries are on top; lean on hints from Clients. Replacement pairs after recognition would need a SPEC change and are not built here. |
| The token estimate is too generous and whisper.cpp silently cuts the start of the model prompt           | truncation warning in the engine's log (Stage 0 step 6)               | Lower the ratio constant; hints sit at the end and survive regardless.                                                                                                 |
| The `whisper-server` form fields differ from what this plan assumes                                      | Stage 0 step 4                                                        | Only `whisper-server-recognizer.ts` depends on them; the port does not change.                                                                                         |
| VAD drops quiet speech, or lets noise through and the model invents text                                 | Samples of quiet speech and of silence                                | Tune the VAD thresholds passed to the engine; extend `invented-phrases.txt`.                                                                                           |
| The first Recording after start is still slow despite the warm-up                                        | Stage 0 step 5; the first run of the test page                        | Measure the warm-up's effect in Stage 0 and make it longer if one short phrase is not enough.                                                                          |
| The engine crashes or hangs                                                                              | `/v1/health` shows `failed`; requests time out                        | Bounded restarts and the timeout are built in; restart Kobzar.                                                                                                         |
| A private file is committed to the public repository                                                     | `git status` before the owner's commit                                | `.gitignore` from Stage 0; the rule in `CLAUDE.md`; the agent never commits.                                                                                           |
| Safari records a container ffmpeg reads badly                                                            | `unreadable_recording` on the phone in Stage 8                        | Fix the recorder's choice of container in `recorder.ts`; the service already accepts anything ffmpeg reads.                                                            |

Rollback. Every stage is one commit made by the owner and adds files without migrating anything, so backing out is reverting that commit. Local state (`vendor/`, `models/`, `samples/`, `dictionary.txt`, `kobzar.yaml`) is outside git; deleting `vendor/` and `models/` and rerunning `mise run setup` rebuilds the engine. `tailscale serve reset` withdraws the tailnet address.

## Out of Scope

- The Dojo's microphone button (its own SPEC and plan).
- Replacement of words after recognition, any cleaning by a language model, any processing mode but `verbatim`.
- Streaming or live text; language detection; translation.
- A Core ML build, a Node binding to whisper.cpp, a second `Recognizer` (GigaAM, Parakeet, the fine-tune), unless the Stage 0 gate sends the owner there.
- A screen for editing the Dictionary; growing it automatically.
- Starting at login, a launch agent, keeping the Mac awake.
- Authentication, accounts, rate limits.
- A command-line runner for Samples, history of runs, charts.
- Automated tests of the test page; a CI pipeline.
