// Google OAuth（PKCE + ループバック）の純粋ロジック。HTTP サーバー・ブラウザ起動は auth.ts。
import { createHash, randomBytes } from 'node:crypto';

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function createOneShotGate(): { claim: () => boolean } {
  let claimed = false;
  return {
    claim: () => {
      if (claimed) return false;
      claimed = true;
      return true;
    },
  };
}

export function createPkcePair(random: () => Buffer = () => randomBytes(32)): PkcePair {
  const verifier = random().toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function buildAuthUrl(p: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', p.clientId);
  url.searchParams.set('redirect_uri', p.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email');
  url.searchParams.set('code_challenge', p.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', p.state);
  return url.toString();
}

/** ループバックに返ってきたリクエスト URL から認可コードを取り出す。 */
export function parseCallback(reqUrl: string, expectedState: string): { code: string } {
  const url = new URL(reqUrl, 'http://127.0.0.1');
  const error = url.searchParams.get('error');
  if (error) throw new Error(`Google 認可がエラーを返しました: ${error}`);
  if (url.searchParams.get('state') !== expectedState) {
    throw new Error('state が一致しません（CSRF の可能性）');
  }
  const code = url.searchParams.get('code');
  if (!code) throw new Error('認可コードがありません');
  return { code };
}

export async function exchangeCode(p: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  codeVerifier: string;
  fetchFn?: typeof fetch;
}): Promise<{ idToken: string }> {
  const fetchFn = p.fetchFn ?? fetch;
  const body = new URLSearchParams({
    code: p.code,
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    grant_type: 'authorization_code',
    code_verifier: p.codeVerifier,
  });
  if (p.clientSecret) body.set('client_secret', p.clientSecret);
  const res = await fetchFn('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await res.json()) as { id_token?: string; error?: string };
  if (!res.ok || !json.id_token) {
    throw new Error(`トークン交換に失敗しました: ${json.error ?? `HTTP ${res.status ?? '?'}`}`);
  }
  return { idToken: json.id_token };
}
