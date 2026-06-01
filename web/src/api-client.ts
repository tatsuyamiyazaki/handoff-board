import type { ApiEnvelope, Task } from '@handoff/shared';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';
// 開発用の機械系トークン（api の .env.example の BOARD_TOKENS と対応）。
const DEV_BOARD_TOKEN = import.meta.env.VITE_BOARD_TOKEN ?? 'dev-board-token';

/** GET /api/board。envelope を剥がして Task 配列を返す。失敗は例外。 */
export async function fetchBoard(): Promise<Task[]> {
  const res = await fetch(`${API_BASE}/api/board`, {
    headers: { 'x-board-token': DEV_BOARD_TOKEN },
  });
  const body = (await res.json()) as ApiEnvelope<Task[]>;
  if (!res.ok || !body.success || body.data === null) {
    throw new Error(body.error ?? `board の取得に失敗しました (${res.status})`);
  }
  return body.data;
}
