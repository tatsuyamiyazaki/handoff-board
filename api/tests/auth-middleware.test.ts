import { describe, it, expect } from 'vitest';
import { authenticate, AuthError } from '../src/auth/auth-middleware.js';

const boardTokens = { 'dev-token': 'ai-batch', 'agent-token': 'ai-interactive' };

function caught(fn: () => unknown): AuthError {
  try {
    fn();
  } catch (e) {
    return e as AuthError;
  }
  throw new Error('expected authenticate to throw, but it did not');
}

describe('authenticate（機械系 X-Board-Token パス）', () => {
  it('有効な X-Board-Token は actor をトークン種別として解決する', () => {
    const result = authenticate({ 'x-board-token': 'dev-token' }, { boardTokens });
    expect(result).toEqual({ actor: 'ai-batch', type: 'machine' });
  });

  it('別トークンは対応する actor を解決する', () => {
    const result = authenticate({ 'x-board-token': 'agent-token' }, { boardTokens });
    expect(result).toEqual({ actor: 'ai-interactive', type: 'machine' });
  });

  it('未知の X-Board-Token は 403 で拒否する', () => {
    const err = caught(() => authenticate({ 'x-board-token': 'bogus' }, { boardTokens }));
    expect(err).toBeInstanceOf(AuthError);
    expect(err.status).toBe(403);
  });

  it('認証ヘッダーが一切無ければ 401', () => {
    const err = caught(() => authenticate({}, { boardTokens }));
    expect(err).toBeInstanceOf(AuthError);
    expect(err.status).toBe(401);
  });
});
