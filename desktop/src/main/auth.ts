// システムブラウザ + ループバックで Google サインインし、id_token を返す。
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import { shell } from 'electron';
import { buildAuthUrl, createPkcePair, exchangeCode, parseCallback } from './auth-core.js';

// build.mjs の define で注入される（コミットしない。env HANDOFF_GOOGLE_CLIENT_ID / _SECRET）
declare const __GOOGLE_CLIENT_ID__: string;
declare const __GOOGLE_CLIENT_SECRET__: string;

const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

export async function signInWithGoogle(): Promise<{ idToken: string }> {
  const clientId = __GOOGLE_CLIENT_ID__;
  if (!clientId) {
    throw new Error(
      'Google クライアント ID が未設定です（HANDOFF_GOOGLE_CLIENT_ID を設定してビルドしてください）',
    );
  }
  const { verifier, challenge } = createPkcePair();
  const state = randomBytes(16).toString('base64url');

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      try {
        const { code } = parseCallback(req.url ?? '', state);
        res.end('サインインが完了しました。このタブを閉じてアプリに戻ってください。');
        finish(() =>
          exchangeCode({
            code,
            clientId,
            clientSecret: __GOOGLE_CLIENT_SECRET__,
            redirectUri,
            codeVerifier: verifier,
          }).then(resolve, reject),
        );
      } catch (err: unknown) {
        res.statusCode = 400;
        res.end('サインインに失敗しました。アプリに戻ってやり直してください。');
        finish(() => reject(err instanceof Error ? err : new Error(String(err))));
      }
    });

    let redirectUri = '';
    const timer = setTimeout(() => {
      finish(() => reject(new Error('サインインがタイムアウトしました（5分）')));
    }, SIGN_IN_TIMEOUT_MS);

    function finish(done: () => void): void {
      clearTimeout(timer);
      server.close();
      done();
    }

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      redirectUri = 'http://127.0.0.1:' + String(port);
      const url = buildAuthUrl({ clientId, redirectUri, codeChallenge: challenge, state });
      void shell.openExternal(url);
    });
  });
}
