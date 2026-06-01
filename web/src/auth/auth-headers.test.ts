import { describe, it, expect } from 'vitest';
import { authHeaders } from './auth-headers';

describe('authHeaders', () => {
  it('人間ログイン中（ID トークンあり）は Authorization: Bearer を返す', () => {
    expect(authHeaders('id-token-abc', 'dev-board-token')).toEqual({
      Authorization: 'Bearer id-token-abc',
    });
  });

  it('未ログイン（ID トークンなし）は開発用 X-Board-Token にフォールバックする', () => {
    expect(authHeaders(null, 'dev-board-token')).toEqual({
      'x-board-token': 'dev-board-token',
    });
  });
});
