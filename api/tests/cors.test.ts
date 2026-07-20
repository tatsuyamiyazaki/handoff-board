import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadCorsOrigins } from '../src/config.js';
import { InMemoryTaskRepository } from '../src/repository/in-memory-task-repository.js';

const boardTokens = { 'dev-token': 'cowork' };
const ORIGIN = 'http://localhost:5173';

describe('CORS', () => {
  it('corsOrigins 指定時はプリフライト(OPTIONS)に CORS ヘッダで応答する', async () => {
    const app = buildApp({
      repository: new InMemoryTaskRepository([]),
      auth: { boardTokens },
      corsOrigins: [ORIGIN],
    });
    await app.ready();

    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/board',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-board-token,x-agent-session',
      },
    });

    expect(res.statusCode).toBeLessThan(300);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(res.headers['access-control-allow-headers']).toContain('X-Agent-Session');
  });

  it('カード削除(DELETE)のプリフライトを許可する', async () => {
    const app = buildApp({
      repository: new InMemoryTaskRepository([]),
      auth: { boardTokens },
      corsOrigins: [ORIGIN],
    });
    await app.ready();

    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/board/some-id',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'DELETE',
        'access-control-request-headers': 'x-board-token',
      },
    });

    expect(res.statusCode).toBeLessThan(300);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(res.headers['access-control-allow-methods']).toContain('DELETE');
  });

  it('corsOrigins 未指定なら CORS ヘッダを付けない（既定では無効）', async () => {
    const app = buildApp({ repository: new InMemoryTaskRepository([]), auth: { boardTokens } });
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/board',
      headers: { origin: ORIGIN, 'x-board-token': 'dev-token' },
    });

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('loadCorsOrigins', () => {
  it('未設定なら開発用 Vite オリジンを既定で許可する', () => {
    expect(loadCorsOrigins(undefined)).toEqual([
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ]);
  });

  it('カンマ区切りを trim して配列にする', () => {
    expect(loadCorsOrigins('https://a.example , https://b.example')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });
});
