import type { ApiEnvelope, Task } from '@handoff/shared';
import { authHeaders } from './auth/auth-headers';
import { currentIdToken } from './auth/firebase-auth';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';
// 開発用の機械系トークン（api の .env.example の BOARD_TOKENS と対応）。人間ログイン中は使われない。
const DEV_BOARD_TOKEN = import.meta.env.VITE_BOARD_TOKEN ?? 'dev-board-token';

/** GET /api/board。サインイン中は Bearer、未ログインは X-Board-Token で認証し、envelope を剥がす。失敗は例外。 */
export async function fetchBoard(): Promise<Task[]> {
  const idToken = await currentIdToken();
  const res = await fetch(`${API_BASE}/api/board`, {
    headers: authHeaders(idToken, DEV_BOARD_TOKEN),
  });
  const body = (await res.json()) as ApiEnvelope<Task[]>;
  if (!res.ok || !body.success || body.data === null) {
    throw new Error(body.error ?? `board の取得に失敗しました (${res.status})`);
  }
  return body.data;
}
