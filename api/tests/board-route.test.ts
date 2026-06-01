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
