import { describe, it, expect } from 'vitest';
import {
  authenticate,
  AuthError,
  type TokenVerifier,
} from '../src/auth/auth-middleware.js';

const boardTokens = { 'dev-token': 'cowork', 'agent-token': 'claude-code' };

/** メール→検証成功、それ以外は throw するフェイク。Admin SDK の代替。 */
function fakeVerifier(tokenToEmail: Record<string, string>): TokenVerifier {
  return {
    async verify(idToken: string) {
      const email = tokenToEmail[idToken];
      if (email === undefined) throw new Error('invalid id token');
      return { email };
    },
  };
}

async function caught(fn: () => Promise<unknown>): Promise<AuthError> {
  try {
    await fn();
  } catch (e) {
    return e as AuthError;
  }
  throw new Error('expected authenticate to throw, but it did not');
}

describe('authenticate（機械系 X-Board-Token パス）', () => {
  it('有効な X-Board-Token は actor をトークン種別として解決する', async () => {
    const result = await authenticate({ 'x-board-token': 'dev-token' }, { boardTokens });
    expect(result).toEqual({ actor: 'cowork', type: 'machine' });
  });

  it('別トークンは対応する actor を解決する', async () => {
    const result = await authenticate({ 'x-board-token': 'agent-token' }, { boardTokens });
    expect(result).toEqual({ actor: 'claude-code', type: 'machine' });
  });

  it('未知の X-Board-Token は 403 で拒否する', async () => {
    const err = await caught(() => authenticate({ 'x-board-token': 'bogus' }, { boardTokens }));
    expect(err).toBeInstanceOf(AuthError);
    expect(err.status).toBe(403);
  });

  it.each(['toString', 'constructor', 'valueOf'])(
    'Object.prototype 由来の名前 %s は空のトークンマップで 403',
    async (inheritedName) => {
      const err = await caught(() =>
        authenticate({ 'x-board-token': inheritedName }, { boardTokens: {} }),
      );
      expect(err).toBeInstanceOf(AuthError);
      expect(err.status).toBe(403);
    },
  );

  it.each(['toString', 'constructor', 'valueOf'])(
    'Object.prototype 由来の名前 %s は設定済みマップでも 403',
    async (inheritedName) => {
      const err = await caught(() =>
        authenticate({ 'x-board-token': inheritedName }, { boardTokens }),
      );
      expect(err).toBeInstanceOf(AuthError);
      expect(err.status).toBe(403);
    },
  );

  it('認証ヘッダーが一切無ければ 401', async () => {
    const err = await caught(() => authenticate({}, { boardTokens }));
    expect(err).toBeInstanceOf(AuthError);
    expect(err.status).toBe(401);
  });
});

describe('authenticate（人間 Firebase Bearer パス）', () => {
  const tokenVerifier = fakeVerifier({ 'good-id-token': 'tatsuya.miyazaki@gmail.com' });
  const allowedEmails = ['tatsuya.miyazaki@gmail.com'];
  const config = { boardTokens, allowedEmails, tokenVerifier };

  it('許可リスト内メールの有効な Bearer トークンは actor=当人メールの human として解決する', async () => {
    const result = await authenticate(
      { authorization: 'Bearer good-id-token' },
      config,
    );
    expect(result).toEqual({ actor: 'tatsuya.miyazaki@gmail.com', type: 'human' });
  });

  it('検証は通るが許可リスト外のメールは 403', async () => {
    const outsider = fakeVerifier({ 'intruder-token': 'intruder@example.com' });
    const err = await caught(() =>
      authenticate(
        { authorization: 'Bearer intruder-token' },
        { boardTokens, allowedEmails, tokenVerifier: outsider },
      ),
    );
    expect(err).toBeInstanceOf(AuthError);
    expect(err.status).toBe(403);
  });

  it('検証に失敗する（無効な）Bearer トークンは 401', async () => {
    const err = await caught(() =>
      authenticate({ authorization: 'Bearer bogus-token' }, config),
    );
    expect(err).toBeInstanceOf(AuthError);
    expect(err.status).toBe(401);
  });

  it('Bearer はあるが検証器が未設定なら 401', async () => {
    const err = await caught(() =>
      authenticate({ authorization: 'Bearer good-id-token' }, { boardTokens, allowedEmails }),
    );
    expect(err).toBeInstanceOf(AuthError);
    expect(err.status).toBe(401);
  });
});

describe('authenticate（人間パスのドメイン許可 allowedEmailDomains）', () => {
  it('許可ドメインに一致するメールは、完全一致リストに無くても human として通す', async () => {
    const tokenVerifier = fakeVerifier({ 'sb-token': 'taro@sunbit.co.jp' });
    const result = await authenticate(
      { authorization: 'Bearer sb-token' },
      { boardTokens, allowedEmails: [], allowedEmailDomains: ['sunbit.co.jp'], tokenVerifier },
    );
    expect(result).toEqual({ actor: 'taro@sunbit.co.jp', type: 'human' });
  });

  it('ドメイン照合は大文字小文字を無視する', async () => {
    const tokenVerifier = fakeVerifier({ 'sb-token': 'Hanako@SunBit.co.jp' });
    const result = await authenticate(
      { authorization: 'Bearer sb-token' },
      { boardTokens, allowedEmailDomains: ['sunbit.co.jp'], tokenVerifier },
    );
    expect(result).toEqual({ actor: 'Hanako@SunBit.co.jp', type: 'human' });
  });

  it('許可ドメイン外のメールは 403', async () => {
    const tokenVerifier = fakeVerifier({ 'x-token': 'someone@other.example' });
    const err = await caught(() =>
      authenticate(
        { authorization: 'Bearer x-token' },
        { boardTokens, allowedEmailDomains: ['sunbit.co.jp'], tokenVerifier },
      ),
    );
    expect(err).toBeInstanceOf(AuthError);
    expect(err.status).toBe(403);
  });

  it('部分一致のサブドメイン偽装（evil-sunbit.co.jp）は通さない', async () => {
    const tokenVerifier = fakeVerifier({ 'evil-token': 'attacker@evil-sunbit.co.jp' });
    const err = await caught(() =>
      authenticate(
        { authorization: 'Bearer evil-token' },
        { boardTokens, allowedEmailDomains: ['sunbit.co.jp'], tokenVerifier },
      ),
    );
    expect(err).toBeInstanceOf(AuthError);
    expect(err.status).toBe(403);
  });

  it('完全一致リストとドメインリストは併用でき、どちらか一方を満たせば通す', async () => {
    const tokenVerifier = fakeVerifier({ 'g-token': 'tatsuya.miyazaki@gmail.com' });
    const result = await authenticate(
      { authorization: 'Bearer g-token' },
      {
        boardTokens,
        allowedEmails: ['tatsuya.miyazaki@gmail.com'],
        allowedEmailDomains: ['sunbit.co.jp'],
        tokenVerifier,
      },
    );
    expect(result).toEqual({ actor: 'tatsuya.miyazaki@gmail.com', type: 'human' });
  });
});
