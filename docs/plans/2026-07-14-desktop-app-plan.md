# handoff デスクトップアプリ（Electron）実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** クラウドの handoff ボードからタスクを取得し、ローカル CLI（Claude Code / Codex CLI）に実行させる Electron デスクトップアプリを追加する。

**Architecture:** monorepo に `desktop/` ワークスペースを追加。renderer は既存 `@handoff/web` の Vite ビルドを `app://` カスタムスキームで同梱表示し、`window.handoffDesktop` ブリッジの有無でデスクトップ機能（実行ボタン・ログ・設定）を出し分ける。ステータス遷移はアプリではなく CLI 自身が handoff-mcp 経由で行う（ADR-0005 のプルモデル維持）。仕様: `docs/specs/2026-07-14-desktop-app-design.md`。

**Tech Stack:** Electron（main は ESM、preload は CJS バンドル）、esbuild（main/preload のバンドル）、既存の Vite + React 19 + TanStack Query（renderer）、Vitest、electron-builder（NSIS）。

## Global Constraints

- ESM 全体・import は明示的 `.js` 拡張子・`moduleResolution: Bundler`・`verbatimModuleSyntax`（`tsconfig.base.json` を extends）
- TypeScript `^5.7.2`、Vitest `^3.0.5`、pnpm workspace（`workspace:*` 参照）
- `any` 禁止。外部入力は `unknown` で受けて絞り込む
- イミュータブル更新（既存オブジェクトを変異させない）
- コミットは conventional commits（`feat:` / `test:` / `docs:` / `chore:`）、attribution なし
- コメント・UI 文言は日本語（既存コードの流儀）
- 秘密情報（トークン・クライアントシークレット）をリポジトリにコミットしない。ビルド時 env 注入
- サーバー側（`api/`・Firestore・デプロイ構成）は一切変更しない
- renderer のセキュリティ: `contextIsolation: true` / `sandbox: true` / `nodeIntegration: false`。機能アクセスは preload ブリッジ経由のみ
- Windows 一次ターゲット（spawn は `shell: true` + 引数クォート、kill は `taskkill /T /F`）

### 実行時の前提（コードでなく環境の準備）

| 前提 | 用途 | いつ必要か |
|---|---|---|
| `HANDOFF_GOOGLE_CLIENT_ID`（+任意で `HANDOFF_GOOGLE_CLIENT_SECRET`）env | デスクトップ用 Google OAuth クライアント（GCP コンソールで「デスクトップアプリ」タイプを発行） | Task 6 の手動検証以降のビルド時 |
| `web/.env` の `VITE_FIREBASE_*` と `VITE_API_BASE` | renderer ビルドに焼き込む Firebase 構成と API 既定 URL | Task 3 の手動検証以降の web ビルド時 |
| Cloud Run `handoff-api` の `CORS_ORIGINS` に `app://bundle` を追加 | `app://` オリジンからの API 呼び出し許可（`api/src/app.ts` は許可リスト式 CORS） | Task 4 の手動検証以降（本番 API に繋ぐ場合） |

### 備考: pnpm-workspace.yaml の未コミット変更

作業ツリーの `pnpm-workspace.yaml` に `allowBuilds` というプレースホルダ行（`set this to true or false`）が残っている。これは pnpm の正式キーではない。Task 2 で `onlyBuiltDependencies` に置き換えて整理する（electron はpostinstall スクリプト実行が必要）。

---

### Task 1: shared にデスクトップブリッジの共有型を追加

`web`（renderer）と `desktop`（main/preload）の契約となる型を `@handoff/shared` に置く。型のみでランタイムコードなし（テスト不要、typecheck で検証）。

**Files:**
- Create: `shared/src/desktop-bridge.ts`
- Modify: `shared/src/index.ts`

**Interfaces:**
- Consumes: `shared/src/task.ts` の `Owner` 型
- Produces: `CliDefinition` / `DesktopSettings` / `RunStatus` / `RunSummary` / `RunEvent` / `RunTaskRequest` / `HandoffDesktopBridge`。以降の全タスクがこの名前・形をそのまま使う

- [ ] **Step 1: 型ファイルを作成**

`shared/src/desktop-bridge.ts`:

```ts
// デスクトップ（Electron）ブリッジの共有型。web（renderer）と desktop（main/preload）の契約。
// ランタイムコードは置かない（検証ロジックは desktop 側の settings-core にある）。
import type { Owner } from './task.js';

/** 設定可能な CLI ランナー1件の定義。 */
export interface CliDefinition {
  /** 一意な slug（例: "claude-code"）。 */
  id: string;
  /** 表示名。 */
  name: string;
  /** 実行コマンド（PATH 解決される。例: "claude"）。 */
  command: string;
  /** 引数列。{prompt} / {taskId} / {title} が要素単位で展開される。 */
  argsTemplate: string[];
  /** この owner のタスクでデフォルト選択される（human は不可）。 */
  defaultForOwners: Owner[];
}

/** デスクトップアプリの永続設定（userData/settings.json）。 */
export interface DesktopSettings {
  /** API ベース URL。空文字は「web ビルドに焼き込まれた VITE_API_BASE を使う」の意。 */
  apiBaseUrl: string;
  cliDefinitions: CliDefinition[];
  /** project 名 → ローカル作業フォルダの対応表。 */
  projectFolderMap: Record<string, string>;
  /** 実行プロンプトのテンプレート。{taskId} / {title} が展開される。 */
  promptTemplate: string;
}

export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

/** 1回の CLI 実行のサマリ（ログ本文は含まない）。 */
export interface RunSummary {
  runId: string;
  taskId: string;
  taskTitle: string;
  cliName: string;
  status: RunStatus;
  exitCode: number | null;
}

/** main → renderer へストリーミングされる実行イベント。 */
export type RunEvent =
  | { runId: string; type: 'stdout' | 'stderr'; chunk: string }
  | { runId: string; type: 'status'; run: RunSummary };

/** 実行リクエスト。cwd と cliId の解決は renderer 側（RunDialog）で済ませてから渡す。 */
export interface RunTaskRequest {
  taskId: string;
  taskTitle: string;
  cliId: string;
  cwd: string;
}

/** preload が window.handoffDesktop として公開する API。 */
export interface HandoffDesktopBridge {
  runTask(req: RunTaskRequest): Promise<{ runId: string }>;
  cancelRun(runId: string): Promise<void>;
  listRuns(): Promise<RunSummary[]>;
  /** 実行イベントを購読する。戻り値は解除関数。 */
  onRunEvent(cb: (ev: RunEvent) => void): () => void;
  getSettings(): Promise<DesktopSettings>;
  setSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings>;
  /** OS のフォルダ選択ダイアログ。キャンセルは null。 */
  pickFolder(): Promise<string | null>;
  /** システムブラウザで Google サインインし、id_token を返す。 */
  signIn(): Promise<{ idToken: string }>;
}
```

- [ ] **Step 2: index.ts から re-export**

`shared/src/index.ts` の末尾に追加:

```ts
export * from './desktop-bridge.js';
```

- [ ] **Step 3: typecheck**

Run: `pnpm --filter @handoff/shared typecheck`
Expected: エラーなし

- [ ] **Step 4: Commit**

```bash
git add shared/src/desktop-bridge.ts shared/src/index.ts
git commit -m "feat(shared): add desktop bridge shared types"
```

---

### Task 2: desktop ワークスペースの土台 + 設定バリデーション（TDD）

ワークスペースを追加し、設定の純粋ロジック（デフォルト値・パッチ検証）を TDD で作る。

**Files:**
- Modify: `pnpm-workspace.yaml`
- Create: `desktop/package.json`
- Create: `desktop/tsconfig.json`
- Create: `desktop/vitest.config.ts`
- Create: `desktop/build.mjs`
- Create: `desktop/src/main/settings-core.ts`
- Test: `desktop/src/main/settings-core.test.ts`

**Interfaces:**
- Consumes: `@handoff/shared` の `DesktopSettings` / `CliDefinition`、`OWNERS`
- Produces: `DEFAULT_SETTINGS: DesktopSettings`、`applySettingsPatch(current: DesktopSettings, patch: unknown): DesktopSettings`（不正時 `SettingsValidationError` を throw）、`SettingsValidationError`（`status = 422`）

- [ ] **Step 1: ワークスペース定義を更新**

`pnpm-workspace.yaml` を以下の内容に置き換える（プレースホルダの `allowBuilds` を正式な `onlyBuiltDependencies` に修正し、`desktop` と `electron`/`esbuild` を追加）:

```yaml
packages:
  - 'shared'
  - 'api'
  - 'web'
  - 'desktop'
onlyBuiltDependencies:
  - '@firebase/util'
  - electron
  - esbuild
  - protobufjs
```

- [ ] **Step 2: desktop/package.json を作成**

```json
{
  "name": "@handoff/desktop",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/main/index.js",
  "scripts": {
    "build": "node build.mjs",
    "dev": "node build.mjs && electron .",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@handoff/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.19.19",
    "electron": "^36.0.0",
    "esbuild": "^0.25.0",
    "typescript": "^5.7.2",
    "vitest": "^3.0.5"
  }
}
```

- [ ] **Step 3: tsconfig / vitest / build スクリプトを作成**

`desktop/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM"],
    "types": ["node"]
  },
  "include": ["src"]
}
```

（`DOM` は preload の `fetch`/`Response` 型のため。）

`desktop/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

`desktop/build.mjs`（main = ESM / preload = CJS の2本をバンドル。Google OAuth クライアント ID はビルド時 define で注入）:

```js
import { build } from 'esbuild';

const define = {
  __GOOGLE_CLIENT_ID__: JSON.stringify(process.env.HANDOFF_GOOGLE_CLIENT_ID ?? ''),
  __GOOGLE_CLIENT_SECRET__: JSON.stringify(process.env.HANDOFF_GOOGLE_CLIENT_SECRET ?? ''),
};

await build({
  entryPoints: ['src/main/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/main/index.js',
  external: ['electron'],
  define,
});

// sandbox: true の preload は CJS 必須（ESM preload はサンドボックスで動かない）
await build({
  entryPoints: ['src/preload/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/preload/index.cjs',
  external: ['electron'],
});
```

- [ ] **Step 4: インストール**

Run: `pnpm install`
Expected: `@handoff/desktop` がリンクされ、electron がダウンロードされる（`onlyBuiltDependencies` により electron の postinstall が走る）

- [ ] **Step 5: settings-core の失敗するテストを書く**

`desktop/src/main/settings-core.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  applySettingsPatch,
  SettingsValidationError,
} from './settings-core.js';

describe('DEFAULT_SETTINGS', () => {
  it('Claude Code と Codex のプリセットを持つ', () => {
    const ids = DEFAULT_SETTINGS.cliDefinitions.map((d) => d.id);
    expect(ids).toEqual(['claude-code', 'codex']);
    expect(DEFAULT_SETTINGS.apiBaseUrl).toBe('');
    expect(DEFAULT_SETTINGS.promptTemplate).toContain('{taskId}');
  });
});

describe('applySettingsPatch', () => {
  it('部分パッチをイミュータブルに適用する', () => {
    const next = applySettingsPatch(DEFAULT_SETTINGS, {
      apiBaseUrl: 'https://api.example.com',
    });
    expect(next.apiBaseUrl).toBe('https://api.example.com');
    expect(next).not.toBe(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.apiBaseUrl).toBe('');
  });

  it('projectFolderMap を置き換えられる', () => {
    const next = applySettingsPatch(DEFAULT_SETTINGS, {
      projectFolderMap: { handoff: 'C:/Users/me/Dev/handoff-board' },
    });
    expect(next.projectFolderMap).toEqual({ handoff: 'C:/Users/me/Dev/handoff-board' });
  });

  it('不明なキーは 422 で拒否する', () => {
    expect(() => applySettingsPatch(DEFAULT_SETTINGS, { nope: 1 })).toThrow(
      SettingsValidationError,
    );
  });

  it('http(s) 以外の apiBaseUrl は拒否する（空文字は許可）', () => {
    expect(() => applySettingsPatch(DEFAULT_SETTINGS, { apiBaseUrl: 'ftp://x' })).toThrow(
      SettingsValidationError,
    );
    expect(applySettingsPatch(DEFAULT_SETTINGS, { apiBaseUrl: '' }).apiBaseUrl).toBe('');
  });

  it('空の promptTemplate は拒否する', () => {
    expect(() => applySettingsPatch(DEFAULT_SETTINGS, { promptTemplate: ' ' })).toThrow(
      SettingsValidationError,
    );
  });

  it('cliDefinitions の id 重複は拒否する', () => {
    const dup = [
      { id: 'a', name: 'A', command: 'a', argsTemplate: ['{prompt}'], defaultForOwners: [] },
      { id: 'a', name: 'B', command: 'b', argsTemplate: ['{prompt}'], defaultForOwners: [] },
    ];
    expect(() => applySettingsPatch(DEFAULT_SETTINGS, { cliDefinitions: dup })).toThrow(
      SettingsValidationError,
    );
  });

  it('defaultForOwners に human や未知の owner は指定できない', () => {
    const bad = (owners: string[]) => [
      { id: 'a', name: 'A', command: 'a', argsTemplate: ['{prompt}'], defaultForOwners: owners },
    ];
    expect(() =>
      applySettingsPatch(DEFAULT_SETTINGS, { cliDefinitions: bad(['human']) }),
    ).toThrow(SettingsValidationError);
    expect(() =>
      applySettingsPatch(DEFAULT_SETTINGS, { cliDefinitions: bad(['gemini']) }),
    ).toThrow(SettingsValidationError);
  });

  it('projectFolderMap の値が文字列以外なら拒否する', () => {
    expect(() =>
      applySettingsPatch(DEFAULT_SETTINGS, { projectFolderMap: { p: 1 } }),
    ).toThrow(SettingsValidationError);
  });
});
```

- [ ] **Step 6: テストが失敗することを確認**

Run: `pnpm --filter @handoff/desktop test`
Expected: FAIL（`settings-core.js` が存在しない）

- [ ] **Step 7: settings-core を実装**

`desktop/src/main/settings-core.ts`:

```ts
// デスクトップ設定の純粋ロジック（デフォルト値・パッチ検証）。I/O は settings.ts に分離。
import { OWNERS, type Owner, type CliDefinition, type DesktopSettings } from '@handoff/shared';

/** 設定パッチの検証エラー。@handoff/shared の ValidationError(422) の流儀に合わせる。 */
export class SettingsValidationError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = 'SettingsValidationError';
  }
}

export const DEFAULT_SETTINGS: DesktopSettings = {
  apiBaseUrl: '',
  cliDefinitions: [
    {
      id: 'claude-code',
      name: 'Claude Code',
      command: 'claude',
      argsTemplate: ['-p', '{prompt}'],
      defaultForOwners: ['claude-code'],
    },
    {
      id: 'codex',
      name: 'Codex CLI',
      command: 'codex',
      argsTemplate: ['exec', '{prompt}'],
      defaultForOwners: ['codex'],
    },
  ],
  projectFolderMap: {},
  promptTemplate:
    'handoff のタスク {taskId}（{title}）を handoff-mcp の get_task で取得し、内容に従って作業してください。着手時と完了時に transition_task でステータスを遷移させてください。',
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

function validateOwner(v: unknown, index: number): Owner {
  if (typeof v !== 'string' || !(OWNERS as readonly string[]).includes(v) || v === 'human') {
    throw new SettingsValidationError(
      `cliDefinitions[${index}].defaultForOwners に不正な owner があります: ${String(v)}`,
    );
  }
  return v as Owner;
}

function validateCliDefinition(v: unknown, index: number): CliDefinition {
  if (!isPlainObject(v)) {
    throw new SettingsValidationError(`cliDefinitions[${index}] はオブジェクトである必要があります`);
  }
  const { id, name, command, argsTemplate, defaultForOwners } = v;
  if (!isNonEmptyString(id) || !isNonEmptyString(name) || !isNonEmptyString(command)) {
    throw new SettingsValidationError(`cliDefinitions[${index}] の id/name/command は必須です`);
  }
  if (
    !Array.isArray(argsTemplate) ||
    argsTemplate.length === 0 ||
    !argsTemplate.every((a): a is string => typeof a === 'string')
  ) {
    throw new SettingsValidationError(
      `cliDefinitions[${index}].argsTemplate は文字列の配列（1件以上）が必要です`,
    );
  }
  if (!Array.isArray(defaultForOwners)) {
    throw new SettingsValidationError(
      `cliDefinitions[${index}].defaultForOwners は配列である必要があります`,
    );
  }
  return {
    id,
    name,
    command,
    argsTemplate: [...argsTemplate],
    defaultForOwners: defaultForOwners.map((o) => validateOwner(o, index)),
  };
}

/** 現在の設定にパッチを検証つきで適用し、新しい設定を返す（イミュータブル）。 */
export function applySettingsPatch(current: DesktopSettings, patch: unknown): DesktopSettings {
  if (!isPlainObject(patch)) {
    throw new SettingsValidationError('設定パッチはオブジェクトである必要があります');
  }
  let next: DesktopSettings = {
    ...current,
    cliDefinitions: current.cliDefinitions.map((d) => ({ ...d })),
    projectFolderMap: { ...current.projectFolderMap },
  };
  for (const [key, value] of Object.entries(patch)) {
    switch (key) {
      case 'apiBaseUrl': {
        if (typeof value !== 'string' || (value !== '' && !/^https?:\/\//.test(value))) {
          throw new SettingsValidationError('apiBaseUrl は http(s) の URL か空文字が必要です');
        }
        next = { ...next, apiBaseUrl: value };
        break;
      }
      case 'promptTemplate': {
        if (!isNonEmptyString(value)) {
          throw new SettingsValidationError('promptTemplate は空にできません');
        }
        next = { ...next, promptTemplate: value };
        break;
      }
      case 'projectFolderMap': {
        if (
          !isPlainObject(value) ||
          !Object.values(value).every((p) => typeof p === 'string')
        ) {
          throw new SettingsValidationError(
            'projectFolderMap は文字列から文字列へのマップが必要です',
          );
        }
        next = { ...next, projectFolderMap: { ...(value as Record<string, string>) } };
        break;
      }
      case 'cliDefinitions': {
        if (!Array.isArray(value) || value.length === 0) {
          throw new SettingsValidationError('cliDefinitions は1件以上の配列が必要です');
        }
        const defs = value.map((d, i) => validateCliDefinition(d, i));
        if (new Set(defs.map((d) => d.id)).size !== defs.length) {
          throw new SettingsValidationError('cliDefinitions の id が重複しています');
        }
        next = { ...next, cliDefinitions: defs };
        break;
      }
      default:
        throw new SettingsValidationError(`不明な設定キー: ${key}`);
    }
  }
  return next;
}
```

- [ ] **Step 8: テストが通ることを確認**

Run: `pnpm --filter @handoff/desktop test`
Expected: PASS（9件）

Run: `pnpm --filter @handoff/desktop typecheck`
Expected: エラーなし

- [ ] **Step 9: Commit**

```bash
git add pnpm-workspace.yaml desktop/
git commit -m "feat(desktop): scaffold desktop workspace with settings validation"
```

---

### Task 3: 設定ストア（I/O）+ メインプロセス骨格 + preload ブリッジ（設定系）

settings.json の読み書き（TDD）と、ウィンドウ・`app://` プロトコル・IPC の配線（薄い結線、手動検証）。

**Files:**
- Create: `desktop/src/main/settings.ts`
- Test: `desktop/src/main/settings.test.ts`
- Create: `desktop/src/main/index.ts`
- Create: `desktop/src/preload/index.ts`

**Interfaces:**
- Consumes: Task 2 の `DEFAULT_SETTINGS` / `applySettingsPatch`
- Produces: `SettingsStore`（`constructor(dir: string)`、`load(): DesktopSettings`、`update(patch: unknown): DesktopSettings`）。IPC チャンネル名 `settings:get` / `settings:set` / `dialog:pick-folder`（後続タスクはこの名前に依存）

- [ ] **Step 1: SettingsStore の失敗するテストを書く**

`desktop/src/main/settings.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsStore } from './settings.js';
import { DEFAULT_SETTINGS } from './settings-core.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'handoff-settings-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('SettingsStore', () => {
  it('ファイルが無ければデフォルトを返す', () => {
    const store = new SettingsStore(dir);
    expect(store.load()).toEqual(DEFAULT_SETTINGS);
  });

  it('update は検証して保存し、次回 load で読める', () => {
    const store = new SettingsStore(dir);
    const next = store.update({ apiBaseUrl: 'https://api.example.com' });
    expect(next.apiBaseUrl).toBe('https://api.example.com');
    expect(new SettingsStore(dir).load().apiBaseUrl).toBe('https://api.example.com');
  });

  it('壊れた JSON はデフォルトにフォールバックする', () => {
    writeFileSync(join(dir, 'settings.json'), '{not json');
    expect(new SettingsStore(dir).load()).toEqual(DEFAULT_SETTINGS);
  });

  it('ファイル内の未知キーは無視して読み込む（将来の後方互換）', () => {
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ apiBaseUrl: 'https://a.example.com', futureKey: true }),
    );
    const loaded = new SettingsStore(dir).load();
    expect(loaded.apiBaseUrl).toBe('https://a.example.com');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm --filter @handoff/desktop test`
Expected: FAIL（`settings.js` が存在しない）

- [ ] **Step 3: SettingsStore を実装**

`desktop/src/main/settings.ts`:

```ts
// 設定の永続化（userData/settings.json）。検証は settings-core に委譲。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DesktopSettings } from '@handoff/shared';
import { DEFAULT_SETTINGS, applySettingsPatch } from './settings-core.js';

const KNOWN_KEYS = ['apiBaseUrl', 'cliDefinitions', 'projectFolderMap', 'promptTemplate'] as const;

export class SettingsStore {
  constructor(private readonly dir: string) {}

  private get file(): string {
    return join(this.dir, 'settings.json');
  }

  /** 保存済み設定を読む。無い・壊れている場合はデフォルト。未知キーは黙って捨てる。 */
  load(): DesktopSettings {
    if (!existsSync(this.file)) return DEFAULT_SETTINGS;
    try {
      const raw: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
      if (typeof raw !== 'object' || raw === null) return DEFAULT_SETTINGS;
      const known = Object.fromEntries(
        Object.entries(raw).filter(([k]) => (KNOWN_KEYS as readonly string[]).includes(k)),
      );
      return applySettingsPatch(DEFAULT_SETTINGS, known);
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  /** パッチを検証して適用し、保存して新しい設定を返す。不正は SettingsValidationError。 */
  update(patch: unknown): DesktopSettings {
    const next = applySettingsPatch(this.load(), patch);
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.file, JSON.stringify(next, null, 2));
    return next;
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm --filter @handoff/desktop test`
Expected: PASS

- [ ] **Step 5: メインプロセスと preload を実装（結線・手動検証）**

`desktop/src/main/index.ts`:

```ts
// Electron メインプロセス。ウィンドウ生成・app:// スキーム・IPC 配線のみの薄い結線層。
import { app, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SettingsStore } from './settings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// renderer 資産の場所: 開発中はリポジトリ内の web/dist、パッケージ後は resources/web
function webDistDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'web')
    : join(__dirname, '..', '..', '..', 'web', 'dist');
}

// app:// を standard スキームにしてオリジンを安定させる（localStorage / IndexedDB / Firebase 永続化のため）
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function registerAppProtocol(): void {
  const root = normalize(webDistDir());
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    const rel = pathname === '/' ? '/index.html' : pathname;
    const file = normalize(join(root, rel));
    if (!file.startsWith(root)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function wireIpc(): void {
  const settings = new SettingsStore(app.getPath('userData'));
  ipcMain.handle('settings:get', () => settings.load());
  ipcMain.handle('settings:set', (_e, patch: unknown) => settings.update(patch));
  ipcMain.handle('dialog:pick-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const devServerUrl = process.env.HANDOFF_DEV_SERVER_URL;
  void win.loadURL(devServerUrl ?? 'app://bundle/index.html');
}

void app.whenReady().then(() => {
  registerAppProtocol();
  wireIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
```

`desktop/src/preload/index.ts`（この時点では設定系のみ。実行/認証 API は Task 6・8 で追加）:

```ts
// preload。contextBridge で window.handoffDesktop を公開する（薄い転送層、ロジック禁止）。
import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopSettings } from '@handoff/shared';

const bridge = {
  getSettings: (): Promise<DesktopSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<DesktopSettings>): Promise<DesktopSettings> =>
    ipcRenderer.invoke('settings:set', patch),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pick-folder'),
};

contextBridge.exposeInMainWorld('handoffDesktop', bridge);
```

- [ ] **Step 6: 手動検証（ウィンドウが開き web UI が表示される）**

```bash
pnpm --filter @handoff/web build        # web/.env の VITE_* が焼き込まれる
pnpm --filter @handoff/desktop dev
```

Expected: ウィンドウが開き、HANDOFF ヘッダーとサインインプロンプトが表示される（この時点でサインインはまだポップアップ方式のため失敗してよい）。DevTools コンソールで `window.handoffDesktop` が定義されている。

- [ ] **Step 7: Commit**

```bash
git add desktop/src
git commit -m "feat(desktop): main process skeleton with app:// protocol and settings IPC"
```

---

### Task 4: web をブリッジ対応にする（API ベース URL の設定注入）

renderer が `window.handoffDesktop` を検出し、設定の `apiBaseUrl` で API を呼ぶ。TDD（api-client）。

**Files:**
- Create: `web/src/desktop/global.d.ts`
- Create: `web/src/desktop/bridge.ts`
- Modify: `web/src/api-client.ts`（`API_BASE` 定数 → `apiBase()` 関数 + `setApiBase()`）
- Modify: `web/src/main.tsx`（bootstrap で設定を読み込む）
- Test: `web/src/api-client.test.ts`

**Interfaces:**
- Consumes: `@handoff/shared` の `HandoffDesktopBridge`
- Produces: `setApiBase(url: string): void`（web 内部用）、`desktopBridge(): HandoffDesktopBridge | null`（後続の web タスク全部がこれを使う）

- [ ] **Step 1: 失敗するテストを書く**

`web/src/api-client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBoard, setApiBase } from './api-client';

function okResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, data, error: null }),
  } as unknown as Response;
}

afterEach(() => {
  setApiBase('');
  vi.restoreAllMocks();
});

describe('setApiBase', () => {
  it('デスクトップ設定の URL で API を呼ぶ', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse([]));
    setApiBase('http://desktop.example:9999');
    await fetchBoard();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://desktop.example:9999/api/board',
      expect.anything(),
    );
  });

  it('空文字はビルド時既定（テストでは localhost:8787）に戻す', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse([]));
    setApiBase('http://desktop.example:9999');
    setApiBase('');
    await fetchBoard();
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8787/api/board', expect.anything());
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm --filter @handoff/web test -- src/api-client.test.ts`
Expected: FAIL（`setApiBase` が export されていない）

- [ ] **Step 3: api-client を修正**

`web/src/api-client.ts` の先頭部分（1〜5行目）を以下に変更:

```ts
import type { ApiEnvelope, Task } from '@handoff/shared';
import { authHeaders } from './auth/auth-headers';
import { currentIdToken } from './auth/firebase-auth';

let apiBaseOverride: string | null = null;

/** デスクトップ版が設定値で API ベース URL を上書きする。空文字はビルド時既定に戻す。 */
export function setApiBase(url: string): void {
  apiBaseOverride = url || null;
}

function apiBase(): string {
  return apiBaseOverride ?? import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';
}
```

続けて、ファイル内の `${API_BASE}` を全箇所（6箇所: fetchBoard / createTask / transitionTask / editTask / deleteTask / completeTask）`${apiBase()}` に置換する。

- [ ] **Step 4: ブリッジアクセサと型を追加**

`web/src/desktop/global.d.ts`:

```ts
import type { HandoffDesktopBridge } from '@handoff/shared';

declare global {
  interface Window {
    /** Electron の preload が注入する。ブラウザ実行時は undefined。 */
    handoffDesktop?: HandoffDesktopBridge;
  }
}

export {};
```

`web/src/desktop/bridge.ts`:

```ts
import type { HandoffDesktopBridge } from '@handoff/shared';

/** デスクトップ（Electron）ブリッジ。ブラウザ実行時は null。 */
export function desktopBridge(): HandoffDesktopBridge | null {
  return typeof window === 'undefined' ? null : (window.handoffDesktop ?? null);
}
```

- [ ] **Step 5: main.tsx を bootstrap 化**

`web/src/main.tsx` を以下に置き換え:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { setApiBase } from './api-client';
import { desktopBridge } from './desktop/bridge';
import './styles.css';

// デスクトップ版は描画前に設定を読み、API ベース URL を注入する。
async function bootstrap(): Promise<void> {
  const bridge = desktopBridge();
  if (bridge) {
    const settings = await bridge.getSettings();
    setApiBase(settings.apiBaseUrl);
  }

  const rootEl = document.getElementById('root');
  if (!rootEl) throw new Error('#root not found');

  const queryClient = new QueryClient();

  createRoot(rootEl).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void bootstrap();
```

- [ ] **Step 6: テスト・typecheck が通ることを確認**

Run: `pnpm --filter @handoff/web test && pnpm --filter @handoff/web typecheck`
Expected: 全 PASS（既存テストも回帰なし）

- [ ] **Step 7: Commit**

```bash
git add web/src/api-client.ts web/src/api-client.test.ts web/src/desktop/ web/src/main.tsx
git commit -m "feat(web): desktop bridge detection and configurable api base url"
```

---

### Task 5: OAuth 純粋ロジック auth-core（TDD）

PKCE・認可 URL・コールバック解析・トークン交換の純関数群。

**Files:**
- Create: `desktop/src/main/auth-core.ts`
- Test: `desktop/src/main/auth-core.test.ts`

**Interfaces:**
- Produces: `createPkcePair(random?): { verifier, challenge }`、`buildAuthUrl({clientId, redirectUri, codeChallenge, state}): string`、`parseCallback(reqUrl, expectedState): { code }`、`exchangeCode({code, clientId, clientSecret, redirectUri, codeVerifier, fetchFn?}): Promise<{ idToken }>`。Task 6 がこの4つを使う

- [ ] **Step 1: 失敗するテストを書く**

`desktop/src/main/auth-core.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { buildAuthUrl, createPkcePair, exchangeCode, parseCallback } from './auth-core.js';

describe('createPkcePair', () => {
  it('verifier の S256 ハッシュ（base64url）が challenge になる', () => {
    const { verifier, challenge } = createPkcePair(() => Buffer.alloc(32, 7));
    expect(verifier).toBe(Buffer.alloc(32, 7).toString('base64url'));
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });
});

describe('buildAuthUrl', () => {
  it('Google 認可エンドポイントに必須パラメータを付ける', () => {
    const url = new URL(
      buildAuthUrl({
        clientId: 'cid',
        redirectUri: 'http://127.0.0.1:5000',
        codeChallenge: 'chal',
        state: 'st',
      }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email');
    expect(url.searchParams.get('code_challenge')).toBe('chal');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('st');
  });
});

describe('parseCallback', () => {
  it('code を取り出す', () => {
    expect(parseCallback('/?code=abc&state=st', 'st')).toEqual({ code: 'abc' });
  });

  it('state 不一致は拒否する', () => {
    expect(() => parseCallback('/?code=abc&state=evil', 'st')).toThrow('state');
  });

  it('error パラメータは例外にする', () => {
    expect(() => parseCallback('/?error=access_denied&state=st', 'st')).toThrow('access_denied');
  });
});

describe('exchangeCode', () => {
  it('id_token を返す', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id_token: 'jwt' }),
    });
    const result = await exchangeCode({
      code: 'abc',
      clientId: 'cid',
      clientSecret: 'sec',
      redirectUri: 'http://127.0.0.1:5000',
      codeVerifier: 'ver',
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(result).toEqual({ idToken: 'jwt' });
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code_verifier')).toBe('ver');
    expect(body.get('client_secret')).toBe('sec');
  });

  it('失敗レスポンスは例外にする', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'invalid_grant' }),
    });
    await expect(
      exchangeCode({
        code: 'abc',
        clientId: 'cid',
        clientSecret: '',
        redirectUri: 'http://127.0.0.1:5000',
        codeVerifier: 'ver',
        fetchFn: fetchFn as unknown as typeof fetch,
      }),
    ).rejects.toThrow('invalid_grant');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm --filter @handoff/desktop test -- src/main/auth-core.test.ts`
Expected: FAIL

- [ ] **Step 3: auth-core を実装**

`desktop/src/main/auth-core.ts`:

```ts
// Google OAuth（PKCE + ループバック）の純粋ロジック。HTTP サーバー・ブラウザ起動は auth.ts。
import { createHash, randomBytes } from 'node:crypto';

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function createPkcePair(random: () => Buffer = () => randomBytes(32)): PkcePair {
  const verifier = random().toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function buildAuthUrl(p: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', p.clientId);
  url.searchParams.set('redirect_uri', p.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email');
  url.searchParams.set('code_challenge', p.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', p.state);
  return url.toString();
}

/** ループバックに返ってきたリクエスト URL から認可コードを取り出す。 */
export function parseCallback(reqUrl: string, expectedState: string): { code: string } {
  const url = new URL(reqUrl, 'http://127.0.0.1');
  const error = url.searchParams.get('error');
  if (error) throw new Error(`Google 認可がエラーを返しました: ${error}`);
  if (url.searchParams.get('state') !== expectedState) {
    throw new Error('state が一致しません（CSRF の可能性）');
  }
  const code = url.searchParams.get('code');
  if (!code) throw new Error('認可コードがありません');
  return { code };
}

export async function exchangeCode(p: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  codeVerifier: string;
  fetchFn?: typeof fetch;
}): Promise<{ idToken: string }> {
  const fetchFn = p.fetchFn ?? fetch;
  const body = new URLSearchParams({
    code: p.code,
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    grant_type: 'authorization_code',
    code_verifier: p.codeVerifier,
  });
  if (p.clientSecret) body.set('client_secret', p.clientSecret);
  const res = await fetchFn('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await res.json()) as { id_token?: string; error?: string };
  if (!res.ok || !json.id_token) {
    throw new Error(`トークン交換に失敗しました: ${json.error ?? `HTTP ${res.status ?? '?'}`}`);
  }
  return { idToken: json.id_token };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm --filter @handoff/desktop test`
Expected: 全 PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/auth-core.ts desktop/src/main/auth-core.test.ts
git commit -m "feat(desktop): pkce oauth pure logic (auth-core)"
```

---

### Task 6: サインインフロー配線（ループバックサーバー + IPC + web の credential サインイン）

**Files:**
- Create: `desktop/src/main/auth.ts`
- Modify: `desktop/src/main/index.ts`（IPC `auth:sign-in` 追加）
- Modify: `desktop/src/preload/index.ts`（`signIn` 追加）
- Modify: `web/src/auth/firebase-auth.ts`（ブリッジ経由の credential サインイン）

**Interfaces:**
- Consumes: Task 5 の auth-core 4関数、Task 4 の `desktopBridge()`
- Produces: main の `signInWithGoogle(): Promise<{ idToken: string }>`、IPC `auth:sign-in`、ブリッジ `signIn()`。web 側の `signInWithGoogle()` は既存シグネチャ（`Promise<void>`）のまま内部分岐

- [ ] **Step 1: auth.ts を実装**

`desktop/src/main/auth.ts`:

```ts
// システムブラウザ + ループバックで Google サインインし、id_token を返す。
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import { shell } from 'electron';
import { buildAuthUrl, createPkcePair, exchangeCode, parseCallback } from './auth-core.js';

// build.mjs の define で注入される（コミットしない。env HANDOFF_GOOGLE_CLIENT_ID / _SECRET）
declare const __GOOGLE_CLIENT_ID__: string;
declare const __GOOGLE_CLIENT_SECRET__: string;

const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

export async function signInWithGoogle(): Promise<{ idToken: string }> {
  const clientId = __GOOGLE_CLIENT_ID__;
  if (!clientId) {
    throw new Error(
      'Google クライアント ID が未設定です（HANDOFF_GOOGLE_CLIENT_ID を設定してビルドしてください）',
    );
  }
  const { verifier, challenge } = createPkcePair();
  const state = randomBytes(16).toString('base64url');

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      try {
        const { code } = parseCallback(req.url ?? '', state);
        res.end('サインインが完了しました。このタブを閉じてアプリに戻ってください。');
        finish(() =>
          exchangeCode({
            code,
            clientId,
            clientSecret: __GOOGLE_CLIENT_SECRET__,
            redirectUri,
            codeVerifier: verifier,
          }).then(resolve, reject),
        );
      } catch (err: unknown) {
        res.statusCode = 400;
        res.end('サインインに失敗しました。アプリに戻ってやり直してください。');
        finish(() => reject(err instanceof Error ? err : new Error(String(err))));
      }
    });

    let redirectUri = '';
    const timer = setTimeout(() => {
      finish(() => reject(new Error('サインインがタイムアウトしました（5分）')));
    }, SIGN_IN_TIMEOUT_MS);

    function finish(done: () => void): void {
      clearTimeout(timer);
      server.close();
      done();
    }

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      redirectUri = `http://127.0.0.1:${port}`;
      const url = buildAuthUrl({ clientId, redirectUri, codeChallenge: challenge, state });
      void shell.openExternal(url);
    });
  });
}
```

- [ ] **Step 2: IPC と preload に signIn を追加**

`desktop/src/main/index.ts` の `wireIpc()` に追加（import も追加: `import { signInWithGoogle } from './auth.js';`）:

```ts
  ipcMain.handle('auth:sign-in', () => signInWithGoogle());
```

`desktop/src/preload/index.ts` の `bridge` オブジェクトに追加:

```ts
  signIn: (): Promise<{ idToken: string }> => ipcRenderer.invoke('auth:sign-in'),
```

- [ ] **Step 3: web の firebase-auth にブリッジ経路を追加**

`web/src/auth/firebase-auth.ts` — import に `signInWithCredential` を追加し、`signInWithGoogle` を差し替え:

```ts
import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
```

```ts
/** Google でサインインする。デスクトップ版はブリッジ（ループバック OAuth）、ブラウザはポップアップ。未構成時は例外。 */
export async function signInWithGoogle(): Promise<void> {
  if (!configured) throw new Error('Firebase が未構成です（VITE_FIREBASE_* を設定してください）');
  const auth = getAuth(ensureApp());
  const bridge = window.handoffDesktop;
  if (bridge) {
    const { idToken } = await bridge.signIn();
    await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    return;
  }
  await signInWithPopup(auth, new GoogleAuthProvider());
}
```

- [ ] **Step 4: テスト・typecheck 回帰確認**

Run: `pnpm -r test && pnpm -r typecheck`
Expected: 全 PASS（firebase-auth は既存どおり配線のみでテスト対象外）

- [ ] **Step 5: 手動検証（サインイン→ボード表示）**

事前に: GCP で「デスクトップアプリ」OAuth クライアントを発行し、env を設定。Cloud Run の `CORS_ORIGINS` に `app://bundle` を追加済みであること。

```powershell
$env:HANDOFF_GOOGLE_CLIENT_ID = "<client-id>"
$env:HANDOFF_GOOGLE_CLIENT_SECRET = "<client-secret>"
pnpm --filter @handoff/web build
pnpm --filter @handoff/desktop dev
```

Expected: サインインボタン → ブラウザが開く → Google 認可 → アプリに戻ると自分のボードが表示される。アプリ再起動後もサインイン状態が維持される。

- [ ] **Step 6: Commit**

```bash
git add desktop/src web/src/auth/firebase-auth.ts
git commit -m "feat(desktop,web): google sign-in via loopback oauth bridge"
```

---

### Task 7: cli-runner（TDD）— テンプレート展開・実行管理・キャンセル

メインプロセスの中核。spawn を注入可能にして完全にユニットテストする。

**Files:**
- Create: `desktop/src/main/cli-runner.ts`
- Test: `desktop/src/main/cli-runner.test.ts`

**Interfaces:**
- Consumes: `@handoff/shared` の `RunEvent` / `RunSummary`
- Produces: `expandArgs(template: readonly string[], vars: {prompt,taskId,title}): string[]`、`renderPrompt(template: string, vars: {taskId,title}): string`、`quoteForCmd(arg: string): string`、`CliRunner`（`constructor(spawnFn, killTree, emit)`、`start(req): {runId}`、`cancel(runId)`、`list(): RunSummary[]`、`getLog(runId): string`、`isTaskRunning(taskId): boolean`）。Task 8 がそのまま配線する

- [ ] **Step 1: 失敗するテストを書く**

`desktop/src/main/cli-runner.test.ts`:

```ts
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { RunEvent } from '@handoff/shared';
import { CliRunner, expandArgs, quoteForCmd, renderPrompt, type ChildLike } from './cli-runner.js';

class FakeChild extends EventEmitter {
  pid = 1234;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}

function setup() {
  const children: FakeChild[] = [];
  const spawnFn = vi.fn((_cmd: string, _args: string[], _opts: { cwd: string; shell: boolean }) => {
    const child = new FakeChild();
    children.push(child);
    return child as unknown as ChildLike;
  });
  const killTree = vi.fn();
  const events: RunEvent[] = [];
  const runner = new CliRunner(spawnFn, killTree, (ev) => events.push(ev));
  return { runner, spawnFn, killTree, events, children };
}

const REQ = {
  taskId: 't1',
  taskTitle: 'テスト',
  cliName: 'Claude Code',
  command: 'claude',
  args: ['-p', 'やる'],
  cwd: 'C:/work',
};

describe('expandArgs / renderPrompt / quoteForCmd', () => {
  it('プレースホルダを要素単位で展開する', () => {
    expect(
      expandArgs(['-p', '{prompt}', '--task={taskId}'], {
        prompt: 'P',
        taskId: 'id1',
        title: 'T',
      }),
    ).toEqual(['-p', 'P', '--task=id1']);
  });

  it('renderPrompt は taskId と title を埋める', () => {
    expect(renderPrompt('do {taskId} ({title})', { taskId: 'a', title: 'b' })).toBe('do a (b)');
  });

  it('quoteForCmd は全体を二重引用符で包み、内部の引用符を二重化する', () => {
    expect(quoteForCmd('hello world')).toBe('"hello world"');
    expect(quoteForCmd('say "hi"')).toBe('"say ""hi"""');
  });
});

describe('CliRunner', () => {
  it('start で running ステータスを発行し、引数を quote して spawn する', () => {
    const { runner, spawnFn, events } = setup();
    const { runId } = runner.start(REQ);
    expect(spawnFn).toHaveBeenCalledWith('claude', ['"-p"', '"やる"'], {
      cwd: 'C:/work',
      shell: true,
    });
    expect(events[0]).toMatchObject({ runId, type: 'status', run: { status: 'running' } });
  });

  it('stdout をログに蓄積しイベントを流す', () => {
    const { runner, events, children } = setup();
    const { runId } = runner.start(REQ);
    children[0].stdout.emit('data', Buffer.from('hello'));
    expect(events).toContainEqual({ runId, type: 'stdout', chunk: 'hello' });
    expect(runner.getLog(runId)).toBe('hello');
  });

  it('exit 0 → succeeded / exit 1 → failed', () => {
    const { runner, children } = setup();
    const { runId } = runner.start(REQ);
    children[0].emit('exit', 0);
    expect(runner.list().find((r) => r.runId === runId)).toMatchObject({
      status: 'succeeded',
      exitCode: 0,
    });

    const second = runner.start({ ...REQ, taskId: 't2' });
    children[1].emit('exit', 1);
    expect(runner.list().find((r) => r.runId === second.runId)).toMatchObject({
      status: 'failed',
      exitCode: 1,
    });
  });

  it('同一タスクの二重実行を拒否する', () => {
    const { runner } = setup();
    runner.start(REQ);
    expect(() => runner.start(REQ)).toThrow('実行中');
  });

  it('終了後なら同一タスクを再実行できる', () => {
    const { runner, children } = setup();
    runner.start(REQ);
    children[0].emit('exit', 0);
    expect(() => runner.start(REQ)).not.toThrow();
  });

  it('cancel は killTree を呼び cancelled にする。後続の exit で上書きされない', () => {
    const { runner, killTree, children } = setup();
    const { runId } = runner.start(REQ);
    runner.cancel(runId);
    expect(killTree).toHaveBeenCalledWith(1234);
    children[0].emit('exit', 1);
    expect(runner.list().find((r) => r.runId === runId)?.status).toBe('cancelled');
  });

  it('spawn の error イベント（ENOENT 等）で failed になりメッセージがログに残る', () => {
    const { runner, children } = setup();
    const { runId } = runner.start(REQ);
    children[0].emit('error', new Error('spawn claude ENOENT'));
    expect(runner.list().find((r) => r.runId === runId)?.status).toBe('failed');
    expect(runner.getLog(runId)).toContain('ENOENT');
  });

  it('ログは上限を超えた分から切り捨てる', () => {
    const { runner, children } = setup();
    const { runId } = runner.start(REQ);
    children[0].stdout.emit('data', 'x'.repeat(1_000_001));
    expect(runner.getLog(runId).length).toBe(1_000_000);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm --filter @handoff/desktop test -- src/main/cli-runner.test.ts`
Expected: FAIL

- [ ] **Step 3: cli-runner を実装**

`desktop/src/main/cli-runner.ts`:

```ts
// CLI 子プロセスの起動・出力ストリーミング・実行管理。spawn/kill は注入してテスト可能にする。
import type { RunEvent, RunStatus, RunSummary } from '@handoff/shared';

export type TemplateVars = Readonly<Record<'prompt' | 'taskId' | 'title', string>>;

/** argsTemplate のプレースホルダを要素単位で展開する（文字列連結でコマンドを組まない）。 */
export function expandArgs(template: readonly string[], vars: TemplateVars): string[] {
  return template.map((arg) =>
    arg.replace(/\{(prompt|taskId|title)\}/g, (_m, key: keyof TemplateVars) => vars[key]),
  );
}

/** promptTemplate の {taskId} / {title} を埋める。 */
export function renderPrompt(template: string, vars: { taskId: string; title: string }): string {
  return template.replace(/\{(taskId|title)\}/g, (_m, key: 'taskId' | 'title') => vars[key]);
}

/**
 * Windows の shell:true（cmd.exe）向けの引数クォート。全体を二重引用符で包み、内部の " は "" に。
 * 制約: プロンプトに改行を含めない（settings-core が単一行テンプレートを前提とする）。
 */
export function quoteForCmd(arg: string): string {
  return `"${arg.replace(/"/g, '""')}"`;
}

export interface ChildLike {
  pid?: number;
  stdout: { on(event: 'data', cb: (chunk: Buffer | string) => void): unknown } | null;
  stderr: { on(event: 'data', cb: (chunk: Buffer | string) => void): unknown } | null;
  on(event: 'exit', cb: (code: number | null) => void): unknown;
  on(event: 'error', cb: (err: Error) => void): unknown;
}

export type SpawnLike = (
  command: string,
  args: string[],
  options: { cwd: string; shell: boolean },
) => ChildLike;

export type KillTreeFn = (pid: number) => void;

export interface StartRequest {
  taskId: string;
  taskTitle: string;
  cliName: string;
  command: string;
  args: string[];
  cwd: string;
}

const MAX_LOG_CHARS = 1_000_000;

interface RunEntry {
  summary: RunSummary;
  log: string;
  child: ChildLike | null;
}

export class CliRunner {
  private readonly runs = new Map<string, RunEntry>();
  private seq = 0;

  constructor(
    private readonly spawnFn: SpawnLike,
    private readonly killTree: KillTreeFn,
    private readonly emit: (ev: RunEvent) => void,
  ) {}

  isTaskRunning(taskId: string): boolean {
    return [...this.runs.values()].some(
      (r) => r.summary.taskId === taskId && r.summary.status === 'running',
    );
  }

  start(req: StartRequest): { runId: string } {
    if (this.isTaskRunning(req.taskId)) {
      throw new Error(`タスク ${req.taskId} は実行中です`);
    }
    this.seq += 1;
    const runId = `run-${this.seq}`;
    const summary: RunSummary = {
      runId,
      taskId: req.taskId,
      taskTitle: req.taskTitle,
      cliName: req.cliName,
      status: 'running',
      exitCode: null,
    };
    this.runs.set(runId, { summary, log: '', child: null });

    const child = this.spawnFn(req.command, req.args.map(quoteForCmd), {
      cwd: req.cwd,
      shell: true,
    });
    const entry = this.runs.get(runId);
    if (entry) entry.child = child;

    child.stdout?.on('data', (chunk) => this.append(runId, 'stdout', String(chunk)));
    child.stderr?.on('data', (chunk) => this.append(runId, 'stderr', String(chunk)));
    child.on('error', (err) => {
      this.append(runId, 'stderr', `${err.message}\n`);
      this.finish(runId, 'failed', null);
    });
    child.on('exit', (code) => {
      this.finish(runId, code === 0 ? 'succeeded' : 'failed', code);
    });

    this.emit({ runId, type: 'status', run: summary });
    return { runId };
  }

  cancel(runId: string): void {
    const entry = this.runs.get(runId);
    if (!entry || entry.summary.status !== 'running') return;
    if (entry.child?.pid !== undefined) this.killTree(entry.child.pid);
    this.finish(runId, 'cancelled', null);
  }

  /** 新しい順のサマリ一覧。 */
  list(): RunSummary[] {
    return [...this.runs.values()].map((r) => r.summary).reverse();
  }

  getLog(runId: string): string {
    return this.runs.get(runId)?.log ?? '';
  }

  private append(runId: string, type: 'stdout' | 'stderr', chunk: string): void {
    const entry = this.runs.get(runId);
    if (!entry) return;
    entry.log = (entry.log + chunk).slice(-MAX_LOG_CHARS);
    this.emit({ runId, type, chunk });
  }

  private finish(runId: string, status: RunStatus, exitCode: number | null): void {
    const entry = this.runs.get(runId);
    if (!entry || entry.summary.status !== 'running') return; // cancelled 後の exit を無視
    entry.summary = { ...entry.summary, status, exitCode };
    this.emit({ runId, type: 'status', run: entry.summary });
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm --filter @handoff/desktop test`
Expected: 全 PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/main/cli-runner.ts desktop/src/main/cli-runner.test.ts
git commit -m "feat(desktop): cli-runner with injectable spawn, cancel and log streaming"
```

---

### Task 8: 実行系の IPC / preload 配線

**Files:**
- Modify: `desktop/src/main/index.ts`
- Modify: `desktop/src/preload/index.ts`

**Interfaces:**
- Consumes: Task 7 の `CliRunner` ほか、Task 3 の `SettingsStore`
- Produces: IPC `run:start` / `run:cancel` / `run:list`、イベントチャンネル `run:event`。ブリッジの `runTask` / `cancelRun` / `listRuns` / `onRunEvent` が完成し `HandoffDesktopBridge` 型を満たす

- [ ] **Step 1: main に実行系 IPC を追加**

`desktop/src/main/index.ts` — import を追加:

```ts
import { existsSync } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import type { RunTaskRequest } from '@handoff/shared';
import { CliRunner, expandArgs, renderPrompt } from './cli-runner.js';
```

Windows のプロセスツリー kill（`wireIpc` の上あたりに配置）:

```ts
function killTree(pid: number): void {
  // shell:true 経由の子（cmd → CLI）ごと確実に止めるため taskkill /T /F を使う
  execFile('taskkill', ['/pid', String(pid), '/T', '/F']);
}
```

`wireIpc()` 内に追加:

```ts
  const runner = new CliRunner(
    (command, args, options) => spawn(command, args, options),
    killTree,
    (ev) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('run:event', ev);
      }
    },
  );

  ipcMain.handle('run:start', (_e, req: RunTaskRequest) => {
    const current = settings.load();
    const cli = current.cliDefinitions.find((c) => c.id === req.cliId);
    if (!cli) throw new Error(`CLI 定義が見つかりません: ${req.cliId}`);
    if (!existsSync(req.cwd)) throw new Error(`フォルダが存在しません: ${req.cwd}`);
    const prompt = renderPrompt(current.promptTemplate, {
      taskId: req.taskId,
      title: req.taskTitle,
    });
    const args = expandArgs(cli.argsTemplate, {
      prompt,
      taskId: req.taskId,
      title: req.taskTitle,
    });
    return runner.start({
      taskId: req.taskId,
      taskTitle: req.taskTitle,
      cliName: cli.name,
      command: cli.command,
      args,
      cwd: req.cwd,
    });
  });
  ipcMain.handle('run:cancel', (_e, runId: string) => runner.cancel(runId));
  ipcMain.handle('run:list', () => runner.list());
```

- [ ] **Step 2: preload を完成させる**

`desktop/src/preload/index.ts` を以下に置き換え（`HandoffDesktopBridge` を satisfies で検証）:

```ts
// preload。contextBridge で window.handoffDesktop を公開する（薄い転送層、ロジック禁止）。
import { contextBridge, ipcRenderer } from 'electron';
import type {
  DesktopSettings,
  HandoffDesktopBridge,
  RunEvent,
  RunSummary,
  RunTaskRequest,
} from '@handoff/shared';

const bridge = {
  runTask: (req: RunTaskRequest): Promise<{ runId: string }> =>
    ipcRenderer.invoke('run:start', req),
  cancelRun: (runId: string): Promise<void> => ipcRenderer.invoke('run:cancel', runId),
  listRuns: (): Promise<RunSummary[]> => ipcRenderer.invoke('run:list'),
  onRunEvent: (cb: (ev: RunEvent) => void): (() => void) => {
    const listener = (_e: unknown, ev: RunEvent): void => cb(ev);
    ipcRenderer.on('run:event', listener);
    return () => {
      ipcRenderer.removeListener('run:event', listener);
    };
  },
  getSettings: (): Promise<DesktopSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<DesktopSettings>): Promise<DesktopSettings> =>
    ipcRenderer.invoke('settings:set', patch),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pick-folder'),
  signIn: (): Promise<{ idToken: string }> => ipcRenderer.invoke('auth:sign-in'),
} satisfies HandoffDesktopBridge;

contextBridge.exposeInMainWorld('handoffDesktop', bridge);
```

- [ ] **Step 3: ビルド・typecheck・テスト回帰確認**

Run: `pnpm --filter @handoff/desktop build && pnpm --filter @handoff/desktop typecheck && pnpm --filter @handoff/desktop test`
Expected: 全 PASS

- [ ] **Step 4: Commit**

```bash
git add desktop/src
git commit -m "feat(desktop): wire run ipc and complete preload bridge"
```

---

### Task 9: web の実行 UI — RunTaskButton + RunDialog（TDD）

AI オーナーのカードに実行ボタンを出し、ダイアログで CLI と作業フォルダを確定して実行する。

**Files:**
- Create: `web/src/desktop/RunDialog.tsx`
- Create: `web/src/desktop/RunTaskButton.tsx`
- Test: `web/src/desktop/RunTaskButton.test.tsx`
- Modify: `web/src/components/Card.tsx`（ボタン設置）

**Interfaces:**
- Consumes: Task 1 の `HandoffDesktopBridge` / `RunTaskRequest`、Task 4 の `desktopBridge()`、shared の `isAiOwner`
- Produces: `RunTaskButton({ task, bridge? })`（ブリッジ無し・human オーナーでは null を返す）、`RunDialog({ task, bridge, onClose })`

- [ ] **Step 1: 失敗するテストを書く**

`web/src/desktop/RunTaskButton.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HandoffDesktopBridge, Task } from '@handoff/shared';
import { RunTaskButton } from './RunTaskButton';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'AI にやってほしい仕事',
    status: 'needs-ai',
    owner: 'claude-code',
    department: null,
    role: null,
    priority: 'P2',
    action_type: 'other',
    tags: [],
    handoff_note: '',
    blocked_reason: null,
    project: 'handoff',
    milestone: null,
    created_by: 'me@example.com',
    created_at: '2026-07-14T00:00:00.000Z',
    updated_at: '2026-07-14T00:00:00.000Z',
    activity: [],
    ...overrides,
  } as Task;
}

function makeBridge(overrides: Partial<HandoffDesktopBridge> = {}): HandoffDesktopBridge {
  return {
    runTask: vi.fn().mockResolvedValue({ runId: 'run-1' }),
    cancelRun: vi.fn(),
    listRuns: vi.fn().mockResolvedValue([]),
    onRunEvent: vi.fn().mockReturnValue(() => {}),
    getSettings: vi.fn().mockResolvedValue({
      apiBaseUrl: '',
      cliDefinitions: [
        {
          id: 'claude-code',
          name: 'Claude Code',
          command: 'claude',
          argsTemplate: ['-p', '{prompt}'],
          defaultForOwners: ['claude-code'],
        },
        {
          id: 'codex',
          name: 'Codex CLI',
          command: 'codex',
          argsTemplate: ['exec', '{prompt}'],
          defaultForOwners: ['codex'],
        },
      ],
      projectFolderMap: { handoff: 'C:/dev/handoff' },
      promptTemplate: 'do {taskId}',
    }),
    setSettings: vi.fn().mockResolvedValue({}),
    pickFolder: vi.fn().mockResolvedValue('C:/picked'),
    signIn: vi.fn(),
    ...overrides,
  } as HandoffDesktopBridge;
}

describe('RunTaskButton', () => {
  it('ブリッジが無ければ何も描画しない', () => {
    const { container } = render(<RunTaskButton task={makeTask()} bridge={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('human オーナーのタスクには表示しない', () => {
    const { container } = render(
      <RunTaskButton task={makeTask({ owner: 'human' })} bridge={makeBridge()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('ダイアログで owner に対応する CLI が既定選択され、実行できる', async () => {
    const user = userEvent.setup();
    const bridge = makeBridge();
    render(<RunTaskButton task={makeTask()} bridge={bridge} />);

    await user.click(screen.getByRole('button', { name: 'AI実行' }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'CLI' })).toHaveValue('claude-code'),
    );
    // project=handoff はマッピング済みなのでフォルダが解決されている
    expect(screen.getByText('C:/dev/handoff')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '実行' }));
    await waitFor(() =>
      expect(bridge.runTask).toHaveBeenCalledWith({
        taskId: 'task-1',
        taskTitle: 'AI にやってほしい仕事',
        cliId: 'claude-code',
        cwd: 'C:/dev/handoff',
      }),
    );
  });

  it('未マッピングの project はフォルダ選択で解決し、マッピングを保存する', async () => {
    const user = userEvent.setup();
    const bridge = makeBridge();
    render(<RunTaskButton task={makeTask({ project: 'newproj' })} bridge={bridge} />);

    await user.click(screen.getByRole('button', { name: 'AI実行' }));
    await waitFor(() => screen.getByRole('button', { name: 'フォルダを選択' }));
    // フォルダ未解決の間は実行できない
    expect(screen.getByRole('button', { name: '実行' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'フォルダを選択' }));
    await waitFor(() =>
      expect(bridge.setSettings).toHaveBeenCalledWith({
        projectFolderMap: { handoff: 'C:/dev/handoff', newproj: 'C:/picked' },
      }),
    );
    expect(screen.getByRole('button', { name: '実行' })).toBeEnabled();
  });

  it('runTask の失敗はダイアログ内にエラー表示する', async () => {
    const user = userEvent.setup();
    const bridge = makeBridge({
      runTask: vi.fn().mockRejectedValue(new Error('コマンドが見つかりません')),
    });
    render(<RunTaskButton task={makeTask()} bridge={bridge} />);
    await user.click(screen.getByRole('button', { name: 'AI実行' }));
    await waitFor(() => screen.getByRole('button', { name: '実行' }));
    await user.click(screen.getByRole('button', { name: '実行' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('コマンドが見つかりません');
  });
});
```

（注: `userEvent` が未導入の場合は `@testing-library/user-event` を web の devDependencies に追加する。既存テストが `fireEvent` を使っているなら合わせてもよいが、テスト内容は上記と同等にする。`makeTask` は既存テストのタスクフィクスチャがあればそちらに合わせる。）

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm --filter @handoff/web test -- src/desktop/RunTaskButton.test.tsx`
Expected: FAIL

- [ ] **Step 3: RunDialog と RunTaskButton を実装**

`web/src/desktop/RunDialog.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { DesktopSettings, HandoffDesktopBridge, Task } from '@handoff/shared';

interface RunDialogProps {
  task: Task;
  bridge: HandoffDesktopBridge;
  onClose: () => void;
}

/** CLI と作業フォルダを確定してタスクを実行するダイアログ。 */
export function RunDialog({ task, bridge, onClose }: RunDialogProps) {
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [cliId, setCliId] = useState('');
  const [cwd, setCwd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    bridge
      .getSettings()
      .then((s) => {
        if (cancelled) return;
        setSettings(s);
        const def =
          s.cliDefinitions.find((d) => d.defaultForOwners.includes(task.owner)) ??
          s.cliDefinitions[0];
        if (def) setCliId(def.id);
        if (task.project && s.projectFolderMap[task.project]) {
          setCwd(s.projectFolderMap[task.project]);
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [bridge, task]);

  async function handlePickFolder(): Promise<void> {
    const folder = await bridge.pickFolder();
    if (!folder) return;
    setCwd(folder);
    // project 付きタスクなら選択結果をマッピングとして保存し、次回から自動解決する
    if (task.project) {
      const map = { ...(settings?.projectFolderMap ?? {}), [task.project]: folder };
      const updated = await bridge.setSettings({ projectFolderMap: map });
      setSettings(updated);
    }
  }

  async function handleRun(): Promise<void> {
    if (!cliId || !cwd) return;
    setSubmitting(true);
    setError(null);
    try {
      await bridge.runTask({ taskId: task.id, taskTitle: task.title, cliId, cwd });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="run-dialog"
        role="dialog"
        aria-label="タスクを CLI で実行"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="run-dialog__title">AI実行 — {task.title}</h2>
        {error && (
          <p role="alert" className="run-dialog__error">
            {error}
          </p>
        )}
        <label>
          CLI
          <select
            aria-label="CLI"
            value={cliId}
            onChange={(e) => setCliId(e.target.value)}
          >
            {(settings?.cliDefinitions ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <div className="run-dialog__cwd">
          <span>作業フォルダ: </span>
          {cwd ? <span>{cwd}</span> : <span>未設定</span>}
          <button type="button" onClick={() => void handlePickFolder()}>
            フォルダを選択
          </button>
        </div>
        <div className="run-dialog__actions">
          <button type="button" onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            disabled={!cliId || !cwd || submitting}
            onClick={() => void handleRun()}
          >
            実行
          </button>
        </div>
      </div>
    </div>
  );
}
```

`web/src/desktop/RunTaskButton.tsx`:

```tsx
import { useState } from 'react';
import { isAiOwner, type HandoffDesktopBridge, type Task } from '@handoff/shared';
import { desktopBridge } from './bridge';
import { RunDialog } from './RunDialog';

interface RunTaskButtonProps {
  task: Task;
  /** テスト用に差し替え可能。既定は window.handoffDesktop。 */
  bridge?: HandoffDesktopBridge | null;
}

/** AI オーナーのタスクをローカル CLI で実行するボタン。デスクトップ版のみ表示。 */
export function RunTaskButton({ task, bridge = desktopBridge() }: RunTaskButtonProps) {
  const [open, setOpen] = useState(false);
  if (!bridge || !isAiOwner(task.owner)) return null;
  return (
    <>
      <button
        type="button"
        aria-label="AI実行"
        title="ローカル CLI で実行"
        onClick={() => setOpen(true)}
      >
        ▶
      </button>
      {open && <RunDialog task={task} bridge={bridge} onClose={() => setOpen(false)} />}
    </>
  );
}
```

（ダイアログの className は既存の `dialog-backdrop` / `block-dialog` 系の流儀。`styles.css` に `.run-dialog` のスタイルを `.block-dialog` に準じて追加する。）

- [ ] **Step 4: Card にボタンを設置**

`web/src/components/Card.tsx` — import 追加:

```tsx
import { RunTaskButton } from '../desktop/RunTaskButton';
```

`card__actions` の先頭（`{canStart && (` の直前）に追加:

```tsx
        <RunTaskButton task={task} />
```

（ブラウザ・既存テストではブリッジが無いので null になり、既存の Card テストは影響を受けない。）

- [ ] **Step 5: テストが通ることを確認**

Run: `pnpm --filter @handoff/web test`
Expected: 全 PASS（新規 5件 + 既存回帰なし）

- [ ] **Step 6: Commit**

```bash
git add web/src/desktop/ web/src/components/Card.tsx web/src/styles.css web/package.json pnpm-lock.yaml
git commit -m "feat(web): run task button and dialog for desktop"
```

---

### Task 10: web の実行ログパネル — useRunEvents + RunPanel（TDD）

**Files:**
- Create: `web/src/desktop/useRunEvents.ts`
- Create: `web/src/desktop/RunPanel.tsx`
- Test: `web/src/desktop/RunPanel.test.tsx`
- Modify: `web/src/App.tsx`（サインイン済み画面に設置）

**Interfaces:**
- Consumes: Task 1 の `RunEvent` / `RunSummary`、Task 4 の `desktopBridge()`
- Produces: `useRunEvents(bridge): { runs: RunSummary[]; logs: Record<string, string> }`、`RunPanel({ bridge? })`（ブリッジ無しで null）

- [ ] **Step 1: 失敗するテストを書く**

`web/src/desktop/RunPanel.test.tsx`:

```tsx
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HandoffDesktopBridge, RunEvent } from '@handoff/shared';
import { RunPanel } from './RunPanel';

function makeBridge(): { bridge: HandoffDesktopBridge; emit: (ev: RunEvent) => void } {
  let handler: ((ev: RunEvent) => void) | null = null;
  const bridge = {
    runTask: vi.fn(),
    cancelRun: vi.fn().mockResolvedValue(undefined),
    listRuns: vi.fn().mockResolvedValue([]),
    onRunEvent: vi.fn((cb: (ev: RunEvent) => void) => {
      handler = cb;
      return () => {
        handler = null;
      };
    }),
    getSettings: vi.fn(),
    setSettings: vi.fn(),
    pickFolder: vi.fn(),
    signIn: vi.fn(),
  } as unknown as HandoffDesktopBridge;
  return { bridge, emit: (ev) => handler?.(ev) };
}

const RUNNING = {
  runId: 'run-1',
  taskId: 't1',
  taskTitle: 'タスクA',
  cliName: 'Claude Code',
  status: 'running',
  exitCode: null,
} as const;

describe('RunPanel', () => {
  it('ブリッジが無ければ何も描画しない', () => {
    const { container } = render(<RunPanel bridge={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('status イベントで実行が一覧に現れ、stdout がログに追記される', async () => {
    const { bridge, emit } = makeBridge();
    render(<RunPanel bridge={bridge} />);
    await waitFor(() => expect(bridge.listRuns).toHaveBeenCalled());

    act(() => {
      emit({ runId: 'run-1', type: 'status', run: { ...RUNNING } });
      emit({ runId: 'run-1', type: 'stdout', chunk: 'こんにちは\n' });
    });

    expect(screen.getByText('タスクA')).toBeInTheDocument();
    expect(screen.getByText(/running/)).toBeInTheDocument();
    expect(screen.getByText(/こんにちは/)).toBeInTheDocument();
  });

  it('実行中はキャンセルボタンが出て cancelRun を呼ぶ', async () => {
    const user = userEvent.setup();
    const { bridge, emit } = makeBridge();
    render(<RunPanel bridge={bridge} />);
    await waitFor(() => expect(bridge.listRuns).toHaveBeenCalled());

    act(() => {
      emit({ runId: 'run-1', type: 'status', run: { ...RUNNING } });
    });
    await user.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(bridge.cancelRun).toHaveBeenCalledWith('run-1');

    act(() => {
      emit({
        runId: 'run-1',
        type: 'status',
        run: { ...RUNNING, status: 'cancelled' },
      });
    });
    expect(screen.queryByRole('button', { name: 'キャンセル' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm --filter @handoff/web test -- src/desktop/RunPanel.test.tsx`
Expected: FAIL

- [ ] **Step 3: フックとパネルを実装**

`web/src/desktop/useRunEvents.ts`:

```ts
import { useEffect, useState } from 'react';
import type { HandoffDesktopBridge, RunSummary } from '@handoff/shared';

/** renderer 側で保持するログの上限（1実行あたり）。超過分は先頭から捨てる。 */
const MAX_CLIENT_LOG_CHARS = 200_000;

export interface RunsState {
  runs: RunSummary[];
  logs: Record<string, string>;
}

/** 実行イベントを購読し、実行一覧とログを状態として返す。 */
export function useRunEvents(bridge: HandoffDesktopBridge): RunsState {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [logs, setLogs] = useState<Record<string, string>>({});

  useEffect(() => {
    void bridge.listRuns().then(setRuns);
    return bridge.onRunEvent((ev) => {
      if (ev.type === 'status') {
        setRuns((prev) => [ev.run, ...prev.filter((r) => r.runId !== ev.run.runId)]);
      } else {
        setLogs((prev) => ({
          ...prev,
          [ev.runId]: ((prev[ev.runId] ?? '') + ev.chunk).slice(-MAX_CLIENT_LOG_CHARS),
        }));
      }
    });
  }, [bridge]);

  return { runs, logs };
}
```

`web/src/desktop/RunPanel.tsx`:

```tsx
import { useState } from 'react';
import type { HandoffDesktopBridge } from '@handoff/shared';
import { desktopBridge } from './bridge';
import { useRunEvents } from './useRunEvents';

interface RunPanelProps {
  /** テスト用に差し替え可能。既定は window.handoffDesktop。 */
  bridge?: HandoffDesktopBridge | null;
}

/** CLI 実行の一覧とログを表示するパネル。デスクトップ版のみ表示。 */
export function RunPanel({ bridge = desktopBridge() }: RunPanelProps) {
  if (!bridge) return null;
  return <RunPanelInner bridge={bridge} />;
}

function RunPanelInner({ bridge }: { bridge: HandoffDesktopBridge }) {
  const { runs, logs } = useRunEvents(bridge);
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  if (runs.length === 0) return null;

  return (
    <section className="run-panel" aria-label="CLI 実行ログ">
      <h2 className="run-panel__title">実行</h2>
      <ul className="run-panel__list">
        {runs.map((run) => (
          <li key={run.runId} className="run-panel__item" data-status={run.status}>
            <button
              type="button"
              className="run-panel__row"
              onClick={() => setOpenRunId(openRunId === run.runId ? null : run.runId)}
            >
              <span className="run-panel__status">{run.status}</span>
              <span className="run-panel__task">{run.taskTitle}</span>
              <span className="run-panel__cli">{run.cliName}</span>
              {run.exitCode !== null && <span>exit {run.exitCode}</span>}
            </button>
            {run.status === 'running' && (
              <button
                type="button"
                aria-label="キャンセル"
                onClick={() => void bridge.cancelRun(run.runId)}
              >
                キャンセル
              </button>
            )}
            {(openRunId === run.runId || run.status === 'running') && (
              <pre className="run-panel__log">{logs[run.runId] ?? ''}</pre>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: App に設置**

`web/src/App.tsx` — import 追加:

```tsx
import { RunPanel } from './desktop/RunPanel';
```

サインイン済みブロックの `<Board ... />` の直後に追加:

```tsx
          <RunPanel />
```

`web/src/styles.css` に `.run-panel` 系の最小スタイル（既存のセクション/カードのトーンに合わせる。ログは `overflow-x: auto` の `pre`、`max-height` 約 20rem で内部スクロール）を追加。

- [ ] **Step 5: テストが通ることを確認**

Run: `pnpm --filter @handoff/web test && pnpm --filter @handoff/web typecheck`
Expected: 全 PASS

- [ ] **Step 6: 手動検証（E2E: タスク実行）**

```bash
pnpm --filter @handoff/web build
pnpm --filter @handoff/desktop dev
```

Expected: サインイン → AI オーナーのタスクの ▶ → ダイアログで CLI/フォルダ確定 → 実行 → パネルにログが流れ、CLI が handoff-mcp でタスクを取得・遷移させるとポーリング（12秒）でレーンが動く。

- [ ] **Step 7: Commit**

```bash
git add web/src/desktop/ web/src/App.tsx web/src/styles.css
git commit -m "feat(web): run panel with streaming cli logs"
```

---

### Task 11: デスクトップ設定画面（TDD）

**Files:**
- Create: `web/src/desktop/DesktopSettingsDialog.tsx`
- Test: `web/src/desktop/DesktopSettingsDialog.test.tsx`
- Modify: `web/src/App.tsx`（ヘッダーに ⚙ ボタン）

**Interfaces:**
- Consumes: ブリッジの `getSettings` / `setSettings` / `pickFolder`、Task 4 の `setApiBase`
- Produces: `DesktopSettingsDialog({ bridge, onClose })`。保存成功時に `setApiBase(saved.apiBaseUrl)` を呼んでから閉じる

- [ ] **Step 1: 失敗するテストを書く**

`web/src/desktop/DesktopSettingsDialog.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DesktopSettings, HandoffDesktopBridge } from '@handoff/shared';
import { DesktopSettingsDialog } from './DesktopSettingsDialog';

const SETTINGS: DesktopSettings = {
  apiBaseUrl: 'https://api.example.com',
  cliDefinitions: [
    {
      id: 'claude-code',
      name: 'Claude Code',
      command: 'claude',
      argsTemplate: ['-p', '{prompt}'],
      defaultForOwners: ['claude-code'],
    },
  ],
  projectFolderMap: { handoff: 'C:/dev/handoff' },
  promptTemplate: 'do {taskId}',
};

function makeBridge(overrides: Partial<HandoffDesktopBridge> = {}): HandoffDesktopBridge {
  return {
    runTask: vi.fn(),
    cancelRun: vi.fn(),
    listRuns: vi.fn(),
    onRunEvent: vi.fn(),
    getSettings: vi.fn().mockResolvedValue(SETTINGS),
    setSettings: vi.fn().mockImplementation((patch: Partial<DesktopSettings>) =>
      Promise.resolve({ ...SETTINGS, ...patch }),
    ),
    pickFolder: vi.fn().mockResolvedValue('C:/other'),
    signIn: vi.fn(),
    ...overrides,
  } as HandoffDesktopBridge;
}

describe('DesktopSettingsDialog', () => {
  it('現在の設定値を表示する', async () => {
    render(<DesktopSettingsDialog bridge={makeBridge()} onClose={() => {}} />);
    expect(await screen.findByLabelText('API ベース URL')).toHaveValue(
      'https://api.example.com',
    );
    expect(screen.getByLabelText('プロンプトテンプレート')).toHaveValue('do {taskId}');
    expect(screen.getByDisplayValue('Claude Code')).toBeInTheDocument();
    expect(screen.getByText('C:/dev/handoff')).toBeInTheDocument();
  });

  it('編集して保存すると setSettings にパッチが渡り、閉じる', async () => {
    const user = userEvent.setup();
    const bridge = makeBridge();
    const onClose = vi.fn();
    render(<DesktopSettingsDialog bridge={bridge} onClose={onClose} />);

    const urlInput = await screen.findByLabelText('API ベース URL');
    await user.clear(urlInput);
    await user.type(urlInput, 'https://next.example.com');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(bridge.setSettings).toHaveBeenCalledWith(
        expect.objectContaining({ apiBaseUrl: 'https://next.example.com' }),
      ),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('CLI 定義を追加できる（args はスペース区切り入力）', async () => {
    const user = userEvent.setup();
    const bridge = makeBridge();
    render(<DesktopSettingsDialog bridge={bridge} onClose={() => {}} />);
    await screen.findByLabelText('API ベース URL');

    await user.click(screen.getByRole('button', { name: 'CLI を追加' }));
    const rows = screen.getAllByRole('group', { name: /CLI 定義/ });
    const newRow = rows[rows.length - 1];
    await user.type(within(newRow).getByLabelText('ID'), 'codex');
    await user.type(within(newRow).getByLabelText('名前'), 'Codex CLI');
    await user.type(within(newRow).getByLabelText('コマンド'), 'codex');
    await user.type(within(newRow).getByLabelText('引数'), 'exec {prompt}');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(bridge.setSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          cliDefinitions: expect.arrayContaining([
            expect.objectContaining({ id: 'codex', argsTemplate: ['exec', '{prompt}'] }),
          ]),
        }),
      ),
    );
  });

  it('保存失敗（検証エラー）はダイアログ内に表示する', async () => {
    const user = userEvent.setup();
    const bridge = makeBridge({
      setSettings: vi.fn().mockRejectedValue(new Error('apiBaseUrl は http(s) の URL が必要です')),
    });
    render(<DesktopSettingsDialog bridge={bridge} onClose={() => {}} />);
    await screen.findByLabelText('API ベース URL');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('apiBaseUrl');
  });
});
```

（`within` は `@testing-library/react` から import する。）

- [ ] **Step 2: テストが失敗することを確認**

Run: `pnpm --filter @handoff/web test -- src/desktop/DesktopSettingsDialog.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装**

`web/src/desktop/DesktopSettingsDialog.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { CliDefinition, DesktopSettings, HandoffDesktopBridge, Owner } from '@handoff/shared';
import { setApiBase } from '../api-client';

interface DesktopSettingsDialogProps {
  bridge: HandoffDesktopBridge;
  onClose: () => void;
}

/** CLI 定義編集用のフォーム行。argsTemplate はスペース区切りのテキストで編集する。 */
interface CliRow {
  id: string;
  name: string;
  command: string;
  argsText: string;
  defaultForOwners: Owner[];
}

const AI_OWNERS: Owner[] = ['cowork', 'claude-code', 'codex'];

function toRow(def: CliDefinition): CliRow {
  return {
    id: def.id,
    name: def.name,
    command: def.command,
    argsText: def.argsTemplate.join(' '),
    defaultForOwners: def.defaultForOwners,
  };
}

function toDefinition(row: CliRow): CliDefinition {
  return {
    id: row.id,
    name: row.name,
    command: row.command,
    // 制約: 引数はスペース区切り（{prompt} は単独トークンで置く）
    argsTemplate: row.argsText.split(/\s+/).filter((a) => a !== ''),
    defaultForOwners: row.defaultForOwners,
  };
}

/** デスクトップ設定（API URL / CLI 定義 / フォルダマッピング / プロンプト）を編集するダイアログ。 */
export function DesktopSettingsDialog({ bridge, onClose }: DesktopSettingsDialogProps) {
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [promptTemplate, setPromptTemplate] = useState('');
  const [cliRows, setCliRows] = useState<CliRow[]>([]);
  const [folderMap, setFolderMap] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    bridge
      .getSettings()
      .then((s: DesktopSettings) => {
        if (cancelled) return;
        setApiBaseUrl(s.apiBaseUrl);
        setPromptTemplate(s.promptTemplate);
        setCliRows(s.cliDefinitions.map(toRow));
        setFolderMap(s.projectFolderMap);
        setLoaded(true);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  function updateRow(index: number, patch: Partial<CliRow>): void {
    setCliRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function toggleOwner(index: number, owner: Owner): void {
    setCliRows((rows) =>
      rows.map((r, i) => {
        if (i !== index) return r;
        const has = r.defaultForOwners.includes(owner);
        return {
          ...r,
          defaultForOwners: has
            ? r.defaultForOwners.filter((o) => o !== owner)
            : [...r.defaultForOwners, owner],
        };
      }),
    );
  }

  async function handleChangeFolder(project: string): Promise<void> {
    const folder = await bridge.pickFolder();
    if (folder) setFolderMap((m) => ({ ...m, [project]: folder }));
  }

  async function handleSave(): Promise<void> {
    setError(null);
    try {
      const saved = await bridge.setSettings({
        apiBaseUrl,
        promptTemplate,
        cliDefinitions: cliRows.map(toDefinition),
        projectFolderMap: folderMap,
      });
      setApiBase(saved.apiBaseUrl);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="settings-dialog"
        role="dialog"
        aria-label="デスクトップ設定"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="settings-dialog__title">デスクトップ設定</h2>
        {error && (
          <p role="alert" className="settings-dialog__error">
            {error}
          </p>
        )}
        {loaded && (
          <>
            <label>
              API ベース URL
              <input
                aria-label="API ベース URL"
                value={apiBaseUrl}
                placeholder="空欄はビルド時の既定を使う"
                onChange={(e) => setApiBaseUrl(e.target.value)}
              />
            </label>
            <label>
              プロンプトテンプレート
              <textarea
                aria-label="プロンプトテンプレート"
                value={promptTemplate}
                onChange={(e) => setPromptTemplate(e.target.value)}
              />
            </label>

            <h3>CLI 定義</h3>
            {cliRows.map((row, i) => (
              <fieldset key={i} role="group" aria-label={`CLI 定義 ${i + 1}`}>
                <label>
                  ID
                  <input
                    aria-label="ID"
                    value={row.id}
                    onChange={(e) => updateRow(i, { id: e.target.value })}
                  />
                </label>
                <label>
                  名前
                  <input
                    aria-label="名前"
                    value={row.name}
                    onChange={(e) => updateRow(i, { name: e.target.value })}
                  />
                </label>
                <label>
                  コマンド
                  <input
                    aria-label="コマンド"
                    value={row.command}
                    onChange={(e) => updateRow(i, { command: e.target.value })}
                  />
                </label>
                <label>
                  引数
                  <input
                    aria-label="引数"
                    value={row.argsText}
                    placeholder="例: -p {prompt}"
                    onChange={(e) => updateRow(i, { argsText: e.target.value })}
                  />
                </label>
                <span>既定にする owner:</span>
                {AI_OWNERS.map((owner) => (
                  <label key={owner}>
                    <input
                      type="checkbox"
                      checked={row.defaultForOwners.includes(owner)}
                      onChange={() => toggleOwner(i, owner)}
                    />
                    {owner}
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => setCliRows((rows) => rows.filter((_, j) => j !== i))}
                >
                  削除
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              onClick={() =>
                setCliRows((rows) => [
                  ...rows,
                  { id: '', name: '', command: '', argsText: '', defaultForOwners: [] },
                ])
              }
            >
              CLI を追加
            </button>

            <h3>project → フォルダ</h3>
            <ul>
              {Object.entries(folderMap).map(([project, folder]) => (
                <li key={project}>
                  <span>{project}</span>: <span>{folder}</span>
                  <button type="button" onClick={() => void handleChangeFolder(project)}>
                    変更
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setFolderMap((m) =>
                        Object.fromEntries(Object.entries(m).filter(([k]) => k !== project)),
                      )
                    }
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>

            <div className="settings-dialog__actions">
              <button type="button" onClick={onClose}>
                キャンセル
              </button>
              <button type="button" onClick={() => void handleSave()}>
                保存
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: App のヘッダーに設定ボタンを追加**

`web/src/App.tsx` — import 追加:

```tsx
import { desktopBridge } from './desktop/bridge';
import { DesktopSettingsDialog } from './desktop/DesktopSettingsDialog';
```

コンポーネント内に state とブリッジ参照を追加:

```tsx
  const bridge = desktopBridge();
  const [showDesktopSettings, setShowDesktopSettings] = useState(false);
```

`app__auth` div 内（新規タスクボタンの前）に追加:

```tsx
          {bridge && (
            <button
              type="button"
              aria-label="デスクトップ設定"
              title="デスクトップ設定"
              onClick={() => setShowDesktopSettings(true)}
            >
              ⚙
            </button>
          )}
```

`CreateTaskDialog` の後に追加:

```tsx
      {showDesktopSettings && bridge && (
        <DesktopSettingsDialog
          bridge={bridge}
          onClose={() => {
            setShowDesktopSettings(false);
            refreshBoard(); // apiBaseUrl 変更を反映
          }}
        />
      )}
```

- [ ] **Step 5: テスト・typecheck が通ることを確認**

Run: `pnpm --filter @handoff/web test && pnpm --filter @handoff/web typecheck`
Expected: 全 PASS

- [ ] **Step 6: Commit**

```bash
git add web/src/desktop/ web/src/App.tsx web/src/styles.css
git commit -m "feat(web): desktop settings dialog (cli definitions, folder map, prompt)"
```

---

### Task 12: パッケージング（electron-builder）+ ルートスクリプト + ドキュメント

**Files:**
- Create: `desktop/electron-builder.yml`
- Modify: `desktop/package.json`（`package` スクリプトと electron-builder devDependency）
- Modify: `package.json`（ルートに `dev:desktop` / `package:desktop`）
- Create: `docs/DESKTOP.md`
- Modify: `CLAUDE.md`（desktop ワークスペースの追記）

**Interfaces:**
- Consumes: これまでの全成果物
- Produces: Windows NSIS インストーラ（`desktop/release/`）

- [ ] **Step 1: electron-builder 設定**

`desktop/electron-builder.yml`:

```yaml
appId: dev.handoff.desktop
productName: Handoff
directories:
  output: release
files:
  - dist/**
  - package.json
extraResources:
  - from: ../web/dist
    to: web
win:
  target: nsis
```

`desktop/package.json` に追加:

```json
    "package": "node build.mjs && electron-builder --win"
```

devDependencies に `"electron-builder": "^26.0.0"` を追加して `pnpm install`。

- [ ] **Step 2: ルートスクリプトを追加**

ルート `package.json` の scripts に追加:

```json
    "dev:desktop": "pnpm --filter @handoff/desktop dev",
    "package:desktop": "pnpm --filter @handoff/web build && pnpm --filter @handoff/desktop package"
```

- [ ] **Step 3: docs/DESKTOP.md を作成**

内容（要旨。ファイルには以下を日本語で書く）:

- 概要: デスクトップアプリの役割（クラウドボード + ローカル CLI 実行）と ADR-0005 との関係
- 開発手順: `pnpm dev:web` + `HANDOFF_DEV_SERVER_URL=http://localhost:5173 pnpm dev:desktop`（PowerShell では `$env:HANDOFF_DEV_SERVER_URL="http://localhost:5173"`）、または `pnpm --filter @handoff/web build && pnpm dev:desktop`
- ビルド前提 env: `HANDOFF_GOOGLE_CLIENT_ID` / `HANDOFF_GOOGLE_CLIENT_SECRET`（GCP コンソール → 認証情報 → OAuth クライアント ID（デスクトップアプリ）で発行）、`web/.env` の `VITE_FIREBASE_*` と `VITE_API_BASE`
- サーバー側の前提: Cloud Run `handoff-api` の `CORS_ORIGINS` に `app://bundle` を追加（コマンド例は docs/DEPLOYMENT.md の流儀で）
- CLI 側の前提: 実行対象フォルダ（またはユーザースコープ）で handoff-mcp が設定済みであること
- 設定ファイルの場所: `%APPDATA%/Handoff/settings.json`（キー一覧は仕様書 §8 へのリンク）
- パッケージング: `pnpm package:desktop` → `desktop/release/` に NSIS インストーラ
- 制約: CLI 引数はスペース区切り・プロンプトは単一行、ログはメモリ保持（再起動で消える）

- [ ] **Step 4: CLAUDE.md に desktop ワークスペースを追記**

`CLAUDE.md` の Workspaces セクションに追加（dispatcher の注記の前）:

```markdown
- `desktop/` — `@handoff/desktop`: Electron デスクトップアプリ（設計: docs/specs/2026-07-14-desktop-app-design.md、手順: docs/DESKTOP.md）。renderer は `@handoff/web` のビルドを `app://` スキームで同梱し、`window.handoffDesktop` ブリッジ（shared の `HandoffDesktopBridge` 型）の有無で実行ボタン・ログパネル・設定画面を出し分ける。main プロセスの深いモジュール: `cli-runner`（spawn 注入・引数クォート・キャンセル）、`settings`/`settings-core`（userData/settings.json、422 検証）、`auth`/`auth-core`（PKCE ループバック OAuth → Firebase `signInWithCredential`）。ステータス遷移はアプリではなく CLI が handoff-mcp 経由で行う（ADR-0005 維持）。
```

Commands テーブルに追加:

```markdown
| Dev desktop | `pnpm dev:desktop`（先に `pnpm --filter @handoff/web build` か dev server + `HANDOFF_DEV_SERVER_URL`） |
| Desktop インストーラ | `pnpm package:desktop` |
```

- [ ] **Step 5: 手動検証（インストーラ）**

Run: `pnpm package:desktop`
Expected: `desktop/release/` に `Handoff Setup *.exe` が生成され、インストール後にアプリが起動してサインイン→ボード表示→タスク実行ができる

- [ ] **Step 6: 全体回帰**

Run: `pnpm -r test && pnpm -r typecheck`
Expected: 全 PASS

- [ ] **Step 7: Commit**

```bash
git add desktop/electron-builder.yml desktop/package.json package.json pnpm-lock.yaml docs/DESKTOP.md CLAUDE.md
git commit -m "feat(desktop): electron-builder packaging, root scripts and docs"
```

---

## 仕様との対応（カバレッジ）

| 仕様セクション | タスク |
|---|---|
| §3.1 ワークスペース構成 | Task 2 |
| §3.2 app:// 配信・セキュリティ設定 | Task 3 |
| §3.3 web の出し分け | Task 4, 9, 10, 11 |
| §4 preload ブリッジ | Task 1（型）, 3, 6, 8（実装） |
| §5 タスク実行フロー | Task 7, 8, 9 |
| §6 CLI 定義 | Task 2（検証）, 11（編集 UI） |
| §7 認証 | Task 5, 6 |
| §8 設定 | Task 2, 3, 11 |
| §9 エラー処理 | Task 7（ENOENT/二重実行/キャンセル）, 8（フォルダ存在チェック）, 9/11（表示） |
| §10 テスト方針 | 各タスクの TDD ステップ（E2E スモークは Phase 1 では任意のため計画外） |
| §11 実装スライス d1〜d5 | d1=Task 1〜4, d2=Task 5〜6, d3=Task 7〜10, d4=Task 11, d5=Task 12 |
| §11 d6（自動ポーリング, Phase 2） | 対象外（別プランで扱う） |

補足（仕様からの軽微な変更）:
- 仕様 §4 の `runTask(req: { taskId; cliId?; cwd? })` は、解決責務を明確にするため `RunTaskRequest`（全フィールド必須 + `taskTitle`）に変更した。cwd/cliId の解決は renderer（RunDialog）が行い、main は検証と実行だけを行う。
- 仕様 d1 の「暫定トークン認証でボード表示」は省略した。現行 web は人間ログイン専用で X-Board-Token 経路を持たないため（`auth-headers.ts`）、d1 はサインインプロンプト表示までとし、ボード表示は d2（サインイン）完了時に検証する。
