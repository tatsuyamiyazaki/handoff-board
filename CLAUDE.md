# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**handoff** — 人間とAIの共同タスクボード (a shared task board for human–AI collaboration).

A pnpm-monorepo TypeScript fullstack app. Issue #01 (walking skeleton) is implemented; remaining slices are in `docs/issues/`. The PRD is `docs/prd.md`; design rationale lives in `docs/adr/`; the domain glossary is `CONTEXT.md` (use those terms: ボード=Firestore collection, カンバン=UI, レーン=column, タスク=work item, オーナー≠actor). The dispatcher was removed per ADR-0005 (AI now pulls tasks via MCP); owner/department/role is a three-axis model per ADR-0006.

### Workspaces

- `shared/` — `@handoff/shared`: the single source of truth for the `Task` schema, status/owner/priority/action_type/department/role enums, the API envelope (`{success,data,error}` + `ok()`/`fail()`), and task-creation/edit domain logic (`validateCreateTask()` enforces required fields + `needs-ai|needs-human` initial-status rule + `P2/other/[]` defaults, throwing `ValidationError(422)`; `buildTask()` stamps `created_at`/`updated_at` + the `created` activity entry, with `id`/`now`/`actor` injected for determinism; `validateEditTask()`/`applyEdit()` mirror this for content edits). Per ADR-0006 (supersedes ADR-0004), the assignment model is three axes: `owner` (`human`/`cowork`/`claude-code` — the AI is the owner now), `department` (`DEPARTMENTS` enum, AI owners only), and `role` (`DEPARTMENT_ROLES` map, scoped to its department). `normalizeDepartment()` enforces `owner=human ⇒ department=null`; `normalizeRole()` enforces `role≠null ⇒ department≠null ∧ role ∈ DEPARTMENT_ROLES[department]` (both throw 422); `isAiOwner()`/`rolesForDepartment()` are shared helpers; `normalizeOptionalString()` trims `project`/`milestone` to null. Runtime helpers live here too — not strictly type-only — but there is no build step; consumed directly as `src/index.ts` via `workspace:*`.
- `api/` — `@handoff/api`: Fastify + Firebase Admin SDK. `buildApp({repository, auth})` wires deps for injection; `server.ts` is the entry. Deep modules: `auth-middleware` (`authenticate()` is async, throws `AuthError(status)`; dual auth per ADR-0001, machine `X-Board-Token` path and human Firebase Bearer path both done as of #02 — human path verifies `Authorization: Bearer <idToken>` through an injectable `TokenVerifier` (`FirebaseTokenVerifier` for prod, fakes in tests) and checks the `ALLOWED_EMAILS` allowlist; `actor` resolves to the user's email for humans, token-type for machines), `task-repository` (`TaskRepository` interface — `findAll`/`create` so far; `InMemoryTaskRepository` for tests/dev, `FirestoreTaskRepository` wired for prod/emulator). Routes: `GET /api/board` (#01) and `POST /api/board` (#03 — validates via shared `validateCreateTask`, builds via `buildTask`, returns 201; `ValidationError`→422 in the app error handler; `id`/`clock` injectable through `AppDeps` for deterministic tests). The transition engine (ADR-0002) is implemented in `shared/src/transition.ts` (`applyTransition`/`allowedTransitions`/`isHandoff` — full graph incl. blocked in/out, handoff_note/blocked_reason rules), but the API route exposing transitions is not implemented yet.
- `web/` — `@handoff/web`: Vite + React SPA. `App` → `BoardControls` (summary + filters) + `Board` → `Lane` (`<section aria-label={status}>`) → `Card`; `api-client.fetchBoard()` unwraps the envelope. Firebase Google sign-in (#02) lives in `auth/firebase-auth` (wiring only — needs `VITE_FIREBASE_*`; gracefully disabled when unset) and the pure `auth/auth-headers` picks `Authorization: Bearer` when signed in, else the dev `X-Board-Token`. `CreateTaskDialog` (#03) validates with shared `validateCreateTask` before POSTing via `api-client.createTask`; its `createTask` is prop-injected for testing, and `App` appends the created task to the board on success. Per ADR-0006: `Card` renders an assignee dot from `owner` (`HUMAN`/`COWORK`/`CLAUDE-CODE`), a colour-coded `department` chip (per-department colour via `data-department`), and a `role` chip — all shown when set — plus `project`/`milestone`; `CreateTaskDialog`/`EditDialog` share the `DepartmentField` and department-linked `RoleField` selects (shown only for AI owners; cascade clears department+role on `owner→human` and resets role on department change) plus `project`/`milestone` inputs; the pure `lib/board-view.ts` (`summarizeBoard`/`filterTasks`/`distinctValues`/`ALL`) backs `BoardControls`' human-assigned/in-progress/blocked counts and owner/department/project/milestone filters (no role filter), with filter state held in `App` (local state, not URL). Polling/lane-counts are #08.
- `desktop/` — `@handoff/desktop`: Electron デスクトップアプリ（設計: docs/specs/2026-07-14-desktop-app-design.md、手順: docs/DESKTOP.md）。renderer は `@handoff/web` のビルドを `app://` スキームで同梱し、`window.handoffDesktop` ブリッジ（shared の `HandoffDesktopBridge` 型）の有無で実行ボタン・ログパネル・設定画面を出し分ける。main プロセスの深いモジュール: `cli-runner`（spawn 注入・引数クォート・キャンセル）、`settings`/`settings-core`（userData/settings.json、422 検証）、`auth`/`auth-core`（PKCE ループバック OAuth → Firebase `signInWithCredential`）。ステータス遷移はアプリではなく CLI が handoff-mcp 経由で行う（ADR-0005 維持）。
_(The `dispatcher/` workspace was removed per [ADR-0005](docs/adr/0005-remove-dispatcher-pull-via-mcp.md). AI executors (Cowork / Claude Code) pull tasks locally via the handoff-mcp MCP server instead of a server-side push batch.)_

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
| Dev desktop（HMR推奨） | `pnpm dev:desktop`（`desktop/dev.mjs` が Vite dev server を起動→応答後に Electron を `HANDOFF_DEV_SERVER_URL` 指定で起動。renderer は HMR で即反映、web/dist ビルド不要） |
| Dev desktop（バンドル版） | `pnpm dev:desktop:bundle`（web を再ビルドして `web/dist` を `app://` で読み込む。停留バンドル回避のため毎回 web を先にビルド） |
| Web build | `pnpm --filter @handoff/web build` |
| Desktop インストーラ | `pnpm package:desktop` |
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
