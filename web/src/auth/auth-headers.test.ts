import { describe, it, expect } from 'vitest';
import { authHeaders } from './auth-headers';

describe('authHeaders', () => {
  it('人間ログイン中（ID トークンあり）は Authorization: Bearer を返す', () => {
    expect(authHeaders('id-token-abc')).toEqual({
      Authorization: 'Bearer id-token-abc',
    });
  });

  it('未ログイン（ID トークンなし）は認証ヘッダを付けない（機械系トークンにフォールバックしない）', () => {
    expect(authHeaders(null)).toEqual({});
  });
});
