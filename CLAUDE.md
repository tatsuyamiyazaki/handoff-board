# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**handoff** — 人間とAIの共同タスクボード (a shared task board for human–AI collaboration).

A pnpm-monorepo TypeScript fullstack app. Issue #01 (walking skeleton) is implemented; remaining slices are in `docs/issues/`. The PRD is `docs/prd.md`; design rationale lives in `docs/adr/`; the domain glossary is `CONTEXT.md` (use those terms: ボード=Firestore collection, カンバン=UI, レーン=column, タスク=work item, ディスパッチャー=local batch, オーナー≠actor).

### Workspaces

- `shared/` — `@handoff/shared`: the single source of truth for the `Task` schema, status/owner/priority/action_type enums, and the API envelope (`{success,data,error}` + `ok()`/`fail()`). Type-only, no build step — consumed directly as `src/index.ts` via `workspace:*`.
- `api/` — `@handoff/api`: Fastify + Firebase Admin SDK. `buildApp({repository, auth})` wires deps for injection; `server.ts` is the entry. Deep modules: `auth-middleware` (`authenticate()` throws `AuthError(status)`; dual auth per ADR-0001, machine `X-Board-Token` path done, human Firebase Bearer path is #02), `task-repository` (`TaskRepository` interface — `InMemoryTaskRepository` for tests/dev, `FirestoreTaskRepository` wired for prod/emulator). `transition-engine` (ADR-0002) arrives in #04.
- `web/` — `@handoff/web`: Vite + React SPA. `Board` → `Lane` (`<section aria-label={status}>`) → `Card`; `api-client.fetchBoard()` unwraps the envelope. Polling/lane-counts are #08.
- `dispatcher/` — `@handoff/dispatcher`: placeholder; implemented in #07.

ESM throughout; imports use explicit `.js` extensions; tsconfig is `moduleResolution: Bundler` + `verbatimModuleSyntax`.

### Commands

| Task | Command |
|---|---|
| Install | `pnpm install` |
| All tests | `pnpm -r test` |
| Single package tests | `pnpm --filter @handoff/api test` (or `@handoff/web`) |
| Watch a package | `pnpm --filter @handoff/api test:watch` |
| Typecheck all | `pnpm -r typecheck` |
| Dev API | `pnpm dev:api` (no Firestore emulator → falls back to in-memory + `devSeed`) |
| Dev web | `pnpm dev:web` |
| Web build | `pnpm --filter @handoff/web build` |
| E2E | `pnpm --filter @handoff/web e2e` |

### Environment notes

- Unit/integration tests run **without** Java/Firestore emulator: `api` uses `InMemoryTaskRepository`, and the emulator-backed `FirestoreTaskRepository` test is `describe.skip` until a JVM + firebase CLI are available.
- Config via env (`.env.example`): `BOARD_TOKENS` (token→actor JSON map), `ALLOWED_EMAILS` (human allowlist, #02). Never hardcode secrets.

## Working methodology (`.claude/skills/engineering/`)

This repo carries an installed set of engineering skills (the "Matt Pocock" collection) under `.claude/` that define how work should flow here. They are not committed to git but are part of the working tree. Key ones, invoked as slash commands:

- **to-prd** / **to-issues** — turn a conversation or plan into a PRD, then break it into independently-grabbable issues using vertical slices.
- **triage** — move issues through a state machine of triage-role labels.
- **tdd** — red-green-refactor, one vertical slice at a time (preferred for new features and bug fixes).
- **diagnose** — disciplined loop for hard bugs/perf regressions: reproduce → minimise → hypothesise → instrument → fix → regression-test.
- **prototype** — throwaway prototype to flesh out a design before committing to it.
- **improve-codebase-architecture** / **zoom-out** / **grill-with-docs** — architecture deepening, higher-level orientation, and sharpening plans against the domain model.

Some of these (`to-issues`, `to-prd`, `triage`) have a **hard dependency** on per-repo config (issue tracker, triage label vocabulary, domain doc layout). If that config is missing, run **setup-matt-pocock-skills** first — otherwise their output targets the wrong tracker/labels. The other skills degrade gracefully without it. See `.claude/docs/adr/0001-*.md` for the rationale.

## Domain language & decisions

- `.claude/CONTEXT.md` holds the domain glossary (canonical terms, e.g. *Issue tracker* / *Issue* / *Triage role*, and which phrasings to avoid). Consult and update it when terminology shifts.
- `.claude/docs/adr/` holds architecture decision records. Check the relevant ADR before changing behavior in the area it covers, and add a new ADR for non-obvious decisions.
