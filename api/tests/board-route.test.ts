import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Task } from '@handoff/shared';
import { makeTask } from '@handoff/shared/testing';
import { buildApp } from '../src/app.js';
import type { TokenVerifier } from '../src/auth/auth-middleware.js';
import { InMemoryTaskRepository } from '../src/repository/in-memory-task-repository.js';

const boardTokens = {
  'dev-token': 'cowork',
  'machine-token': 'claude-code:dev',
};

function fakeVerifier(tokenToEmail: Record<string, string>): TokenVerifier {
  return {
    async verify(idToken: string) {
      const email = tokenToEmail[idToken];
      if (email === undefined) throw new Error('invalid id token');
      return { email };
    },
  };
}

const sampleTask = (over: Partial<Task> = {}): Task =>
  makeTask({
    title: 'サンプル',
    owner: 'cowork',
    handoff_note: 'お願いします',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    activity: [],
    ...over,
  });

describe('GET /api/board', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const repository = new InMemoryTaskRepository([
      sampleTask({ id: 'a' }),
      sampleTask({ id: 'b', status: 'done' }),
    ]);
    app = buildApp({ repository, auth: { boardTokens } });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('有効な X-Board-Token で 200・全タスクを envelope で返す', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/board',
      headers: { 'x-board-token': 'dev-token' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.error).toBeNull();
    expect(body.data).toHaveLength(2);
    expect(body.data.map((t: Task) => t.id).sort()).toEqual(['a', 'b']);
  });

  it('無効なトークンは 403・success=false', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/board',
      headers: { 'x-board-token': 'bogus' },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.data).toBeNull();
    expect(body.error).toBeTruthy();
  });

  it('認証ヘッダー欠落は 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/board' });
    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
  });
});

describe('GET /api/board（人間 Firebase Bearer パス統合）', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // 自分（tatsuya）作成1件 + 他人作成1件 + 機械系作成1件。
    const repository = new InMemoryTaskRepository([
      sampleTask({
        id: 'mine',
        created_by: 'tatsuya.miyazaki@gmail.com',
        created_by_type: 'human',
      }),
      sampleTask({
        id: 'others',
        created_by: 'someone-else@gmail.com',
        created_by_type: 'human',
      }),
      sampleTask({
        id: 'machine',
        created_by: 'claude-code:ceo',
        created_by_type: 'machine',
      }),
    ]);
    app = buildApp({
      repository,
      auth: {
        boardTokens,
        allowedEmails: ['tatsuya.miyazaki@gmail.com'],
        tokenVerifier: fakeVerifier({
          'good-id-token': 'tatsuya.miyazaki@gmail.com',
          'intruder-token': 'intruder@example.com',
        }),
      },
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('人間は自分と機械系が作成したタスクを返し、他人作成は除外する（ADR-0011）', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/board',
      headers: { authorization: 'Bearer good-id-token' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.map((t: Task) => t.id).sort()).toEqual(['machine', 'mine']);
    expect(body.data.map((t: Task) => t.id)).not.toContain('others');
  });

  it('許可リスト外メールの Bearer は 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/board',
      headers: { authorization: 'Bearer intruder-token' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().success).toBe(false);
  });

  it('機械系 X-Board-Token はボード全体を 200 で返す（絞り込まない）', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/board',
      headers: { 'x-board-token': 'dev-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(3);
  });
});

describe('POST /api/board（作成）', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const repository = new InMemoryTaskRepository([]);
    app = buildApp({
      repository,
      auth: {
        boardTokens,
        allowedEmails: ['tatsuya.miyazaki@gmail.com'],
        tokenVerifier: fakeVerifier({ 'good-id-token': 'tatsuya.miyazaki@gmail.com' }),
      },
      ids: () => 'fixed-id',
      clock: () => '2026-06-01T00:00:00.000Z',
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('有効入力で 201・作成タスク（id/timestamps/activity created）を返す', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/board',
      headers: {
        'x-board-token': 'dev-token',
        'x-agent-session': 'create-session',
      },
      payload: {
        title: '記事を書く',
        owner: 'cowork',
        handoff_note: '下書きお願いします',
        status: 'needs-ai',
      },
    });
    expect(res.statusCode).toBe(201);
    const task = res.json().data;
    expect(task.id).toBe('fixed-id');
    expect(task.title).toBe('記事を書く');
    expect(task.status).toBe('needs-ai');
    expect(task.created_by_type).toBe('machine');
    expect(task.created_at).toBe('2026-06-01T00:00:00.000Z');
    expect(task.updated_at).toBe('2026-06-01T00:00:00.000Z');
    expect(task.activity).toHaveLength(1);
    expect(task.activity[0]).toMatchObject({ actor: 'cowork', action: 'created' });
    expect(task.activity[0].session).toBe('create-session');
  });

  it('人間 Bearer で作成すると created_by_type=human を刻む', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/board',
      headers: { authorization: 'Bearer good-id-token' },
      payload: {
        title: '人間が作るタスク',
        owner: 'human',
        handoff_note: '自分で対応',
        status: 'needs-human',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      created_by: 'tatsuya.miyazaki@gmail.com',
      created_by_type: 'human',
    });
  });

  it('必須項目欠落は 422・success=false', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/board',
      headers: { 'x-board-token': 'dev-token' },
      payload: { owner: 'cowork', handoff_note: 'メモ', status: 'needs-ai' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().success).toBe(false);
  });

  it('project/milestone を受理して作成タスクに反映する', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/board',
      headers: { 'x-board-token': 'dev-token' },
      payload: {
        title: '記事を書く',
        owner: 'cowork',
        handoff_note: '下書きお願いします',
        status: 'needs-ai',
        project: 'ニュースレター',
        milestone: '6月号',
      },
    });
    expect(res.statusCode).toBe(201);
    const task = res.json().data;
    expect(task.project).toBe('ニュースレター');
    expect(task.milestone).toBe('6月号');
  });

  it('初期 status が in-progress は 422', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/board',
      headers: { 'x-board-token': 'dev-token' },
      payload: { title: 'x', owner: 'cowork', handoff_note: 'メモ', status: 'in-progress' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('priority/action_type/tags 省略時は既定値で作成される', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/board',
      headers: { 'x-board-token': 'dev-token' },
      payload: { title: 'x', owner: 'human', handoff_note: 'メモ', status: 'needs-human' },
    });
    expect(res.statusCode).toBe(201);
    const task = res.json().data;
    expect(task.priority).toBe('P2');
    expect(task.action_type).toBe('other');
    expect(task.tags).toEqual([]);
  });
});

describe('PATCH /api/board/:id（status 遷移）', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const repository = new InMemoryTaskRepository([
      sampleTask({
        id: 'a',
        status: 'needs-ai',
        owner: 'human',
        updated_at: '2026-06-01T00:00:00Z',
      }),
      sampleTask({
        id: 'wip',
        status: 'in-progress',
        owner: 'cowork',
        updated_at: '2026-06-01T00:00:00Z',
      }),
      sampleTask({
        id: 'blk',
        status: 'blocked',
        owner: 'human',
        blocked_reason: 'API キー待ち',
        updated_at: '2026-06-01T00:00:00Z',
      }),
      sampleTask({
        id: 'limit',
        status: 'in-review',
        owner: 'claude-code',
        review_cycles: 1,
        updated_at: '2026-06-01T00:00:00Z',
        activity: [
          {
            timestamp: '2026-06-01T00:00:00Z',
            actor: 'claude-code:dev',
            action: 'in-progress → in-review',
            from: 'in-progress',
            to: 'in-review',
          },
        ],
      }),
    ]);
    app = buildApp({
      repository,
      auth: { boardTokens },
      clock: () => '2026-06-01T09:00:00.000Z',
      reviewCycleLimit: 1,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('許可遷移（needs-ai→in-progress）で 200・status更新・actor を activity に記録・owner 不変', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/a',
      headers: { 'x-board-token': 'dev-token' },
      payload: { to: 'in-progress', updated_at: '2026-06-01T00:00:00Z' },
    });
    expect(res.statusCode).toBe(200);
    const task = res.json().data;
    expect(task.status).toBe('in-progress');
    expect(task.owner).toBe('human');
    expect(task.updated_at).toBe('2026-06-01T09:00:00.000Z');
    expect(task.activity.at(-1)).toMatchObject({
      actor: 'cowork',
      action: 'needs-ai → in-progress',
    });
  });

  it('X-Agent-Session を activity に記録する', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/wip',
      headers: {
        'x-board-token': 'dev-token',
        'x-agent-session': '  dev-worktree-a3f2  ',
      },
      payload: {
        to: 'needs-human',
        handoff_note: '人間の確認をお願いします',
        updated_at: '2026-06-01T00:00:00Z',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.activity.at(-1).session).toBe('dev-worktree-a3f2');
  });

  it('X-Agent-Session は 128 文字まで受理し、それを超える値は 422 にする', async () => {
    const accepted = await app.inject({
      method: 'PATCH',
      url: '/api/board/wip',
      headers: {
        'x-board-token': 'dev-token',
        'x-agent-session': 'a'.repeat(128),
      },
      payload: {
        to: 'needs-human',
        handoff_note: '人間の確認をお願いします',
        updated_at: '2026-06-01T00:00:00Z',
      },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().data.activity.at(-1).session).toHaveLength(128);

    const rejected = await app.inject({
      method: 'PATCH',
      url: '/api/board/a',
      headers: {
        'x-board-token': 'dev-token',
        'x-agent-session': 'a'.repeat(129),
      },
      payload: { to: 'in-progress', updated_at: '2026-06-01T00:00:00Z' },
    });
    expect(rejected.statusCode).toBe(422);
    expect(rejected.json().error).toMatch(/X-Agent-Session/);
  });

  it.each([
    ['カンマ結合値', 'session-a, session-b'],
    ['重複ヘッダー配列', ['session-a', 'session-b']],
  ])('X-Agent-Session の曖昧な %s は 422 にする', async (_label, sessionHeader) => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/a',
      headers: {
        'x-board-token': 'dev-token',
        'x-agent-session': sessionHeader,
      },
      payload: { to: 'in-progress', updated_at: '2026-06-01T00:00:00Z' },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatch(/X-Agent-Session/);
  });

  it('X-Agent-Session がない場合は activity の session を null にする', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/wip',
      headers: { 'x-board-token': 'dev-token' },
      payload: {
        to: 'needs-human',
        handoff_note: '人間の確認をお願いします',
        updated_at: '2026-06-01T00:00:00Z',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.activity.at(-1).session).toBeNull();
  });

  it('自己レビューは API 経由でも 422 になる（ADR-0007）', async () => {
    const submitted = await app.inject({
      method: 'PATCH',
      url: '/api/board/wip',
      headers: { 'x-board-token': 'machine-token' },
      payload: { to: 'in-review', updated_at: '2026-06-01T00:00:00Z' },
    });
    expect(submitted.statusCode).toBe(200);

    const reviewed = await app.inject({
      method: 'PATCH',
      url: '/api/board/wip',
      headers: { 'x-board-token': 'machine-token' },
      payload: {
        to: 'done',
        updated_at: submitted.json().data.updated_at,
      },
    });
    expect(reviewed.statusCode).toBe(422);
    expect(reviewed.json().error).toMatch(/自己レビュー/);
  });

  it('注入した reviewCycleLimit を API 境界の差し戻し判定に使う', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/limit',
      headers: { 'x-board-token': 'dev-token' },
      payload: {
        to: 'needs-ai',
        handoff_note: '追加修正をお願いします',
        updated_at: '2026-06-01T00:00:00Z',
      },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatch(/差し戻し上限/);
  });

  it('禁止遷移（needs-ai→done）は 422', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/a',
      headers: { 'x-board-token': 'dev-token' },
      payload: { to: 'done', updated_at: '2026-06-01T00:00:00Z' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().success).toBe(false);
  });

  it('引き継ぎ（in-progress→needs-ai）で handoff_note 欠落は 422', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/wip',
      headers: { 'x-board-token': 'dev-token' },
      payload: { to: 'needs-ai', updated_at: '2026-06-01T00:00:00Z' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('古い updated_at（競合）は 409', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/a',
      headers: { 'x-board-token': 'dev-token' },
      payload: { to: 'in-progress', updated_at: '2025-01-01T00:00:00Z' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().success).toBe(false);
  });

  it('ブロック（in-progress→blocked）で 200・blocked_reason をセット・activity 記録', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/wip',
      headers: { 'x-board-token': 'dev-token' },
      payload: { to: 'blocked', blocked_reason: '依存ライブラリ待ち', updated_at: '2026-06-01T00:00:00Z' },
    });
    expect(res.statusCode).toBe(200);
    const task = res.json().data;
    expect(task.status).toBe('blocked');
    expect(task.blocked_reason).toBe('依存ライブラリ待ち');
    expect(task.activity.at(-1)).toMatchObject({ action: 'in-progress → blocked' });
  });

  it('→blocked で blocked_reason 欠落は 422', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/wip',
      headers: { 'x-board-token': 'dev-token' },
      payload: { to: 'blocked', updated_at: '2026-06-01T00:00:00Z' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().success).toBe(false);
  });

  it('解除（blocked→needs-human）で 200・blocked_reason を null にリセット', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/blk',
      headers: { 'x-board-token': 'dev-token' },
      payload: {
        to: 'needs-human',
        handoff_note: 'キー入手、確認お願いします',
        updated_at: '2026-06-01T00:00:00Z',
      },
    });
    expect(res.statusCode).toBe(200);
    const task = res.json().data;
    expect(task.status).toBe('needs-human');
    expect(task.blocked_reason).toBeNull();
    expect(task.handoff_note).toBe('キー入手、確認お願いします');
  });

  it('解除（blocked→needs-ai）で handoff_note 欠落は 422', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/blk',
      headers: { 'x-board-token': 'dev-token' },
      payload: { to: 'needs-ai', updated_at: '2026-06-01T00:00:00Z' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('存在しない id は 404', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/ghost',
      headers: { 'x-board-token': 'dev-token' },
      payload: { to: 'in-progress', updated_at: '2026-06-01T00:00:00Z' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });

  it('updated_at 欠落は 422（前提条件不備）', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/a',
      headers: { 'x-board-token': 'dev-token' },
      payload: { to: 'in-progress' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('認証ヘッダー欠落は 401', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/a',
      payload: { to: 'in-progress', updated_at: '2026-06-01T00:00:00Z' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/board/:id/complete（完了→アーカイブ）', () => {
  let app: FastifyInstance;
  let repository: InMemoryTaskRepository;

  beforeEach(async () => {
    repository = new InMemoryTaskRepository([
      sampleTask({ id: 'fin', status: 'done', owner: 'cowork' }),
      sampleTask({ id: 'wip', status: 'in-progress', owner: 'human' }),
    ]);
    app = buildApp({
      repository,
      auth: { boardTokens },
      clock: () => '2026-06-01T10:00:00.000Z',
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('done タスクの complete で 200・board から消え archive に現れ・activity に archived 記録', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/board/fin/complete',
      headers: {
        'x-board-token': 'dev-token',
        'x-agent-session': 'archive-session',
      },
    });
    expect(res.statusCode).toBe(200);
    const task = res.json().data;
    expect(task.id).toBe('fin');
    expect(task.activity.at(-1)).toMatchObject({ actor: 'cowork', action: 'archived' });
    expect(task.activity.at(-1).session).toBe('archive-session');
    expect((await repository.findAll()).map((t) => t.id)).not.toContain('fin');
    expect((await repository.findArchivedById('fin'))?.id).toBe('fin');
  });

  it('done 以外（in-progress）の complete は 422', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/board/wip/complete',
      headers: { 'x-board-token': 'dev-token' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().success).toBe(false);
  });

  it('complete の再送は冪等（2回目も 200・同タスクを返す）', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/board/fin/complete',
      headers: { 'x-board-token': 'dev-token' },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/api/board/fin/complete',
      headers: { 'x-board-token': 'dev-token' },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().data.id).toBe('fin');
  });

  it('存在しない id の complete は 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/board/ghost/complete',
      headers: { 'x-board-token': 'dev-token' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('認証ヘッダー欠落は 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/board/fin/complete' });
    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /api/board/:id/details（内容編集）', () => {
  let app: FastifyInstance;
  const SEEN = '2026-06-01T00:00:00Z'; // sampleTask の updated_at（楽観ロック照合値）

  const edit = {
    title: '編集後タイトル',
    owner: 'human',
    priority: 'P1',
    action_type: 'review',
    handoff_note: '編集後メモ',
    tags: ['x'],
    updated_at: SEEN,
  };

  beforeEach(async () => {
    const repository = new InMemoryTaskRepository([sampleTask({ id: 't1', status: 'in-progress' })]);
    app = buildApp({
      repository,
      auth: {
        boardTokens,
        allowedEmails: ['human@example.com'],
        tokenVerifier: fakeVerifier({ 'human-id-token': 'human@example.com' }),
      },
      clock: () => '2026-06-01T10:00:00.000Z',
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('有効な編集で 200・フィールド更新／status は不変／edited の activity 付与', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/t1/details',
      headers: {
        'x-board-token': 'dev-token',
        'x-agent-session': 'edit-session',
      },
      payload: edit,
    });
    expect(res.statusCode).toBe(200);
    const t = res.json().data;
    expect(t.title).toBe('編集後タイトル');
    expect(t.owner).toBe('human');
    expect(t.priority).toBe('P1');
    expect(t.tags).toEqual(['x']);
    expect(t.status).toBe('in-progress'); // 遷移はしない
    expect(t.updated_at).toBe('2026-06-01T10:00:00.000Z');
    expect(t.activity.at(-1).action).toBe('edited');
    expect(t.activity.at(-1).session).toBe('edit-session');
  });

  it('編集で project/milestone を更新する', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/t1/details',
      headers: { 'x-board-token': 'dev-token' },
      payload: { ...edit, owner: 'cowork', project: 'API刷新', milestone: 'v2' },
    });
    expect(res.statusCode).toBe(200);
    const t = res.json().data;
    expect(t.project).toBe('API刷新');
    expect(t.milestone).toBe('v2');
  });

  it.each([99, null])(
    '機械系クライアントは review_cycle_limit=%s に変更できない（422、ADR-0007）',
    async (reviewCycleLimit) => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/t1/details',
      headers: { 'x-board-token': 'dev-token' },
      payload: { ...edit, review_cycle_limit: reviewCycleLimit },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatch(/人間のみ/);
    },
  );

  it('人間クライアントは review_cycle_limit を変更できる', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/t1/details',
      headers: { authorization: 'Bearer human-id-token' },
      payload: { ...edit, review_cycle_limit: 99 },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.review_cycle_limit).toBe(99);
  });

  it('不正な入力（title 空）は 422', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/t1/details',
      headers: { 'x-board-token': 'dev-token' },
      payload: { ...edit, title: '' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('updated_at 欠落は 422', async () => {
    const { updated_at: _omit, ...noVersion } = edit;
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/t1/details',
      headers: { 'x-board-token': 'dev-token' },
      payload: noVersion,
    });
    expect(res.statusCode).toBe(422);
  });

  it('存在しない id は 404', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/ghost/details',
      headers: { 'x-board-token': 'dev-token' },
      payload: edit,
    });
    expect(res.statusCode).toBe(404);
  });

  it('updated_at 不一致は 409（楽観ロック）', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/t1/details',
      headers: { 'x-board-token': 'dev-token' },
      payload: { ...edit, updated_at: '2020-01-01T00:00:00Z' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('認証ヘッダー欠落は 401', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/board/t1/details',
      payload: edit,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /api/board/:id（削除）', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const repository = new InMemoryTaskRepository([sampleTask({ id: 't1' }), sampleTask({ id: 't2' })]);
    app = buildApp({ repository, auth: { boardTokens } });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('削除で 200・削除タスクを返し、ボードから消える', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/board/t1',
      headers: { 'x-board-token': 'dev-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.id).toBe('t1');

    const after = await app.inject({
      method: 'GET',
      url: '/api/board',
      headers: { 'x-board-token': 'dev-token' },
    });
    expect(after.json().data.map((t: Task) => t.id)).toEqual(['t2']);
  });

  it('存在しない id の削除は 404', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/board/ghost',
      headers: { 'x-board-token': 'dev-token' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('認証ヘッダー欠落は 401', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/board/t1' });
    expect(res.statusCode).toBe(401);
  });
});
