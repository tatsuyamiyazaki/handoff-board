# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**handoff** — 人間とAIの共同タスクボード (a shared task board for human–AI collaboration).

A pnpm-monorepo TypeScript fullstack app. Issue #01 (walking skeleton) is implemented; remaining slices are in `docs/issues/`. The PRD is `docs/prd.md`; design rationale lives in `docs/adr/`; the domain glossary is `CONTEXT.md` (use those terms: ボード=Firestore collection, カンバン=UI, レーン=column, タスク=work item, オーナー≠actor). The dispatcher was removed per ADR-0005 (AI now pulls tasks via MCP); owner/department/role is a three-axis model per ADR-0006.

### Workspaces

- `shared/` — `@handoff/shared`: the single source of truth for the `Task` schema, the six-value status enum (`needs-ai` / `needs-human` / `in-progress` / `in-review` / `done` / `blocked`), owner/priority/action_type/department/role enums, and the API envelope. `Task` records `created_by_type`, `review_cycles`, and nullable `review_cycle_limit`; `ActivityEntry` records optional `session` plus structured transition `from`/`to`. Creation stamps actor and auth type and rejects `review_cycle_limit` in the create body (422; details-route only), edit validation normalizes assignment metadata and the review-limit input (the API enforces human-only changes) while `applyEdit` forbids owner changes during review (in-review and review-interrupted blocked), and `transition.ts` owns the review graph, handoff/block requirements, review-cycle limit and human reset rule, exact-actor self-review exclusion (with the human-owned/human-actor exception), and review-interruption recovery predicate; sendbacks from review-interrupted blocked count as review cycles (limit + self-review rules apply), closing the in-review→blocked→needs-ai detour. Runtime helpers are consumed directly as `src/index.ts` via `workspace:*` with no build step.
- `api/` — `@handoff/api`: Fastify + Firebase Admin SDK with injectable app, repository, auth, clock, IDs, and review-limit dependencies. Dual auth resolves human email or machine actor; machine tokens must be own properties of the configured map and `BOARD_TOKENS` actor values are fail-fast validated as whitespace/control-free `owner[:function]`. `X-Agent-Session` must be single and comma-free, is trimmed, blank-normalized to null, capped at 128 characters, and recorded on activities; `REVIEW_CYCLE_LIMIT` supplies the global default (5). Human `GET /api/board` uses the ADR-0011 OR scope (`created_by` is the caller or `created_by_type=machine`), while machine callers see all tasks; in-memory and Firestore repositories implement the same rule. Implemented routes are `GET /api/board`, `POST /api/board`, `PATCH /api/board/:id` (status transition), `PATCH /api/board/:id/details`, `DELETE /api/board/:id`, and `POST /api/board/:id/complete`.
- `web/` — `@handoff/web`: Vite + React SPA. `App` → `BoardControls` + five-lane `Board` (To Do / In Progress / In Review / Blocked / Done) → `Lane` → `Card`; unauthenticated users see only the sign-in shell. In-progress cards request review instead of completing directly; in-review cards can complete or be explicitly sent back, and review-interrupted blocked tasks alone can recover to In Review without a handoff note. Cards render owner (`HUMAN`/`COWORK`/`CLAUDE-CODE`/`CODEX`), department, role, project, and milestone metadata; creation/edit dialogs enforce the shared assignment rules, and BoardControls provides summary counts and owner/department/project/milestone filters.
- `desktop/` — `@handoff/desktop`: Electron デスクトップアプリ（設計: docs/specs/2026-07-14-desktop-app-design.md、手順: docs/DESKTOP.md）。renderer は `@handoff/web` のビルドを `app://` スキームで同梱し、`window.handoffDesktop` ブリッジ（shared の `HandoffDesktopBridge` 型）の有無で実行ボタン・ログパネル・設定画面を出し分ける。main プロセスの深いモジュール: `cli-runner`（spawn 注入・引数クォート・キャンセル）、`settings`/`settings-core`（userData/settings.json、422 検証）、`auth`/`auth-core`（PKCE ループバック OAuth → Firebase `signInWithCredential`）。ステータス遷移はアプリではなく CLI が handoff-mcp 経由で行う（ADR-0005 維持）。
_(The `dispatcher/` workspace was removed per [ADR-0005](docs/adr/0005-remove-dispatcher-pull-via-mcp.md). AI executors (Cowork / Claude Code / Codex) pull tasks locally via the handoff-mcp MCP server instead of a server-side push batch.)_

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
- Config via env (`.env.example`): `BOARD_TOKENS` (token→validated `owner[:function]` actor map), `REVIEW_CYCLE_LIMIT` (positive safe integer, default 5), `ALLOWED_EMAILS` / `ALLOWED_EMAIL_DOMAINS` (human allowlists), and `CORS_ORIGIN` (allowed web origins). Never hardcode secrets.

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
