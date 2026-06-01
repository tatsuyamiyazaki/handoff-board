import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Task } from '@handoff/shared';
import { buildApp } from '../src/app.js';
import type { TokenVerifier } from '../src/auth/auth-middleware.js';
import { InMemoryTaskRepository } from '../src/repository/in-memory-task-repository.js';

const boardTokens = { 'dev-token': 'ai-batch' };

function fakeVerifier(tokenToEmail: Record<string, string>): TokenVerifier {
  return {
    async verify(idToken: string) {
      const email = tokenToEmail[idToken];
      if (email === undefined) throw new Error('invalid id token');
      return { email };
    },
  };
}

const sampleTask = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'サンプル',
  status: 'needs-ai',
  owner: 'ai-batch',
  priority: 'P2',
  action_type: 'other',
  handoff_note: 'お願いします',
  blocked_reason: null,
  tags: [],
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
    const repository = new InMemoryTaskRepository([sampleTask({ id: 'a' })]);
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

  it('許可リスト内メールの Bearer で 200・タスクを返す', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/board',
      headers: { authorization: 'Bearer good-id-token' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
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

  it('機械系 X-Board-Token は引き続き 200（回帰なし）', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/board',
      headers: { 'x-board-token': 'dev-token' },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /api/board（作成）', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const repository = new InMemoryTaskRepository([]);
    app = buildApp({
      repository,
      auth: { boardTokens },
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
      headers: { 'x-board-token': 'dev-token' },
      payload: {
        title: '記事を書く',
        owner: 'ai-batch',
        handoff_note: '下書きお願いします',
        status: 'needs-ai',
      },
    });
    expect(res.statusCode).toBe(201);
    const task = res.json().data;
    expect(task.id).toBe('fixed-id');
    expect(task.title).toBe('記事を書く');
    expect(task.status).toBe('needs-ai');
    expect(task.created_at).toBe('2026-06-01T00:00:00.000Z');
    expect(task.updated_at).toBe('2026-06-01T00:00:00.000Z');
    expect(task.activity).toHaveLength(1);
    expect(task.activity[0]).toMatchObject({ actor: 'ai-batch', action: 'created' });
  });

  it('必須項目欠落は 422・success=false', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/board',
      headers: { 'x-board-token': 'dev-token' },
      payload: { owner: 'ai-batch', handoff_note: 'メモ', status: 'needs-ai' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().success).toBe(false);
  });

  it('初期 status が in-progress は 422', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/board',
      headers: { 'x-board-token': 'dev-token' },
      payload: { title: 'x', owner: 'ai-batch', handoff_note: 'メモ', status: 'in-progress' },
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
