# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**handoff** — 人間とAIの共同タスクボード (a shared task board for human–AI collaboration).

A pnpm-monorepo TypeScript fullstack app. Issue #01 (walking skeleton) is implemented; remaining slices are in `docs/issues/`. The PRD is `docs/prd.md`; design rationale lives in `docs/adr/`; the domain glossary is `CONTEXT.md` (use those terms: ボード=Firestore collection, カンバン=UI, レーン=column, タスク=work item, ディスパッチャー=local batch, オーナー≠actor).

### Workspaces

- `shared/` — `@handoff/shared`: the single source of truth for the `Task` schema, status/owner/priority/action_type/agent enums, the API envelope (`{success,data,error}` + `ok()`/`fail()`), and task-creation/edit domain logic (`validateCreateTask()` enforces required fields + `needs-ai|needs-human` initial-status rule + `P2/other/[]` defaults, throwing `ValidationError(422)`; `buildTask()` stamps `created_at`/`updated_at` + the `created` activity entry, with `id`/`now`/`actor` injected for determinism; `validateEditTask()`/`applyEdit()` mirror this for content edits). Per ADR-0004, `Task` carries `agent` (specific AI, AGENTS enum) as a metadata axis under `owner`, plus optional `project`/`milestone` labels; `normalizeAgent()` enforces the `owner=human ⇒ agent=null` invariant (throws 422 otherwise) and `normalizeOptionalString()` trims `project`/`milestone` to null. Runtime helpers live here too — not strictly type-only — but there is no build step; consumed directly as `src/index.ts` via `workspace:*`.
- `api/` — `@handoff/api`: Fastify + Firebase Admin SDK. `buildApp({repository, auth})` wires deps for injection; `server.ts` is the entry. Deep modules: `auth-middleware` (`authenticate()` is async, throws `AuthError(status)`; dual auth per ADR-0001, machine `X-Board-Token` path and human Firebase Bearer path both done as of #02 — human path verifies `Authorization: Bearer <idToken>` through an injectable `TokenVerifier` (`FirebaseTokenVerifier` for prod, fakes in tests) and checks the `ALLOWED_EMAILS` allowlist; `actor` resolves to the user's email for humans, token-type for machines), `task-repository` (`TaskRepository` interface — `findAll`/`create` so far; `InMemoryTaskRepository` for tests/dev, `FirestoreTaskRepository` wired for prod/emulator). Routes: `GET /api/board` (#01) and `POST /api/board` (#03 — validates via shared `validateCreateTask`, builds via `buildTask`, returns 201; `ValidationError`→422 in the app error handler; `id`/`clock` injectable through `AppDeps` for deterministic tests). `transition-engine` (ADR-0002) arrives in #04.
- `web/` — `@handoff/web`: Vite + React SPA. `App` → `BoardControls` (summary + filters) + `Board` → `Lane` (`<section aria-label={status}>`) → `Card`; `api-client.fetchBoard()` unwraps the envelope. Firebase Google sign-in (#02) lives in `auth/firebase-auth` (wiring only — needs `VITE_FIREBASE_*`; gracefully disabled when unset) and the pure `auth/auth-headers` picks `Authorization: Bearer` when signed in, else the dev `X-Board-Token`. `CreateTaskDialog` (#03) validates with shared `validateCreateTask` before POSTing via `api-client.createTask`; its `createTask` is prop-injected for testing, and `App` appends the created task to the board on success. Per ADR-0004: `Card` renders an assignee dot (`HUMAN` for human owners, the `agent` value e.g. `CODEX` for AI owners, `AI` fallback) and shows `project`/`milestone` when set; `CreateTaskDialog`/`EditDialog` share the `AgentField` select (shown only for AI owners) plus `project`/`milestone` inputs; the pure `lib/board-view.ts` (`summarizeBoard`/`filterTasks`/`distinctValues`/`ALL`) backs `BoardControls`' human-assigned/in-progress/blocked counts and owner/project/milestone filters, with filter state held in `App` (local state, not URL). Polling/lane-counts are #08.
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

### Deployment

Live as of 2026-06-02: API on **Cloud Run** (`handoff-api`, `asia-northeast1`, Firestore-backed) and web on **Firebase Hosting** (`https://handoff-dashboard.web.app`), GCP project `handoff-dashboard`. The full infra map, env/secrets, and redeploy commands live in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — read it before touching deploy/infra. Key prod gotcha: on Cloud Run, Firestore is selected via `USE_FIRESTORE`/`K_SERVICE` and creds come from managed ADC (`applicationDefault()`), not `GOOGLE_APPLICATION_CREDENTIALS`.

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
