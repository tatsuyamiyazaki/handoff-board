# ADR-0007〜0011 実装計画（in-review レビュー関門・エージェント識別・ボードスコープ拡張）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ADR-0007（in-review 状態＋差し戻し上限）、ADR-0008（actor 形式検証＋セッション記録）、ADR-0011（人間ボードへの機械系作成タスク表示）をボードコード（shared / api / web）に実装する。

**Architecture:** ADR の依存順（0011 → 0008 → 0007）で縦切りに実装する。0011 が `created_by_type` と認証種別（`ActorType`）の配線を導入し、0007 がそれを遷移エンジンの人間例外判定に再利用する。遷移 API（`PATCH /api/board/:id`）・編集・アーカイブは実装済みなので、shared の純関数（`transition.ts` / `create-task.ts` / `edit-task.ts`）の拡張＋ルートへの依存注入追加が中心。

**Tech Stack:** TypeScript (ESM), Fastify, Firebase Admin SDK (Firestore), Vite + React, vitest。

## Global Constraints

- ESM: import は明示的 `.js` 拡張子（例: `from './task.js'`）。`verbatimModuleSyntax` のため型のみの import は `import type`。
- shared に build ステップはない（`src/index.ts` を `workspace:*` で直接消費）。
- shared のドメインロジックのテストは **`api/tests/` に置く**（既存: `transition-engine.test.ts`, `create-task.test.ts`, `edit-task.test.ts`, `config.test.ts`, `board-route.test.ts`, `task-repository.test.ts`）。web のテストはコンポーネントと同階層に colocate。
- テストランナーは vitest。コマンド: `pnpm --filter @handoff/api test`, `pnpm --filter @handoff/web test`, 全体は `pnpm -r test`, 型検査は `pnpm -r typecheck`。
- コメントは既存コードに合わせて日本語。命名・envelope（`ok()`/`fail()`）・`ValidationError(422)` / `AuthError` / `ConflictError(409)` のエラーハンドリング流儀を踏襲。
- `REVIEW_CYCLE_LIMIT` の既定値は **5**（ADR-0007）。
- 秘密情報のハードコード禁止。コミットは conventional commits（`feat:`/`test:`/`docs:`）。Co-Authored-By フッターは付けない（グローバル設定で無効化済み）。
- 作業ブランチ: `feat/adr-0007-0011`（main から分岐。ADR 本文は `docs/adr-0007-0011` ブランチにあるため、先に main へマージされていなければそのブランチから分岐してもよい）。

## 本計画のスコープ外（ADR-0009 / ADR-0010 / handoff-mcp）

以下はボードコードの変更を伴わないため本計画のタスクにしない。実装完了後の別作業として扱う:

- **ADR-0009（CEO オーケストレーター）**: サーバー・スキーマ変更なし。分解規約・逐次スケジューラは cc-agent-harness 側リポジトリのスキル/CLAUDE.md 管理物。着手条件は「本計画（0007・0011）の実装完了」。
- **ADR-0010（承認 Gate のインフラ強制）**: 変更対象はエージェント実行環境の settings.json・GCP IAM（エージェント専用 SA）・GitHub Actions（CI デプロイ＋Environment protection rules）・CLAUDE.md 規約・docs/DEPLOYMENT.md。インフラ作業として別途計画する。
- **handoff-mcp（別リポジトリ）のロックステップ更新**: status enum への `in-review` 追加、reviewer の pull クエリ拡張、`X-Agent-Session` ヘッダー付与、トークンの新 actor 形式（`owner:機能`）への運用値更新。本計画の Task 9 完了後、デプロイ前に必須。

---

## Phase 1: ADR-0011 — created_by_type と人間ボードのスコープ拡張

### Task 1: shared に `created_by_type` を追加し、buildTask が認証種別から刻む

**Files:**
- Modify: `shared/src/task.ts`
- Modify: `shared/src/create-task.ts`
- Modify: `api/src/dev-seed.ts`
- Test: `api/tests/create-task.test.ts`

**Interfaces:**
- Consumes: 既存の `Task` / `buildTask(normalized, deps)`。
- Produces: `export type ActorType = 'human' | 'machine'`（task.ts）、`Task.created_by_type: ActorType`、`BuildTaskDeps.actorType: ActorType`。後続タスク（Task 2 のフィルタ、Task 6 の遷移 deps、Task 7 のルート配線）はこの名前を使う。

- [ ] **Step 1: 失敗するテストを書く**

`api/tests/create-task.test.ts` に追記:

```ts
test('buildTask は認証種別を created_by_type に刻む', () => {
  const normalized = validateCreateTask({
    title: 'T',
    owner: 'claude-code',
    handoff_note: 'メモ',
    status: 'needs-ai',
  });
  const deps = { id: () => 'id-1', now: () => '2026-07-19T00:00:00Z', actor: 'claude-code:ceo' };

  const machine = buildTask(normalized, { ...deps, actorType: 'machine' });
  expect(machine.created_by_type).toBe('machine');

  const human = buildTask(normalized, { ...deps, actorType: 'human' });
  expect(human.created_by_type).toBe('human');
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `pnpm --filter @handoff/api test -- create-task`
Expected: FAIL（`created_by_type` が `undefined`、または `actorType` の型エラー）

- [ ] **Step 3: 実装**

`shared/src/task.ts` — `ActivityEntry` の直前あたりに追加し、`Task` にフィールドを足す:

```ts
/** 認証種別（ADR-0001 の type）。作成主体の記録（ADR-0011）と遷移の人間例外判定（ADR-0007）に使う。 */
export type ActorType = 'human' | 'machine';
```

`Task` インターフェースの `created_by` の直後に追加:

```ts
  /**
   * 作成主体の認証種別（ADR-0011）。人間ボードは「created_by が自分 ∨ machine」を表示する。
   * 既存データの欠落は 'human' として読む（保守的既定。リポジトリ実装が補完する）。
   */
  created_by_type: ActorType;
```

`shared/src/create-task.ts` — `BuildTaskDeps` と `buildTask` を拡張:

```ts
import { /* 既存 imports に追加 */ type ActorType } from './task.js';

/** buildTask の副作用（ID・時刻・操作主体）を注入する依存。 */
export interface BuildTaskDeps {
  id: () => string;
  now: () => string;
  actor: string;
  /** 認証種別（ADR-0011）。created_by_type に刻む。 */
  actorType: ActorType;
}
```

`buildTask` の戻り値オブジェクトで `created_by: deps.actor,` の直後に:

```ts
    created_by_type: deps.actorType,
```

- [ ] **Step 4: 型検査で全構築箇所を洗い出して直す**

Run: `pnpm -r typecheck`
Expected: `Task` リテラルを構築している箇所（`api/src/dev-seed.ts` の 3 件、`api/tests/*.test.ts` のタスクリテラル、web テストのモックタスク）で `created_by_type` 欠落エラー。各リテラルに追加する:

- `api/src/dev-seed.ts`: 3 件すべてに `created_by_type: 'machine',`（`created_by: null,` の直後）。ファイル冒頭のコメントも更新する — シードは機械系作成扱いになり、Task 2 の OR フィルタ導入後は**人間サインイン時にも表示される**ようになる（ADR-0011 帰結に明記された意図的な副作用）。
- テスト内のタスクリテラル: 実態に合わせて `created_by_type: 'human',`（人間メールの created_by）または `'machine',` を追加。`buildTask` 呼び出し箇所には `actorType: 'machine'`（または `'human'`）を追加。

Run: `pnpm -r typecheck` → PASS になるまで繰り返す。

- [ ] **Step 5: テストが通ることを確認**

Run: `pnpm -r test`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add shared/src/task.ts shared/src/create-task.ts api/src/dev-seed.ts api/tests/ web/src/
git commit -m "feat(shared): add created_by_type stamped from auth type (ADR-0011)"
```

### Task 2: 人間ボードの絞り込みを「created_by 一致 ∨ 機械系作成」に拡張

**Files:**
- Modify: `api/src/repository/task-repository.ts:3-7`（`BoardFilter` のドキュメント）
- Modify: `api/src/repository/in-memory-task-repository.ts:17-23`
- Modify: `api/src/repository/firestore-task-repository.ts`
- Modify: `api/src/routes/board.ts:59-67`（コメントのみ）
- Test: `api/tests/task-repository.test.ts`, `api/tests/board-route.test.ts`

**Interfaces:**
- Consumes: Task 1 の `created_by_type`。
- Produces: `BoardFilter.createdBy` の意味変更 — 「`created_by === createdBy` ∨ `created_by_type === 'machine'`」。フィールド名・シグネチャは不変（GET ルートは変更不要）。

- [ ] **Step 1: 失敗するテストを書く**

`api/tests/task-repository.test.ts` に追記（既存のタスク生成ヘルパーがあればそれを使い、なければ最小リテラルで）:

```ts
test('createdBy 指定時、機械系作成タスクも返す（ADR-0011）', async () => {
  const mine = makeTask({ id: 't1', created_by: 'me@example.com', created_by_type: 'human' });
  const others = makeTask({ id: 't2', created_by: 'other@example.com', created_by_type: 'human' });
  const machine = makeTask({ id: 't3', created_by: 'claude-code:ceo', created_by_type: 'machine' });
  const repo = new InMemoryTaskRepository([mine, others, machine]);

  const tasks = await repo.findAll({ createdBy: 'me@example.com' });
  const ids = tasks.map((t) => t.id).sort();
  expect(ids).toEqual(['t1', 't3']); // 自分の作成分＋機械系。他人の人間作成分は見えない
});
```

`api/tests/board-route.test.ts` にも人間パス（Bearer）で GET したとき機械系作成タスクが envelope に含まれるテストを 1 本追加（既存の人間パステストのリポジトリ初期データに `created_by_type: 'machine'` のタスクを足し、レスポンスに含まれることを assert）。

- [ ] **Step 2: テスト失敗を確認**

Run: `pnpm --filter @handoff/api test -- task-repository`
Expected: FAIL（`t3` が含まれない）

- [ ] **Step 3: 実装**

`api/src/repository/task-repository.ts` — `BoardFilter` の doc コメントを更新:

```ts
/** findAll の絞り込み条件。createdBy 指定時は「created_by 一致 ∨ 作成主体が機械系」を返す（ADR-0011）。 */
export interface BoardFilter {
  /** 人間ボードの絞り込み。自分の作成分に加え、機械系作成タスク（created_by_type='machine'）も含める。 */
  createdBy?: string;
}
```

`api/src/repository/in-memory-task-repository.ts` の `findAll`:

```ts
  async findAll(filter?: BoardFilter): Promise<Task[]> {
    let tasks = [...this.tasks.values()];
    if (filter?.createdBy !== undefined) {
      // 人間ボード: 自分の作成分 ∨ 機械系作成分（ADR-0011）。
      tasks = tasks.filter(
        (t) => t.created_by === filter.createdBy || t.created_by_type === 'machine',
      );
    }
    return tasks.map((t) => structuredClone(t));
  }
```

`api/src/repository/firestore-task-repository.ts` — `Filter` を import し、読み出しの既定値補完ヘルパー `toTask` を導入して全読み出し箇所を置き換える:

```ts
import { Filter, type Firestore } from 'firebase-admin/firestore';
import type { Task } from '@handoff/shared';
import { ConflictError, type BoardFilter, type TaskRepository } from './task-repository.js';

const BOARD_COLLECTION = 'board';
const ARCHIVE_COLLECTION = 'archive';

/** Firestore に保存されているタスク（後方互換: 後付けフィールドは欠落しうる）。 */
type StoredTask = Omit<Task, 'id' | 'created_by_type'> & Partial<Pick<Task, 'created_by_type'>>;

/** 読み出し時の既定値補完。created_by_type 欠落は 'human'（見せない方向に倒す、ADR-0011）。 */
function toTask(id: string, data: StoredTask): Task {
  return { created_by_type: 'human', ...data, id };
}
```

`findAll`:

```ts
  async findAll(filter?: BoardFilter): Promise<Task[]> {
    const collection = this.db.collection(BOARD_COLLECTION);
    // 人間ボード: created_by 一致 ∨ 機械系作成（ADR-0011）。クエリ段階で絞り込む。
    const query =
      filter?.createdBy !== undefined
        ? collection.where(
            Filter.or(
              Filter.where('created_by', '==', filter.createdBy),
              Filter.where('created_by_type', '==', 'machine'),
            ),
          )
        : collection;
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => toTask(doc.id, doc.data() as StoredTask));
  }
```

`findById` / `findArchivedById` / `deleteById` の `{ ...(doc.data() as Omit<Task, 'id'>), id: doc.id }` をすべて `toTask(doc.id, doc.data() as StoredTask)` に置き換える（`update` トランザクション内の `current` は `updated_at` 照合のみなので変更不要）。

注: `Filter.or` は firebase-admin v11.7 以降。`api/package.json` のバージョンが古い場合は ADR-0011 記載どおり 2 クエリ（`created_by ==` と `created_by_type == 'machine'`）を実行して id でマージする実装に差し替える。

`api/src/routes/board.ts:61` のコメントを現実に合わせる:

```ts
    // 人間は「自分が作成したタスク＋機械系作成タスク」（ADR-0011）。機械系はボード全体を見る。
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm --filter @handoff/api test` && `pnpm -r typecheck`
Expected: PASS（Firestore 実装のテストは既存どおり emulator 前提のため skip のまま）

- [ ] **Step 5: コミット**

```bash
git add api/src/repository/ api/src/routes/board.ts api/tests/
git commit -m "feat(api): human board includes machine-created tasks (ADR-0011)"
```

---

## Phase 2: ADR-0008 — actor 形式の起動時検証とセッション記録

### Task 3: BOARD_TOKENS 読み込み時の actor 形式 fail-fast 検証

**Files:**
- Modify: `api/src/config.ts:3-11`
- Test: `api/tests/config.test.ts`

**Interfaces:**
- Consumes: 既存 `loadBoardTokens(raw)`。
- Produces: 同シグネチャのまま、値の形式違反で `Error` を throw（サーバー起動時に落ちる）。合法形式は `owner` または `owner:機能`（`:` は最大 1 個、両側非空）。

- [ ] **Step 1: 失敗するテストを書く**

`api/tests/config.test.ts` に追記:

```ts
describe('loadBoardTokens の actor 形式検証（ADR-0008）', () => {
  test('owner 単独と owner:機能 は受理する', () => {
    const raw = JSON.stringify({
      't1': 'cowork',
      't2': 'claude-code:dev',
      't3': 'claude-code:ceo',
    });
    expect(loadBoardTokens(raw)).toEqual({
      t1: 'cowork',
      t2: 'claude-code:dev',
      t3: 'claude-code:ceo',
    });
  });

  test.each([
    [':dev', 'owner が空'],
    ['claude-code:', '機能が空'],
    ['a:b:c', 'コロン複数'],
    ['', '空文字'],
  ])('不正な actor 形式 %s（%s）は起動時に throw する', (actor) => {
    expect(() => loadBoardTokens(JSON.stringify({ token: actor }))).toThrow(/actor/);
  });

  test('actor が文字列でない値は throw する', () => {
    expect(() => loadBoardTokens('{"token": 42}')).toThrow(/actor/);
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `pnpm --filter @handoff/api test -- config`
Expected: FAIL（不正形式が素通りする）

- [ ] **Step 3: 実装**

`api/src/config.ts` の `loadBoardTokens` を置き換え:

```ts
/** actor の合法形式（ADR-0008）: `owner` または `owner:機能`。最初の `:` で分割し、両側非空・`:` は1個まで。 */
const ACTOR_FORMAT = /^[^:]+(:[^:]+)?$/;

/**
 * 環境変数 BOARD_TOKENS（token→actor のJSON）をパースする。未設定時は空。
 * actor 形式の違反は読み込み時（サーバー起動時）に fail-fast する（ADR-0008 —
 * 不正 actor をリクエスト時まで残さない）。
 */
export function loadBoardTokens(raw: string | undefined): BoardTokenMap {
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('BOARD_TOKENS must be a JSON object of {token: actor}');
  }
  for (const [token, actor] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof actor !== 'string' || !ACTOR_FORMAT.test(actor)) {
      throw new Error(
        `BOARD_TOKENS: invalid actor format for token "${token}" — expected "owner" or "owner:function"`,
      );
    }
  }
  return parsed as BoardTokenMap;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm --filter @handoff/api test -- config`
Expected: PASS

- [ ] **Step 5: `.env.example` の BOARD_TOKENS 例を新形式に更新**

`.env.example` の `BOARD_TOKENS` の例を `owner:機能` 粒度に変更（例: `{"cc-dev-token":"claude-code:dev","cc-reviewer-token":"claude-code:reviewer","cc-ceo-token":"claude-code:ceo","cowork-token":"cowork"}`）。運用（Cloud Run 側 Secret）の値更新は docs/DEPLOYMENT.md 手順に従う別作業として、同ファイルの該当箇所に一行注記を足すのみ。

- [ ] **Step 6: コミット**

```bash
git add api/src/config.ts api/tests/config.test.ts .env.example
git commit -m "feat(api): fail-fast validation of BOARD_TOKENS actor format (ADR-0008)"
```

### Task 4: `X-Agent-Session` ヘッダーを activity に記録する

**Files:**
- Modify: `shared/src/task.ts:81-87`（`ActivityEntry`）
- Modify: `shared/src/create-task.ts`（`BuildTaskDeps` / `buildTask`）
- Modify: `shared/src/transition.ts`（`TransitionDeps` / `applyTransition`）
- Modify: `shared/src/edit-task.ts`（`EditTaskDeps` / `applyEdit`）
- Modify: `api/src/routes/board.ts`
- Test: `api/tests/board-route.test.ts`

**Interfaces:**
- Consumes: 既存の各 Deps。
- Produces: `ActivityEntry.session?: string | null`（省略＝null、既存データ後方互換）。各 Deps に `session?: string | null` を追加。`board.ts` 内ヘルパー `agentSession(request): string | null`。

- [ ] **Step 1: 失敗するテストを書く**

`api/tests/board-route.test.ts` に追記（既存の機械系トークン付き PATCH テストの流儀に合わせる）:

```ts
test('X-Agent-Session が activity の session に記録される（ADR-0008）', async () => {
  // 既存テストと同様に in-progress のタスクを持つ app を組み立てる
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/board/${task.id}`,
    headers: { 'x-board-token': MACHINE_TOKEN, 'x-agent-session': 'dev-worktree-a3f2' },
    payload: { to: 'needs-human', handoff_note: '確認お願いします', updated_at: task.updated_at },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json();
  const last = body.data.activity.at(-1);
  expect(last.session).toBe('dev-worktree-a3f2');
});

test('X-Agent-Session なしなら session は null', async () => {
  // 同様の PATCH をヘッダーなしで行い、last.session が null であることを assert
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `pnpm --filter @handoff/api test -- board-route`
Expected: FAIL（`session` が `undefined`）

- [ ] **Step 3: 実装**

`shared/src/task.ts` の `ActivityEntry`:

```ts
/** 活動履歴の1エントリ。いつ・誰が・何をしたか。 */
export interface ActivityEntry {
  /** ISO 8601（例: 2026-06-01T07:30:00Z） */
  timestamp: string;
  /** 操作主体。人間=メール等、機械系=トークン種別（owner[:機能]、ADR-0008）。owner とは別概念。 */
  actor: string;
  action: string;
  /**
   * 自己申告のセッション識別子（X-Agent-Session、ADR-0008）。記録専用で認証・強制には使わない。
   * 省略（既存データ）は null 扱い。
   */
  session?: string | null;
}
```

`shared/src/create-task.ts` — `BuildTaskDeps` に追加し、activity に伝搬:

```ts
export interface BuildTaskDeps {
  id: () => string;
  now: () => string;
  actor: string;
  /** 認証種別（ADR-0011）。created_by_type に刻む。 */
  actorType: ActorType;
  /** 自己申告セッション（ADR-0008）。activity に記録。 */
  session?: string | null;
}
```

`buildTask` の activity を:

```ts
    activity: [{ timestamp, actor: deps.actor, action: 'created', session: deps.session ?? null }],
```

`shared/src/transition.ts` — `TransitionDeps` に `session?: string | null;` を追加し、`applyTransition` の activity エントリを:

```ts
      { timestamp, actor: deps.actor, action: `${task.status} → ${input.to}`, session: deps.session ?? null },
```

`shared/src/edit-task.ts` — `EditTaskDeps` に `session?: string | null;` を追加し、`applyEdit` の activity エントリに `session: deps.session ?? null` を追加。

`api/src/routes/board.ts` — ヘルパーを追加し、全ルートで deps に渡す:

```ts
import type { FastifyInstance, FastifyRequest } from 'fastify';

/** 任意ヘッダー X-Agent-Session（自己申告、ADR-0008）。空・欠落は null。 */
function agentSession(request: FastifyRequest): string | null {
  const raw = request.headers['x-agent-session'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value !== undefined && value.trim().length > 0 ? value : null;
}
```

- POST: `buildTask(normalized, { id: newId, now, actor, actorType: type, session: agentSession(request) })`（`const { actor, type } = await authenticate(...)` に変更）
- PATCH（遷移）: `applyTransition(current, {...}, { now, actor, session: agentSession(request) })`
- PATCH `/details`: `applyEdit(current, normalized, { now, actor, session: agentSession(request) })`
- POST `/complete`: `archived` の activity エントリに `session: agentSession(request)` を追加。

`api/src/app.ts` の CORS `allowedHeaders` に `'X-Agent-Session'` を追加:

```ts
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Board-Token', 'X-Agent-Session'],
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm -r test` && `pnpm -r typecheck`
Expected: PASS（`session` は optional なので既存リテラルの修正は不要）

- [ ] **Step 5: コミット**

```bash
git add shared/src/ api/src/
git add api/tests/board-route.test.ts
git commit -m "feat: record self-declared X-Agent-Session in activity entries (ADR-0008)"
```

---

## Phase 3: ADR-0007 — in-review 状態と差し戻し上限

> 注: Task 5 で `in-progress → done` の辺を削除するため、Task 5〜Task 8（web 更新）完了までの間、web のテストが一部失敗する。中間検証は `pnpm --filter @handoff/api test` で行い、`pnpm -r test` が全緑になるのは Task 8 完了時。

### Task 5: スキーマ拡張と遷移グラフの付け替え

**Files:**
- Modify: `shared/src/task.ts`（`STATUSES` / `Task` / `ActivityEntry`）
- Modify: `shared/src/create-task.ts`（`buildTask` の初期値）
- Modify: `shared/src/transition.ts`（グラフ・`isHandoff`・activity の from/to）
- Modify: `api/src/repository/firestore-task-repository.ts`（`toTask` の既定値）
- Modify: `api/src/dev-seed.ts`
- Test: `api/tests/transition-engine.test.ts`

**Interfaces:**
- Consumes: Task 1〜4 の成果。
- Produces: `STATUSES` に `'in-review'`、`Task.review_cycles: number` / `Task.review_cycle_limit: number | null`、`ActivityEntry.from?: Status | null` / `to?: Status | null`（構造化遷移記録）、新遷移グラフ、`isHandoff` に `in-review → needs-*` 追加。

- [ ] **Step 1: 失敗するテストを書く**

`api/tests/transition-engine.test.ts` に追記（既存テストの deps ヘルパー流儀に合わせる）:

```ts
describe('in-review 遷移グラフ（ADR-0007）', () => {
  test('in-progress → done は許可されない（done の唯一の入口は in-review）', () => {
    expect(allowedTransitions('in-progress')).toEqual(
      expect.arrayContaining(['needs-ai', 'needs-human', 'in-review', 'blocked']),
    );
    expect(allowedTransitions('in-progress')).not.toContain('done');
  });

  test('in-review からは done / needs-ai / needs-human / blocked へ遷移できる', () => {
    expect(allowedTransitions('in-review').sort()).toEqual(
      ['blocked', 'done', 'needs-ai', 'needs-human'].sort(),
    );
  });

  test('blocked → in-review（レビュー中断からの復帰）が許可される', () => {
    expect(allowedTransitions('blocked')).toContain('in-review');
  });

  test('in-review → needs-ai / needs-human は handoff_note 必須', () => {
    expect(isHandoff('in-review', 'needs-ai')).toBe(true);
    expect(isHandoff('in-review', 'needs-human')).toBe(true);
    expect(isHandoff('in-progress', 'in-review')).toBe(false);
  });

  test('遷移の activity エントリに構造化 from/to が記録される', () => {
    const task = makeTask({ status: 'in-progress' });
    const next = applyTransition(task, { to: 'in-review' }, deps());
    const last = next.activity.at(-1)!;
    expect(last.from).toBe('in-progress');
    expect(last.to).toBe('in-review');
  });
});
```

（`makeTask` / `deps` は既存テストのヘルパー。なければこのタスク内で作る: `makeTask` は全必須フィールドを埋めた `Task` を部分上書きで返す関数、`deps` は `{ now: () => '2026-07-19T00:00:00Z', actor: 'claude-code:dev' }` を返す関数。）

- [ ] **Step 2: テスト失敗を確認**

Run: `pnpm --filter @handoff/api test -- transition-engine`
Expected: FAIL（`'in-review'` が Status に存在しない型エラー、またはグラフ不一致）

- [ ] **Step 3: 実装**

`shared/src/task.ts`:

```ts
export const STATUSES = [
  'needs-ai',
  'needs-human',
  'in-progress',
  'in-review',
  'done',
  'blocked',
] as const;
```

`ActivityEntry` に追加（`session` の後ろ）:

```ts
  /** 遷移エントリの構造化 from（ADR-0007。文字列パースに依存しない自己レビュー判定用）。遷移以外・既存データは null。 */
  from?: Status | null;
  /** 遷移エントリの構造化 to。遷移以外・既存データは null。 */
  to?: Status | null;
```

`Task` に追加（`activity` の前）:

```ts
  /** 差し戻し回数（in-review → needs-ai のたびにサーバーがインクリメント、ADR-0007）。既存データ欠落は 0。 */
  review_cycles: number;
  /** タスク単位の差し戻し上限（null なら REVIEW_CYCLE_LIMIT 既定値、ADR-0007）。人間のみ変更可。 */
  review_cycle_limit: number | null;
```

`shared/src/create-task.ts` — `buildTask` の戻り値に初期値を追加（`created_by_type` の後ろ）:

```ts
    review_cycles: 0,
    review_cycle_limit: null,
```

`shared/src/transition.ts` — グラフと `isHandoff` を更新:

```ts
/**
 * 許可される遷移グラフ（ADR-0002、ADR-0007 で amend）。done への唯一の入口は in-review。
 * blocked → in-review はレビュー中断からの復帰（再実装ループに落とさないための辺）。
 */
const ALLOWED_TRANSITIONS: Readonly<Record<Status, readonly Status[]>> = {
  'needs-ai': ['in-progress', 'blocked'],
  'needs-human': ['in-progress', 'blocked'],
  'in-progress': ['needs-ai', 'needs-human', 'in-review', 'blocked'],
  'in-review': ['done', 'needs-ai', 'needs-human', 'blocked'],
  done: [],
  blocked: ['needs-ai', 'needs-human', 'in-review'],
};

/** 引き継ぎ遷移（handoff_note 必須）か。needs-* に入る遷移はすべて note 必須（ADR-0007）。 */
export function isHandoff(from: Status, to: Status): boolean {
  return (
    (from === 'in-progress' || from === 'blocked' || from === 'in-review') &&
    (to === 'needs-ai' || to === 'needs-human')
  );
}
```

`applyTransition` の activity エントリに構造化 from/to を追加:

```ts
      {
        timestamp,
        actor: deps.actor,
        action: `${task.status} → ${input.to}`,
        session: deps.session ?? null,
        from: task.status,
        to: input.to,
      },
```

`api/src/repository/firestore-task-repository.ts` — `StoredTask` / `toTask` を拡張:

```ts
type StoredTask = Omit<Task, 'id' | 'created_by_type' | 'review_cycles' | 'review_cycle_limit'> &
  Partial<Pick<Task, 'created_by_type' | 'review_cycles' | 'review_cycle_limit'>>;

/** 読み出し時の既定値補完（後方互換の読み出しデフォルト、ADR-0007 / ADR-0011）。 */
function toTask(id: string, data: StoredTask): Task {
  return { created_by_type: 'human', review_cycles: 0, review_cycle_limit: null, ...data, id };
}
```

`api/src/dev-seed.ts` — 3 件すべてに `review_cycles: 0, review_cycle_limit: null,` を追加。

- [ ] **Step 4: 型検査で残りの構築箇所を直す**

Run: `pnpm -r typecheck`
Expected: `Task` リテラル構築箇所（api テスト・web テストのモック）で `review_cycles` / `review_cycle_limit` 欠落エラー → `review_cycles: 0, review_cycle_limit: null,` を追加して解消。

- [ ] **Step 5: api テストが通ることを確認**

Run: `pnpm --filter @handoff/api test`
Expected: PASS。ただし「in-progress → done が許可される」ことを前提にした既存テストは**仕様変更として書き換える**（`in-progress → in-review → done` の 2 段に変更。actor は別 actor を使う — Task 6 で自己レビュー排除が入っても壊れないように、レビュー通過側は `claude-code:reviewer` 等にしておく）。
Note: web のテストはこの時点で一部 FAIL する（Task 8 で修正）。

- [ ] **Step 6: コミット**

```bash
git add shared/src/ api/src/ api/tests/
git commit -m "feat(shared): add in-review status, review cycle fields, structured activity from/to (ADR-0007)"
```

### Task 6: 遷移エンジンの規則実装と API 配線（上限・リセット・自己レビュー排除）

**Files:**
- Modify: `shared/src/transition.ts`（`TransitionDeps` 拡張＋規則）
- Modify: `api/src/config.ts`（`loadReviewCycleLimit`）
- Modify: `api/src/app.ts` / `api/src/routes/board.ts` / `api/src/server.ts`（配線）
- Test: `api/tests/transition-engine.test.ts`, `api/tests/config.test.ts`, `api/tests/board-route.test.ts`

**Interfaces:**
- Consumes: Task 5 のグラフ、Task 1 の `ActorType`、Task 4 の `session`。
- Produces: `TransitionDeps = { now, actor, actorType: ActorType, reviewCycleLimit: number, session?: string | null }`（**actorType / reviewCycleLimit は必須**）。`loadReviewCycleLimit(raw): number`（既定 5）。`AppDeps.reviewCycleLimit?: number` / `BoardRouteDeps.reviewCycleLimit?: number`（省略時 5）。

- [ ] **Step 1: 失敗するテストを書く**

`api/tests/transition-engine.test.ts` に追記。deps ヘルパーを新シグネチャで定義:

```ts
const T = '2026-07-19T00:00:00Z';
function deps(over: Partial<TransitionDeps> = {}): TransitionDeps {
  return { now: () => T, actor: 'claude-code:reviewer', actorType: 'machine', reviewCycleLimit: 5, ...over };
}
/** 実装者 dev が in-progress → in-review を実行済みの in-review タスクを作る。 */
function inReviewTask(over: Partial<Task> = {}): Task {
  return makeTask({
    status: 'in-review',
    owner: 'claude-code',
    review_cycles: 0,
    review_cycle_limit: null,
    activity: [
      { timestamp: T, actor: 'human@example.com', action: 'created' },
      { timestamp: T, actor: 'claude-code:dev', action: 'in-progress → in-review', from: 'in-progress', to: 'in-review' },
    ],
    ...over,
  });
}

describe('差し戻し往復上限（ADR-0007）', () => {
  test('in-review → needs-ai で review_cycles がインクリメントされる', () => {
    const next = applyTransition(inReviewTask(), { to: 'needs-ai', handoff_note: '指摘' }, deps());
    expect(next.review_cycles).toBe(1);
  });

  test('遷移前の値で review_cycles >= limit なら 422（limit=5 なら 6 回目が拒否）', () => {
    const task = inReviewTask({ review_cycles: 5 });
    expect(() =>
      applyTransition(task, { to: 'needs-ai', handoff_note: '指摘' }, deps()),
    ).toThrow(ValidationError);
    // 境界: 4 なら通って 5 になる
    const ok = applyTransition(inReviewTask({ review_cycles: 4 }), { to: 'needs-ai', handoff_note: '指摘' }, deps());
    expect(ok.review_cycles).toBe(5);
  });

  test('review_cycle_limit（タスク単位）がグローバル既定より優先される', () => {
    const task = inReviewTask({ review_cycles: 2, review_cycle_limit: 2 });
    expect(() =>
      applyTransition(task, { to: 'needs-ai', handoff_note: '指摘' }, deps()),
    ).toThrow(ValidationError);
  });

  test('上限到達後もエスカレーション（→ needs-human）は通る', () => {
    const task = inReviewTask({ review_cycles: 5 });
    const next = applyTransition(task, { to: 'needs-human', handoff_note: '5往復未解決' }, deps());
    expect(next.status).toBe('needs-human');
    expect(next.review_cycles).toBe(5);
  });
});

describe('リセット規定（ADR-0007）', () => {
  test('人間 actor が in-review 以外から needs-ai に入れるとリセットされる', () => {
    const task = makeTask({ status: 'in-progress', review_cycles: 3 });
    const next = applyTransition(
      task,
      { to: 'needs-ai', handoff_note: '再投入' },
      deps({ actor: 'human@example.com', actorType: 'human' }),
    );
    expect(next.review_cycles).toBe(0);
  });

  test('機械系 actor による in-review 以外からの needs-ai handoff はカウンタを変えない', () => {
    const task = makeTask({ status: 'in-progress', review_cycles: 3 });
    const next = applyTransition(task, { to: 'needs-ai', handoff_note: '引き継ぎ' }, deps());
    expect(next.review_cycles).toBe(3);
  });

  test('人間レビュアーの差し戻し（in-review → needs-ai）はリセットでなくインクリメント', () => {
    const next = applyTransition(
      inReviewTask({ review_cycles: 2 }),
      { to: 'needs-ai', handoff_note: '指摘' },
      deps({ actor: 'human@example.com', actorType: 'human' }),
    );
    expect(next.review_cycles).toBe(3);
  });
});

describe('自己レビュー排除（ADR-0007）', () => {
  test('直近の in-progress → in-review と同一 actor は done にできない（完全一致判定）', () => {
    expect(() =>
      applyTransition(inReviewTask(), { to: 'done' }, deps({ actor: 'claude-code:dev' })),
    ).toThrow(ValidationError);
  });

  test('別 actor（同 owner の別機能トークン）は done にできる', () => {
    const next = applyTransition(inReviewTask(), { to: 'done' }, deps({ actor: 'claude-code:reviewer' }));
    expect(next.status).toBe('done');
  });

  test('同一 actor でも needs-human へのエスカレーションは許可される', () => {
    const next = applyTransition(
      inReviewTask(),
      { to: 'needs-human', handoff_note: '手に負えない' },
      deps({ actor: 'claude-code:dev' }),
    );
    expect(next.status).toBe('needs-human');
  });

  test('owner=human × 人間 actor は自分で done にできる（人間例外）', () => {
    const task = inReviewTask({
      owner: 'human',
      activity: [
        { timestamp: T, actor: 'me@example.com', action: 'in-progress → in-review', from: 'in-progress', to: 'in-review' },
      ],
    });
    const next = applyTransition(task, { to: 'done' }, deps({ actor: 'me@example.com', actorType: 'human' }));
    expect(next.status).toBe('done');
  });

  test('owner が AI のタスクは人間でも自己レビューを通せない（ラバースタンプ経路の遮断）', () => {
    const task = inReviewTask({
      owner: 'claude-code',
      activity: [
        { timestamp: T, actor: 'me@example.com', action: 'in-progress → in-review', from: 'in-progress', to: 'in-review' },
      ],
    });
    expect(() =>
      applyTransition(task, { to: 'done' }, deps({ actor: 'me@example.com', actorType: 'human' })),
    ).toThrow(ValidationError);
  });

  test('構造化 from/to を持つエントリが無い旧データは判定不能として通す（後方互換）', () => {
    const task = inReviewTask({
      activity: [{ timestamp: T, actor: 'claude-code:dev', action: 'in-progress → in-review' }],
    });
    const next = applyTransition(task, { to: 'done' }, deps({ actor: 'claude-code:dev' }));
    expect(next.status).toBe('done');
  });

  test('blocked 迂回後も直近の in-progress → in-review エントリで判定される', () => {
    const task = inReviewTask({
      activity: [
        { timestamp: T, actor: 'claude-code:dev', action: 'in-progress → in-review', from: 'in-progress', to: 'in-review' },
        { timestamp: T, actor: 'claude-code:dev', action: 'in-review → blocked', from: 'in-review', to: 'blocked' },
        { timestamp: T, actor: 'human@example.com', action: 'blocked → in-review', from: 'blocked', to: 'in-review' },
      ],
    });
    expect(() =>
      applyTransition(task, { to: 'done' }, deps({ actor: 'claude-code:dev' })),
    ).toThrow(ValidationError);
  });
});
```

`api/tests/config.test.ts` に追記:

```ts
describe('loadReviewCycleLimit（ADR-0007）', () => {
  test('未設定なら既定値 5', () => {
    expect(loadReviewCycleLimit(undefined)).toBe(5);
  });
  test('正の整数文字列を受理する', () => {
    expect(loadReviewCycleLimit('3')).toBe(3);
  });
  test.each(['0', '-1', '2.5', 'abc'])('不正値 %s は throw する', (raw) => {
    expect(() => loadReviewCycleLimit(raw)).toThrow(/REVIEW_CYCLE_LIMIT/);
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `pnpm --filter @handoff/api test -- transition-engine config`
Expected: FAIL（新規則未実装・`loadReviewCycleLimit` 未定義）

- [ ] **Step 3: 遷移エンジンを実装**

`shared/src/transition.ts` を以下に更新:

```ts
import { ValidationError } from './create-task.js';
import type { ActorType, Status, Task } from './task.js';

export interface TransitionInput {
  to: Status;
  handoff_note?: string;
  blocked_reason?: string;
}

/** applyTransition の副作用（時刻・実行者・認証種別・上限既定値）を注入する依存。 */
export interface TransitionDeps {
  now: () => string;
  actor: string;
  /** 認証種別（ADR-0001）。自己レビュー例外とリセット規定の判定に使う（ADR-0007）。 */
  actorType: ActorType;
  /** グローバル既定の差し戻し上限（REVIEW_CYCLE_LIMIT）。task.review_cycle_limit が null のとき使う。 */
  reviewCycleLimit: number;
  /** 自己申告セッション（ADR-0008）。activity に記録。 */
  session?: string | null;
}
```

`applyTransition` 本体（既存の辺検証・note/reason 検証の後に規則を追加）:

```ts
export function applyTransition(
  task: Task,
  input: TransitionInput,
  deps: TransitionDeps,
): Task {
  if (!ALLOWED_TRANSITIONS[task.status].includes(input.to)) {
    throw new ValidationError(`遷移不可: ${task.status} → ${input.to}`);
  }

  const handoff = isHandoff(task.status, input.to);
  if (handoff && (input.handoff_note ?? '').trim().length === 0) {
    throw new ValidationError('引き継ぎ遷移には handoff_note が必須です');
  }

  const blocking = input.to === 'blocked';
  if (blocking && (input.blocked_reason ?? '').trim().length === 0) {
    throw new ValidationError('ブロックには blocked_reason が必須です');
  }

  assertNotSelfReview(task, input.to, deps);

  // 差し戻し往復上限（ADR-0007）: 遷移実行前の値で判定し、拒否された遷移はインクリメントしない。
  const isSendback = task.status === 'in-review' && input.to === 'needs-ai';
  if (isSendback) {
    const limit = task.review_cycle_limit ?? deps.reviewCycleLimit;
    if (task.review_cycles >= limit) {
      throw new ValidationError(
        `差し戻し上限（${limit}回）に達しています。needs-human へエスカレーションしてください`,
      );
    }
  }
  // リセット規定: 人間の再投入（in-review 以外→ needs-ai）は新しいレビュー予算の付与。
  const isHumanReinjection =
    input.to === 'needs-ai' && task.status !== 'in-review' && deps.actorType === 'human';
  const review_cycles = isSendback
    ? task.review_cycles + 1
    : isHumanReinjection
      ? 0
      : task.review_cycles;

  const timestamp = deps.now();
  return {
    ...task,
    status: input.to,
    review_cycles,
    handoff_note: handoff ? (input.handoff_note as string) : task.handoff_note,
    blocked_reason: blocking
      ? (input.blocked_reason as string)
      : task.status === 'blocked'
        ? null
        : task.blocked_reason,
    updated_at: timestamp,
    activity: [
      ...task.activity,
      {
        timestamp,
        actor: deps.actor,
        action: `${task.status} → ${input.to}`,
        session: deps.session ?? null,
        from: task.status,
        to: input.to,
      },
    ],
  };
}

/**
 * 自己レビュー排除（ADR-0007）: in-review からの done / needs-ai は、直近の
 * in-progress → in-review を実行した actor と同一 actor（完全一致、ADR-0008）には許可しない。
 * 例外は「task.owner=human かつ現 actor の認証種別が human」のみ（人間は自分の作業を自分で完了できる。
 * owner が AI のタスクを人間が単独で通すラバースタンプ経路は塞ぐ）。
 * 構造化 from/to を持つ提出エントリが無い旧データは判定不能として通す（後方互換）。
 */
function assertNotSelfReview(task: Task, to: Status, deps: TransitionDeps): void {
  if (task.status !== 'in-review') return;
  if (to !== 'done' && to !== 'needs-ai') return;

  const submitted = [...task.activity]
    .reverse()
    .find((e) => e.from === 'in-progress' && e.to === 'in-review');
  if (submitted === undefined) return;
  if (submitted.actor !== deps.actor) return;
  if (task.owner === 'human' && deps.actorType === 'human') return;

  throw new ValidationError('実装者と同一 actor はレビューを通せません（自己レビュー排除）');
}
```

- [ ] **Step 4: API を配線する**

`api/src/config.ts` に追加:

```ts
/** グローバル既定の差し戻し上限（ADR-0007）。 */
const DEFAULT_REVIEW_CYCLE_LIMIT = 5;

/** 環境変数 REVIEW_CYCLE_LIMIT を正の整数にパースする。未設定は既定値 5、不正値は起動時に throw。 */
export function loadReviewCycleLimit(raw: string | undefined): number {
  if (!raw) return DEFAULT_REVIEW_CYCLE_LIMIT;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('REVIEW_CYCLE_LIMIT must be a positive integer');
  }
  return limit;
}
```

`api/src/app.ts` — `AppDeps` に追加し、そのまま `registerBoardRoutes` へ渡る（`deps` を丸ごと渡しているので型追加のみ）:

```ts
  /** 差し戻し往復のグローバル既定上限（ADR-0007）。未指定は 5。 */
  reviewCycleLimit?: number;
```

`api/src/routes/board.ts` — `BoardRouteDeps` に同フィールドを追加し、PATCH（遷移）ルートを:

```ts
export interface BoardRouteDeps {
  repository: TaskRepository;
  auth: AuthConfig;
  ids?: () => string;
  clock?: () => string;
  /** 差し戻し往復のグローバル既定上限（ADR-0007）。未指定は 5。 */
  reviewCycleLimit?: number;
}
```

```ts
  const reviewCycleLimit = deps.reviewCycleLimit ?? 5;

  app.patch('/api/board/:id', async (request, reply) => {
    const { actor, type } = await authenticate(request.headers, deps.auth);
    // ...（既存の parse / findById / 404 はそのまま）
    const next = applyTransition(
      current,
      { to: req.to, handoff_note: req.handoff_note, blocked_reason: req.blocked_reason },
      { now, actor, actorType: type, reviewCycleLimit, session: agentSession(request) },
    );
    const saved = await deps.repository.update(next, req.updated_at);
    return ok(saved);
  });
```

`api/src/server.ts` — import に `loadReviewCycleLimit` を追加し、`buildApp` に渡す:

```ts
const app = buildApp({
  repository,
  auth,
  corsOrigins: loadCorsOrigins(process.env.CORS_ORIGIN),
  reviewCycleLimit: loadReviewCycleLimit(process.env.REVIEW_CYCLE_LIMIT),
});
```

`.env.example` に追記: `# 差し戻し往復のグローバル上限（ADR-0007、既定 5）` `REVIEW_CYCLE_LIMIT=5`

- [ ] **Step 5: ルート統合テストを 1 本追加**

`api/tests/board-route.test.ts`（API 境界での 422 を確認）:

```ts
test('自己レビューは API 経由でも 422 になる（ADR-0007）', async () => {
  // 機械系トークン MACHINE_TOKEN（actor 'claude-code:dev'）で in-progress → in-review に PATCH した後、
  // 同じトークンで in-review → done に PATCH すると 422 が返る。
  // 2 回目の PATCH の updated_at は 1 回目のレスポンスの updated_at を使う。
  expect(second.statusCode).toBe(422);
  expect(second.json().error).toMatch(/自己レビュー/);
});
```

- [ ] **Step 6: テストが通ることを確認**

Run: `pnpm --filter @handoff/api test` && `pnpm -r typecheck`
Expected: api は PASS（`TransitionDeps` の必須化により既存テストの deps を `deps()` ヘルパー経由に書き換える）。web の型検査も PASS（web は `applyTransition` を呼ばず `allowedTransitions` のみ使用）。

- [ ] **Step 7: コミット**

```bash
git add shared/src/transition.ts api/src/ api/tests/ .env.example
git commit -m "feat: review cycle limit, reset rule and self-review exclusion in transition engine (ADR-0007)"
```

### Task 7: `review_cycle_limit` の編集経路（人間のみ）

**Files:**
- Modify: `shared/src/edit-task.ts`
- Modify: `api/src/routes/board.ts`（`/details` ルート）
- Test: `api/tests/edit-task.test.ts`, `api/tests/board-route.test.ts`

**Interfaces:**
- Consumes: Task 5 の `Task.review_cycle_limit`。
- Produces: `NormalizedEdit.review_cycle_limit: number | null | undefined`（undefined=変更しない）、`normalizeReviewCycleLimit(value)`。ルートで機械系 actor の変更を 422 拒否。

- [ ] **Step 1: 失敗するテストを書く**

`api/tests/edit-task.test.ts`:

```ts
describe('review_cycle_limit の編集（ADR-0007）', () => {
  test('未指定なら変更しない（undefined）', () => {
    const normalized = validateEditTask(baseEditBody());
    expect(normalized.review_cycle_limit).toBeUndefined();
    const task = makeTask({ review_cycle_limit: 3 });
    expect(applyEdit(task, normalized, editDeps()).review_cycle_limit).toBe(3);
  });

  test('正の整数と null（既定値に戻す）を受理して適用する', () => {
    const withLimit = validateEditTask({ ...baseEditBody(), review_cycle_limit: 8 });
    expect(applyEdit(makeTask({}), withLimit, editDeps()).review_cycle_limit).toBe(8);
    const cleared = validateEditTask({ ...baseEditBody(), review_cycle_limit: null });
    expect(applyEdit(makeTask({ review_cycle_limit: 8 }), cleared, editDeps()).review_cycle_limit).toBeNull();
  });

  test.each([0, -1, 2.5, 'abc'])('不正値 %s は 422', (value) => {
    expect(() => validateEditTask({ ...baseEditBody(), review_cycle_limit: value })).toThrow(
      ValidationError,
    );
  });
});
```

`api/tests/board-route.test.ts`:

```ts
test('機械系クライアントは review_cycle_limit を変更できない（422、ADR-0007）', async () => {
  const res = await app.inject({
    method: 'PATCH',
    url: `/api/board/${task.id}/details`,
    headers: { 'x-board-token': MACHINE_TOKEN },
    payload: { ...editBodyFor(task), review_cycle_limit: 99, updated_at: task.updated_at },
  });
  expect(res.statusCode).toBe(422);
});

test('人間クライアントは review_cycle_limit を変更できる', async () => {
  // Bearer（フェイク TokenVerifier）で同じ PATCH → 200、data.review_cycle_limit === 99
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `pnpm --filter @handoff/api test -- edit-task board-route`
Expected: FAIL

- [ ] **Step 3: 実装**

`shared/src/edit-task.ts`:

```ts
/**
 * review_cycle_limit の正規化（ADR-0007）。undefined=変更しない、null=既定値に戻す、
 * それ以外は正の整数のみ許可（違反は 422）。
 */
export function normalizeReviewCycleLimit(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new ValidationError('review_cycle_limit must be a positive integer or null');
  }
  return value;
}
```

`NormalizedEdit` に追加:

```ts
  /** 差し戻し上限の上書き。undefined は「変更しない」（ADR-0007。人間のみ変更可はルート層で強制）。 */
  review_cycle_limit: number | null | undefined;
```

`validateEditTask` の return 前に:

```ts
  const review_cycle_limit = normalizeReviewCycleLimit(body.review_cycle_limit);
```

（return オブジェクトにも `review_cycle_limit` を追加。）

`applyEdit` に:

```ts
    review_cycle_limit:
      normalized.review_cycle_limit === undefined
        ? task.review_cycle_limit
        : normalized.review_cycle_limit,
```

`api/src/routes/board.ts` の `/details` ルート — `authenticate` の戻りから `type` も取り、検証後に強制:

```ts
    const { actor, type } = await authenticate(request.headers, deps.auth);
    // ...
    const normalized = validateEditTask(body);
    // review_cycle_limit の変更は人間のみ（ADR-0007。実装者 AI が自分で安全弁を外す経路を塞ぐ）。
    if (normalized.review_cycle_limit !== undefined && type !== 'human') {
      throw new ValidationError('review_cycle_limit は人間のみ変更できます');
    }
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm --filter @handoff/api test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add shared/src/edit-task.ts api/src/routes/board.ts api/tests/
git commit -m "feat: human-only review_cycle_limit editing via details route (ADR-0007)"
```

### Task 8: web — In Review レーンとボタンの付け替え

**Files:**
- Modify: `web/src/components/Board.tsx:10-15`
- Modify: `web/src/components/Card.tsx`
- Modify: `web/src/components/UnblockDialog.tsx`
- Test: `web/src/components/Board.test.tsx`, `web/src/components/Card.test.tsx`, `web/src/components/UnblockDialog.test.tsx`

**Interfaces:**
- Consumes: shared の新 `STATUSES` / `allowedTransitions`（グラフ変更は自動反映）。
- Produces: In Review レーン、`in-progress` カードの「レビュー依頼」ボタン（直接遷移）、`in-review` カードの「完了」（直接遷移・既存 canComplete が自動で効く）と「引き継ぎ」（差し戻し/エスカレーション、HandoffDialog 再利用）、UnblockDialog の `in-review` 復帰先。

- [ ] **Step 1: 失敗するテストを書く**

`web/src/components/Board.test.tsx` — レーン数と In Review レーンへの振り分け:

```tsx
test('in-review タスクは In Review レーンに表示される', () => {
  const task = makeTask({ id: 't1', status: 'in-review', title: 'レビュー待ちタスク' });
  render(<Board tasks={[task]} />);
  const lane = screen.getByRole('region', { name: 'In Review' });
  expect(within(lane).getByText('レビュー待ちタスク')).toBeInTheDocument();
});
```

`web/src/components/Card.test.tsx`:

```tsx
test('in-progress カードには完了ボタンがなく、レビュー依頼ボタンがある', () => {
  render(<Card task={makeTask({ status: 'in-progress' })} />);
  expect(screen.queryByRole('button', { name: '完了' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'レビュー依頼' })).toBeInTheDocument();
});

test('レビュー依頼で in-review への直接遷移が送られる', async () => {
  const transition = vi.fn().mockResolvedValue(makeTask({ status: 'in-review' }));
  render(<Card task={makeTask({ status: 'in-progress', updated_at: 'U1' })} transitionTask={transition} />);
  await userEvent.click(screen.getByRole('button', { name: 'レビュー依頼' }));
  expect(transition).toHaveBeenCalledWith(expect.any(String), { to: 'in-review', updated_at: 'U1' });
});

test('in-review カードには完了と引き継ぎ（差し戻し）ボタンがある', () => {
  render(<Card task={makeTask({ status: 'in-review' })} />);
  expect(screen.getByRole('button', { name: '完了' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '引き継ぎ' })).toBeInTheDocument();
});
```

`web/src/components/UnblockDialog.test.tsx`:

```tsx
test('復帰先に in-review を選べ、そのときメモは不要', async () => {
  const transition = vi.fn().mockResolvedValue(makeTask({ status: 'in-review' }));
  render(<UnblockDialog task={makeTask({ status: 'blocked', updated_at: 'U1' })} onClose={() => {}} onTransitioned={() => {}} transitionTask={transition} />);
  await userEvent.selectOptions(screen.getByLabelText('引き継ぎ先'), 'in-review');
  await userEvent.click(screen.getByRole('button', { name: '解除' }));
  expect(transition).toHaveBeenCalledWith(expect.any(String), { to: 'in-review', updated_at: 'U1' });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `pnpm --filter @handoff/web test`
Expected: 新規テスト FAIL（＋Task 5 のグラフ変更で「in-progress で完了できる」前提の既存テストも FAIL しているはず）

- [ ] **Step 3: 実装**

`web/src/components/Board.tsx` — LANES に挿入:

```tsx
const LANES: LaneDef[] = [
  { label: 'To Do', statuses: ['needs-ai', 'needs-human'] },
  { label: 'In Progress', statuses: ['in-progress'] },
  { label: 'In Review', statuses: ['in-review'] },
  { label: 'Blocked', statuses: ['blocked'] },
  { label: 'Done', statuses: ['done'] },
];
```

`web/src/components/Card.tsx` — 判定と描画を更新:

```tsx
  const transitions = allowedTransitions(task.status);
  const canStart = transitions.includes('in-progress'); // needs-* → in-progress
  const canRequestReview = transitions.includes('in-review') && task.status === 'in-progress'; // 実装完了 → レビュー依頼
  const canComplete = transitions.includes('done'); // in-review → done（レビュー通過、ADR-0007）
  const canHandoff = task.status === 'in-progress' || task.status === 'in-review'; // 引き継ぎ / 差し戻し（メモ必須）
```

ボタン列（着手と引き継ぎの間に挿入。レビュー依頼はメモ不要の直接遷移）:

```tsx
        {canRequestReview && (
          <button
            type="button"
            aria-label="レビュー依頼"
            title="レビュー依頼"
            disabled={busy}
            onClick={() => void handleDirect('in-review')}
          >
            <Icon name="check" />
          </button>
        )}
```

（`canComplete` の完了ボタンは既存コードのまま — グラフ変更により in-review でのみ true になる。）

`web/src/components/UnblockDialog.tsx` — 復帰先に `in-review` を追加し、メモ必須を needs-* のみに変更:

```tsx
/** 解除の引き継ぎ先（blocked → needs-* / in-review）。 */
type HandoffTarget = 'needs-ai' | 'needs-human' | 'in-review';

const TARGET_LABEL: Record<HandoffTarget, string> = {
  'needs-ai': 'AI待ち',
  'needs-human': '人間待ち',
  'in-review': 'レビュー待ちに戻す',
};
```

`handleSubmit` 内:

```tsx
    // needs-* への解除は引き継ぎ遷移（メモ必須）。in-review への復帰はメモ不要（ADR-0007）。
    const isHandoffTarget = target !== 'in-review';
    if (isHandoffTarget && note.trim().length === 0) {
      setError('引き継ぎメモを入力してください');
      return;
    }
    // ...
      const updated = await transitionTask(task.id, {
        to: target,
        ...(isHandoffTarget ? { handoff_note: note } : {}),
        updated_at: task.updated_at,
      });
```

（メモ欄のラベルは `引き継ぎメモ{target === 'in-review' ? '（不要）' : ''}` などにして残してよい。）

- [ ] **Step 4: 既存テストの仕様変更を反映**

Task 5 のグラフ変更で失敗している web 既存テスト（例: 「in-progress カードの完了ボタン」）を新仕様（in-progress → レビュー依頼、in-review → 完了）に書き換える。モックタスクに `created_by_type` / `review_cycles` / `review_cycle_limit` が不足していれば補う。

Run: `pnpm --filter @handoff/web test` && `pnpm -r test` && `pnpm -r typecheck`
Expected: すべて PASS

- [ ] **Step 5: E2E の煙テストを確認**

Run: `pnpm --filter @handoff/web e2e`
Expected: PASS（レーン追加でセレクタが壊れていないか確認。壊れていれば修正）

- [ ] **Step 6: コミット**

```bash
git add web/src/
git commit -m "feat(web): In Review lane, review-request button and in-review recovery (ADR-0007)"
```

---

## Phase 4: ドキュメント同期

### Task 9: CONTEXT.md / CLAUDE.md / ADR 相互注記の更新

**Files:**
- Modify: `CONTEXT.md`（レーン定義・status 値数）
- Modify: `CLAUDE.md`（shared / api / web の記述）
- Modify: `docs/adr/0002-status-transitions-as-server-state-machine.md`（Status 注記）
- Modify: `docs/adr/0003-per-user-board-scoping-by-created-by.md`（Status 注記）
- Modify: `docs/adr/0006-owner-department-role-three-axes.md`（Status 注記）
- Modify: `docs/adr/0007〜0011`（Status を accepted に）

- [ ] **Step 1: CONTEXT.md の status / レーン記述を更新**

`CONTEXT.md` のレーン定義（16 行目付近）を更新: 「`status` 値自体は5つのまま変えない」→「`status` 値は6つ（needs-ai / needs-human / in-progress / in-review / done / blocked、ADR-0007）」に改め、レーン列挙に `In Review レーン = in-review` を追加。

- [ ] **Step 2: ADR の Status 相互注記**

各 ADR の `## Status` 節に 1 行追記:
- 0002: `> 注記: [ADR-0007](0007-in-review-state-and-review-cycle-limit.md) により遷移グラフが amend された（in-review 追加、in-progress → done の辺削除）。`
- 0003: `> 注記: [ADR-0011](0011-human-board-includes-machine-created-tasks.md) により人間ボードの絞り込み規則が amend された（機械系作成タスクを含む）。`
- 0006: `> 注記: [ADR-0008](0008-agent-identity-role-token-and-session-id.md) により「機械系トークンは AI 実行者ごとに発行」の帰結が amend された（実行者×機能の粒度）。`
- 0007 / 0008 / 0011 の Status を `proposed` → `accepted`（実装完了を根拠に。0009 / 0010 はコード外作業が残るため proposed のまま）。

- [ ] **Step 3: CLAUDE.md の Workspaces 記述を更新**

- shared: status 6 値（in-review 追加）、`review_cycles`/`review_cycle_limit`、`created_by_type`、`ActivityEntry` の `session`/`from`/`to`、遷移エンジンの新規則（上限・リセット・自己レビュー排除・人間例外）を 1〜2 文で追記。「API route exposing transitions is not implemented yet」の記述は既に古い（PATCH /api/board/:id は #04 実装済み）ため、実装済みルート一覧（GET / POST / PATCH /:id / PATCH /:id/details / DELETE /:id / POST /:id/complete）に改める。
- api: `REVIEW_CYCLE_LIMIT` 環境変数、BOARD_TOKENS の actor 形式検証、人間ボードの OR スコープを追記。
- web: In Review レーンとボタン変更を追記。

- [ ] **Step 4: 最終確認とコミット**

Run: `pnpm -r test` && `pnpm -r typecheck`
Expected: PASS

```bash
git add CONTEXT.md CLAUDE.md docs/adr/
git commit -m "docs: sync CONTEXT/CLAUDE/ADR cross-notes for ADR-0007/0008/0011 implementation"
```

---

## 実装後のフォローアップ（本計画の外、忘れないためのリスト）

1. **handoff-mcp のロックステップ更新**（デプロイ前に必須）: status enum・pull クエリ（`in-review` 対応）・`X-Agent-Session` 付与・新 actor 形式トークン。
2. **運用値の更新**: Cloud Run の `BOARD_TOKENS` Secret を `owner:機能` 形式へ、`REVIEW_CYCLE_LIMIT` の設定（既定 5 のままなら不要）。docs/DEPLOYMENT.md 参照。
3. **ADR-0010 のインフラ作業**: deny ルール、エージェント専用 SA＋`CLOUDSDK_CONFIG`、CI デプロイ一本化＋Environment protection rules、Gmail draft-only と社外影響操作リストの CLAUDE.md 明文化。
4. **ADR-0009 の CEO 規約**: cc-agent-harness 側スキル整備。着手条件（0007・0011 実装済み）は本計画完了で満たされる。
5. **任意**: EditDialog に `review_cycle_limit` の数値入力を追加する（現状は API 経由でのみ人間が変更可能。UI 需要が出たら小タスクで対応）。
