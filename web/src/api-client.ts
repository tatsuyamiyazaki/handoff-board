import type { ApiEnvelope, Task } from '@handoff/shared';
import { authHeaders } from './auth/auth-headers';
import { currentIdToken } from './auth/firebase-auth';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8787';

// Web は人間ログイン専用。サインイン中のみ Bearer を付け、未ログインは無認証で送る
// （サーバーは 401 を返す）。機械系 X-Board-Token はブラウザからは使わない。
async function authedHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const idToken = await currentIdToken();
  return { ...authHeaders(idToken), ...extra };
}

/** GET /api/board。サインイン中は Bearer、未ログインは X-Board-Token で認証し、envelope を剥がす。失敗は例外。 */
export async function fetchBoard(): Promise<Task[]> {
  const res = await fetch(`${API_BASE}/api/board`, { headers: await authedHeaders() });
  const body = (await res.json()) as ApiEnvelope<Task[]>;
  if (!res.ok || !body.success || body.data === null) {
    throw new Error(body.error ?? `board の取得に失敗しました (${res.status})`);
  }
  return body.data;
}

/** POST /api/board。新規タスクを作成し、作成された Task を返す。失敗（422 等）は例外。 */
export async function createTask(input: unknown): Promise<Task> {
  const res = await fetch(`${API_BASE}/api/board`, {
    method: 'POST',
    headers: await authedHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  const body = (await res.json()) as ApiEnvelope<Task>;
  if (!res.ok || !body.success || body.data === null) {
    throw new Error(body.error ?? `タスクの作成に失敗しました (${res.status})`);
  }
  return body.data;
}

/** 遷移リクエスト本文。updated_at は楽観ロック照合に必須（ADR-0002）。 */
export interface TransitionInput {
  to: Task['status'];
  handoff_note?: string;
  blocked_reason?: string;
  updated_at: string;
}

/** PATCH /api/board/:id。status 遷移を行い更新後の Task を返す。失敗（422/404/409）は例外。 */
export async function transitionTask(id: string, input: TransitionInput): Promise<Task> {
  const res = await fetch(`${API_BASE}/api/board/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: await authedHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  const body = (await res.json()) as ApiEnvelope<Task>;
  if (!res.ok || !body.success || body.data === null) {
    throw new Error(body.error ?? `タスクの更新に失敗しました (${res.status})`);
  }
  return body.data;
}

/** タスク内容編集の本文。updated_at は楽観ロック照合に必須。 */
export interface EditInput {
  title: string;
  owner: Task['owner'];
  priority: Task['priority'];
  action_type: Task['action_type'];
  handoff_note: string;
  tags: string[];
  updated_at: string;
}

/** PATCH /api/board/:id/details。内容を編集し更新後の Task を返す。失敗（422/404/409）は例外。 */
export async function editTask(id: string, input: EditInput): Promise<Task> {
  const res = await fetch(`${API_BASE}/api/board/${encodeURIComponent(id)}/details`, {
    method: 'PATCH',
    headers: await authedHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  const body = (await res.json()) as ApiEnvelope<Task>;
  if (!res.ok || !body.success || body.data === null) {
    throw new Error(body.error ?? `タスクの編集に失敗しました (${res.status})`);
  }
  return body.data;
}

/** POST /api/board/:id/complete。done タスクを archive へ移し、archive のタスクを返す。冪等。失敗は例外。 */
export async function completeTask(id: string): Promise<Task> {
  const res = await fetch(`${API_BASE}/api/board/${encodeURIComponent(id)}/complete`, {
    method: 'POST',
    headers: await authedHeaders(),
  });
  const body = (await res.json()) as ApiEnvelope<Task>;
  if (!res.ok || !body.success || body.data === null) {
    throw new Error(body.error ?? `アーカイブに失敗しました (${res.status})`);
  }
  return body.data;
}
