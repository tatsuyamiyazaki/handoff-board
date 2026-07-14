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
