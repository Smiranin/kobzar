# Kobzar

A personal speech-to-text service on the owner's Mac: a Client sends a Recording, Kobzar returns a Transcript. Recognition is Whisper in whisper.cpp's `whisper-server`, run by Kobzar as a child process. The vocabulary is in `GLOSSARY.md`; use its words in code, comments and docs. The SPEC and the implementation plan are in `features/kobzar-mvp/`, the decisions in `adr/`. Read `features/kobzar-mvp/PLAN.md` before any change: it fixes the architecture, the contract and the stages.

## Layout

- `packages/core`: the contract schemas, error codes, ports (`Recognizer`, `AudioDecoder`) and the pure rules (Dictionary, model prompt, invented phrases, word diff). Pure TypeScript, no Node-only imports (it is also bundled into the test page).
- `apps/service`: Fastify composition root, the queue, the Samples store (`src/sample-store.ts`; no folder may be named `samples/`, git ignores every such folder), and the adapters `FfmpegDecoder` and `WhisperServerRecognizer`.
- `apps/test-page`: one page in plain TypeScript built with Vite, served by the service. For checking and tuning Kobzar, not for daily use.
- `scripts/setup-engine.sh`: builds whisper.cpp at a pinned tag and downloads the models into `models/`.

## Commands

- `mise run setup`: install dependencies, build whisper.cpp, download the models (Node and pnpm versions come from `mise.toml`).
- `mise run dev`: service on `127.0.0.1:4900` plus the Vite dev server on `localhost:5173` (hot reload for the page only; the service is not watched, because a restart reloads the model).
- `mise run start`: the single command that runs Kobzar.
- `mise run check`: typecheck, lint, format check and tests. Must pass at the end of every stage.
- `pnpm --filter @kobzar/core test`: tests of one package. `KOBZAR_LIVE=1 pnpm --filter @kobzar/service test live`: the live test with the real engine (it uses engine port 4911, so it runs beside a running Kobzar).

## Hard rules

- The repository is public. Never commit `kobzar.yaml`, `dictionary.txt`, `samples/`, `mic/` or any audio of the owner's voice. Check `git status --ignored` after adding a new local file.
- The agent never commits and never pushes; the owner does.
- Never bind Kobzar or `whisper-server` to a public interface; `host` stays `127.0.0.1`. Never use `tailscale funnel`.
- Never log a Transcript, hints or the Dictionary. Recordings are deleted as soon as their Transcript is returned; the only stored audio is that of Samples.
- Nothing is sent to an outside service. The internet is used only by `setup-engine.sh` to fetch whisper.cpp and the models.
- Do not install Tailscale on the work laptop; it belongs to the personal Mac only.

## Development Philosophy & Rules

### Mandatory Workflow: Design Before Implementation

**CRITICAL: Never jump straight to implementation. Always follow this sequence:**

#### 1. Problem Analysis Phase

When asked for a bug fix, new feature, or code change — **first analyze and understand:**

- What is the actual problem?
- What is the root cause?
- What are the constraints and requirements?

**Present analysis clearly and wait for confirmation before proceeding.**

#### 2. Design Phase

After problem analysis is confirmed, propose solutions:

**Always provide 2-3 solution options:**

- Option 1: [Approach A] — pros, cons, trade-offs
- Option 2: [Approach B] — pros, cons, trade-offs
- Option 3: [Approach C] — pros, cons, trade-offs (if applicable)

**Recommendation:** Clearly state which option you recommend and why.
**WAIT for approval before moving to implementation.**

#### 3. Implementation Phase

Only after design is approved:

- Analyze existing code patterns in the project
- Follow those patterns in implementation
- Present the implementation plan
- Wait for final approval before applying changes

### Anti-Patterns: What NOT to Do

**Never propose workarounds or "quick fixes" as the only solution:**

- No hardcoded values instead of proper configuration
- No monkey patching or overriding library internals
- No global state without justification
- No copy-pasted code instead of proper abstraction
- No ignoring errors or empty catch blocks
- No magic numbers/strings without named constants
- No "TODO: fix this later" in production code

A quick workaround may be **one of the options** (never the only one) if clearly labeled as "Quick workaround (not recommended)" with trade-offs explained.

### Code Quality Standards

**Error Handling:** Handle errors explicitly with meaningful messages. Never silently swallow exceptions.

**Code Patterns:** Analyze the existing codebase first. Follow established patterns. Maintain consistency with surrounding code.

**Code Duplication:** Avoid repeating code. Extract common logic. Apply DRY principle.

**Documentation:** Document "why" not "what". Add comments for non-obvious decisions. Use JSDoc where appropriate.

**Readability:** Descriptive names, focused functions, clarity over cleverness.

### Iterative Refinement

If feedback suggests the approach needs adjustment:

- Don't immediately implement a different solution
- First revise the design based on feedback
- Present updated design options
- Wait for approval before implementing

**Quality and correctness are more important than speed.**
