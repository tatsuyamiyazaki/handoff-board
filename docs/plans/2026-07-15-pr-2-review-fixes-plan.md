# PR #2 Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve every actionable PR #2 review thread without regressing the Electron desktop app, while recording reasoned non-changes for pnpm `allowBuilds` and the optional Google client secret.

**Architecture:** Keep `@handoff/shared` as the bridge contract, add sequence-aware log snapshots to reconcile renderer backfill with live events, and keep Electron coordination logic thin around tested pure helpers. Vite injects CSP only for production builds, while bootstrap failures become visible renderer state instead of blocking React mount.

**Tech Stack:** TypeScript, pnpm 11.13.0, Electron 36, React 19, Vite 6, Vitest 3, Testing Library

---

## File map

- `package.json`, `Dockerfile`, `pnpm-workspace.yaml`: pin pnpm 11.13.0 and retain the supported `allowBuilds` map.
- `desktop/src/main/auth-core.ts`, `auth-core.test.ts`, `auth.ts`: one-shot OAuth callback gate.
- `shared/src/desktop-bridge.ts`: authoritative sequence-aware run-log contract.
- `desktop/src/main/cli-runner.ts`, `cli-runner.test.ts`, `index.ts`, `desktop/src/preload/index.ts`: log sequencing and cancellation terminal-state rules.
- `web/src/desktop/useRunEvents.ts`, `RunPanel.test.tsx` and bridge fakes: lossless snapshot/live reconciliation.
- `web/src/desktop/bootstrap.tsx`, `bootstrap.test.tsx`, `web/src/main.tsx`: visible fallback when initial settings loading fails.
- `web/src/csp.ts`, `csp.test.ts`, `web/vite.config.ts`, `web/index.html`: production-only CSP injection.
- `web/src/desktop/DesktopSettingsDialog.tsx`, `DesktopSettingsDialog.test.tsx`: derive AI owners from shared constants.
- `docs/DESKTOP.md`: precise OAuth/Firebase, client-secret, pnpm, and release verification guidance.

### Task 1: Pin the supported pnpm toolchain

**Files:**
- Modify: `package.json`
- Modify: `Dockerfile`
- Verify: `pnpm-workspace.yaml`

- [ ] **Step 1: Run a failing configuration assertion**

Run a PowerShell assertion that requires `package.json.packageManager === "pnpm@11.13.0"`, Dockerfile pnpm `11.13.0`, and `allowBuilds` to remain present.

Expected: FAIL because `packageManager` is absent and Dockerfile still uses pnpm 10.33.0.

- [ ] **Step 2: Apply the minimal configuration change**

Add `"packageManager": "pnpm@11.13.0"` to root `package.json` and update the Dockerfile Corepack preparation to `pnpm@11.13.0`. Do not replace `allowBuilds`; pnpm 11 uses it and removed `onlyBuiltDependencies`.

- [ ] **Step 3: Verify configuration and install compatibility**

Run the configuration assertion again and `pnpm install --frozen-lockfile`.

Expected: assertion PASS and install exit 0.

- [ ] **Step 4: Commit**

Commit message: `chore: pin pnpm 11 for desktop packaging`

### Task 2: Make the OAuth loopback callback one-shot

**Files:**
- Modify: `desktop/src/main/auth-core.test.ts`
- Modify: `desktop/src/main/auth-core.ts`
- Modify: `desktop/src/main/auth.ts`

- [ ] **Step 1: Write the failing gate test**

Add a test proving a callback gate accepts its first `claim()` and rejects every later claim.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @handoff/desktop test -- src/main/auth-core.test.ts`

Expected: FAIL because the gate helper does not exist.

- [ ] **Step 3: Implement and wire the gate**

Add a minimal closure-based `createOneShotGate()` helper. In `auth.ts`, claim before parsing the callback; if already claimed, respond 204 and return without resolving/rejecting the sign-in promise.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the focused desktop test again.

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `fix(desktop): ignore repeated oauth callbacks`

### Task 3: Add sequence-aware log snapshots in main/preload/shared

**Files:**
- Modify: `shared/src/desktop-bridge.ts`
- Modify: `desktop/src/main/cli-runner.test.ts`
- Modify: `desktop/src/main/cli-runner.ts`
- Modify: `desktop/src/main/index.ts`
- Modify: `desktop/src/preload/index.ts`
- Modify: bridge fakes under `web/src/**/*.test.tsx`

- [ ] **Step 1: Write failing runner tests**

Assert stdout/stderr events receive monotonically increasing `sequence` values and `getLogSnapshot(runId)` returns `{ log, lastSequence }` from one run entry.

- [ ] **Step 2: Run the focused runner test and verify RED**

Run: `pnpm --filter @handoff/desktop test -- src/main/cli-runner.test.ts`

Expected: FAIL because events lack sequence and snapshots do not exist.

- [ ] **Step 3: Update the shared contract and minimal runner state**

Add `RunLogSnapshot`, add `sequence` to stdout/stderr `RunEvent`, track `lastSequence` per run, and expose `getLogSnapshot`. Wire IPC/preload `getRunLog` to the snapshot type. Update existing bridge fakes to return `{ log: '', lastSequence: 0 }`.

- [ ] **Step 4: Run desktop tests and the migrated-package typechecks**

Run: `pnpm --filter @handoff/desktop test`, `pnpm --filter @handoff/shared typecheck`, and `pnpm --filter @handoff/desktop typecheck`.

Expected: PASS. Do not run the repository-wide typecheck until Task 4 migrates `useRunEvents` to the snapshot contract.

- [ ] **Step 5: Commit**

Commit message: `fix(desktop): sequence run log snapshots`

### Task 4: Reconcile renderer backfill with buffered live chunks

**Files:**
- Modify: `web/src/desktop/RunPanel.test.tsx`
- Modify: `web/src/desktop/useRunEvents.ts`

- [ ] **Step 1: Write a failing race regression test**

Use a deferred `getRunLog()` promise and emit two buffered events while it is pending: one with `sequence <= lastSequence` and one with `sequence > lastSequence`. Resolve the snapshot, then assert the first buffered chunk is not duplicated and the second is not lost.

Also cover a run first seen through a live event after `listRuns()` resolves; its buffer-only log must survive initialization even though no snapshot entry exists.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @handoff/web test -- src/desktop/RunPanel.test.tsx`

Expected: FAIL because the current object spread discards or duplicates live history.

- [ ] **Step 3: Implement buffered reconciliation**

Subscribe before loading snapshots, buffer live chunks per run with sequence metadata until initialization completes, then set each log to `snapshot.log + buffered(sequence > lastSequence)`, capped to the existing client log limit. Subsequent events append normally.

- [ ] **Step 4: Run focused and full web tests**

Run: focused test, `pnpm --filter @handoff/web test`, then `pnpm -r typecheck`.

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `fix(web): preserve logs during run backfill`

### Task 5: Make cancellation races deterministic

**Files:**
- Modify: `desktop/src/main/cli-runner.test.ts`
- Modify: `desktop/src/main/cli-runner.ts`

- [ ] **Step 1: Write failing cancellation tests**

Cover: child exit during pending `killTree`; `killTree` rejection with numeric `128` and string `"128"`; other kill failure; repeated cancel while cancellation is pending. Assert cancellation wins for the first cases, other failure becomes failed and rejects, and exactly one terminal status event is emitted.

- [ ] **Step 2: Run focused runner tests and verify RED**

Expected: existing code marks code 128 as failed and does not cover deterministic terminal emission.

- [ ] **Step 3: Implement minimal terminal precedence**

Keep `cancelling` as the gate, treat numeric/string code 128 as already exited and finish cancelled, preserve failed+throw for other errors, and rely on `finish()`'s running-status guard for exactly-once terminal emission.

- [ ] **Step 4: Run focused desktop tests and verify GREEN**

Run: `pnpm --filter @handoff/desktop test -- src/main/cli-runner.test.ts`.

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `fix(desktop): stabilize cancellation races`

### Task 6: Render a bootstrap error instead of a white screen

**Files:**
- Create: `web/src/desktop/bootstrap.tsx`
- Create: `web/src/desktop/bootstrap.test.tsx`
- Modify: `web/src/main.tsx`

- [ ] **Step 1: Write failing bootstrap tests**

Test that successful settings loading applies `apiBaseUrl`, failure returns a Japanese user-facing message, and the error banner renders with `role="alert"`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @handoff/web test -- src/desktop/bootstrap.test.tsx`

Expected: FAIL because the helper/component do not exist.

- [ ] **Step 3: Implement bootstrap fallback**

Move settings initialization into a helper that catches bridge failures. Always create the React root and render `App`; render the returned bootstrap error above it when present.

- [ ] **Step 4: Run focused and full web tests**

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `fix(web): show desktop bootstrap failures`

### Task 7: Inject CSP only in production builds

**Files:**
- Create: `web/src/csp.ts`
- Create: `web/src/csp.test.ts`
- Modify: `web/vite.config.ts`
- Modify: `web/index.html`

- [ ] **Step 1: Write failing CSP tests**

Test a pure HTML transformer that inserts one CSP meta tag, includes `https:` images and the configured Firebase auth domain in `frame-src`, and leaves source HTML free of a static CSP.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @handoff/web test -- src/csp.test.ts`

Expected: FAIL because the transformer does not exist.

- [ ] **Step 3: Implement the production-only Vite plugin**

Remove CSP from source `index.html`. Export a small transformer/plugin and include it only when Vite `command === 'build'`, using `loadEnv()` to read `VITE_FIREBASE_AUTH_DOMAIN`. Keep `script-src 'self'`, permit HTTPS images, and allow the configured auth frame origin.

- [ ] **Step 4: Verify tests and both HTML modes**

Run focused test and `pnpm --filter @handoff/web build`. Assert `web/index.html` has no CSP and `web/dist/index.html` has exactly one CSP.

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `fix(web): inject csp only for production`

### Task 8: Derive AI owners and finish operational documentation

**Files:**
- Create: `web/src/desktop/owner-options.ts`
- Create: `web/src/desktop/owner-options.test.ts`
- Modify: `web/src/desktop/DesktopSettingsDialog.test.tsx`
- Modify: `web/src/desktop/DesktopSettingsDialog.tsx`
- Modify: `docs/DESKTOP.md`

- [ ] **Step 1: Write the failing pure owner-derivation test**

Define the wished-for `deriveAiOwners(owners, predicate)` API in a new test. Pass a deliberately reduced/custom owner list and predicate, and assert it returns exactly the matching values in source order. This must not depend on the current hard-coded production values.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @handoff/web test -- src/desktop/owner-options.test.ts`.

Expected: FAIL because `deriveAiOwners` does not exist.

- [ ] **Step 3: Replace the hard-coded list**

Implement the generic pure helper, import `OWNERS` and `isAiOwner` in `DesktopSettingsDialog`, and derive `AI_OWNERS` through the helper. Keep the component test asserting the rendered options.

- [ ] **Step 4: Update desktop setup/release documentation**

Document pnpm 11.13.0, same-GCP-project Firebase desktop OAuth client creation, Google provider enablement, optional client secret, and a release-blocking real-device sign-in smoke test. Do not add the optional secret to `check-release-env.mjs`.

- [ ] **Step 5: Run focused tests and docs diff check**

Run both focused owner tests and `git diff --check`.

Expected: PASS.

- [ ] **Step 6: Commit**

Commit message: `fix(web): derive desktop ai owners`

### Task 9: Full regression verification

**Files:**
- Verify all modified files

- [ ] **Step 1: Run all tests**

Run: `pnpm -r test`

Expected: all unit/integration tests pass; Firestore emulator test remains the known skip.

- [ ] **Step 2: Run all typechecks**

Run: `pnpm -r typecheck`

Expected: exit 0.

- [ ] **Step 3: Run production builds**

Run: `pnpm --filter @handoff/web build` and `pnpm --filter @handoff/desktop build`.

Expected: both exit 0; built web HTML contains production CSP.

- [ ] **Step 4: Inspect the final diff and review-thread coverage**

Run: `git diff --check`, `git status --short`, and compare changed files against all nine PR threads. Record the two reasoned non-changes: keep pnpm 11 `allowBuilds`; keep Google client secret optional.

- [ ] **Step 5: Do not push or resolve GitHub threads**

Leave local commits ready for user review. GitHub replies, thread resolution, and push require explicit authorization.
