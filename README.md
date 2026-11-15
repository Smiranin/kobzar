# Kobzar

A personal speech-to-text service that runs on the owner's own Mac. A Client sends a
Recording of speech and gets its Transcript back: Russian with English technical terms, or
plain English, with punctuation. Recognition is Whisper `large-v3-turbo` in whisper.cpp,
entirely on the Mac; nothing is sent anywhere.

The name is the Ukrainian word for a wandering singer who carried spoken words from place to
place.

## Vocabulary

The same words are used in the code, the docs and the test page. Full definitions are in
[`GLOSSARY.md`](GLOSSARY.md).

| Term           | Meaning                                                                     |
| -------------- | --------------------------------------------------------------------------- |
| **Kobzar**     | The service: turns a Recording into a Transcript.                           |
| **Recording**  | One piece of recorded speech sent to Kobzar. Not kept after its Transcript. |
| **Transcript** | The text produced from one Recording, in the language that was spoken.      |
| **Dictionary** | The owner's list of words Kobzar must spell correctly.                      |
| **Samples**    | Saved Recordings with the text they should produce, used to judge Kobzar.   |
| **Client**     | A program that sends Recordings to Kobzar (the Dojo, the test page).        |

## What is private

The repository is public. These stay on the Mac and are ignored by git:

- `kobzar.yaml`: the settings (they hold tailnet addresses). The template is `kobzar.example.yaml`.
- `dictionary.txt`: the owner's Dictionary. The template is `dictionary.example.txt`.
- `samples/`: the Samples, audio and expected texts.
- `mic/`: any of the owner's own recordings kept for experiments.
- `vendor/`, `models/`: the whisper.cpp build and the model files (about 5 GB).

## Setup

Needs [mise](https://mise.jdx.dev), Xcode command line tools, and `brew install cmake ffmpeg`.

```sh
mise run setup   # dependencies, whisper.cpp build, model download
mise run check   # typecheck, lint, format check, tests
```

## Running Kobzar

```sh
mise run start
```

That is the single command: it builds the test page, starts the service on
`http://127.0.0.1:4900`, and the service starts `whisper-server` on `127.0.0.1:4901` and loads
the model (about 4 seconds; `/v1/health` says `loading` until then, `ready` after). Open
`http://localhost:4900` on the Mac for the test page. Ctrl-C stops both.

For the settings, copy `kobzar.example.yaml` to `kobzar.yaml`. For the Dictionary, copy
`dictionary.example.txt` to `dictionary.txt` and put the words Kobzar must spell correctly at
the top: the model prompt holds about 400 characters, and entries are taken from the top. An
edit applies to the next Recording, without a restart. To try `large-v3` instead of
`large-v3-turbo`, set `model: large-v3` and restart.

`mise run dev` runs the service and the Vite dev server at `http://localhost:5173` with hot
reload for the page; a change to the service needs a restart.

### From the phone

A phone browser records from the microphone only on an HTTPS page, so Kobzar is published
inside the tailnet with `tailscale serve` (never `tailscale funnel`):

```sh
tailscale serve --bg --https=8443 http://127.0.0.1:4900
tailscale serve status            # check: the address, tailnet only
```

Then put that address into `kobzar.yaml` as `publicUrl` (for example
`https://my-mac.tail1234.ts.net:8443`, no trailing slash), add the Dojo's address to
`allowedOrigins`, and restart Kobzar. `tailscale serve reset` withdraws the address.

### For a Client

- `GET /v1/health`: `{ status: 'loading' | 'ready' | 'failed', version, defaultLanguage, languages, modes, maxRecordingSeconds }`.
- `POST /v1/transcripts`, multipart: `recording` (any container ffmpeg reads), optional
  `language` (`ru` or `en`), `hints` (a JSON array of at most 50 strings of at most 64
  characters), `mode` (`verbatim`). Answers
  `{ text, language, mode, durationMs, processingMs, dictionary: { total, used } }`.
- Every failure is `{ error: { code, message } }`; the codes are in
  `packages/core/src/contract/errors.ts`.
- Browser requests are accepted only from the test page, `publicUrl` and `allowedOrigins`.

```sh
curl -F recording=@phrase.m4a -F language=ru -F 'hints=["Sensei"]' http://127.0.0.1:4900/v1/transcripts
```

## Documents

- [`features/kobzar-mvp/SPEC.md`](features/kobzar-mvp/SPEC.md): what the MVP must do.
- [`features/kobzar-mvp/PLAN.md`](features/kobzar-mvp/PLAN.md): how it is built, stage by stage, with the Stage 0 measurements.
- [`adr/`](adr/): the architecture decisions.

## License

Apache 2.0, see [`LICENSE`](LICENSE).
