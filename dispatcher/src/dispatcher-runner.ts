// ディスパッチャーの実行殻。dispatcher-core の純ロジックを使い、更新は必ず REST API 経由で行う。
// Firestore へは直接アクセスしない（issue #07）。cron/launchd からは runOnce を周期実行する。

import type { Task } from '@handoff/shared';
import { selectNextTask, findStaleTasks } from './dispatcher-core.js';

/**
 * ディスパッチャーが叩く REST クライアント。実体は api の PATCH/GET を呼ぶ。
 * blockTask は PATCH /api/board/:id（to=blocked, blocked_reason）に対応。
 */
export interface DispatcherClient {
  /** GET /api/board のスナップショットを返す。 */
  fetchBoard(): Promise<Task[]>;
  /** 対象を blocked にする（理由必須）。expectedUpdatedAt は楽観ロック用。 */
  blockTask(id: string, blockedReason: string, expectedUpdatedAt: string): Promise<Task>;
}

export interface RunnerDeps {
  client: DispatcherClient;
  /** 1件の対象タスクを処理するフック（差し替え可能）。失敗は throw で通知する。 */
  processTask: (task: Task) => Promise<void>;
  /** 現在時刻 ISO 文字列（テスト用に注入可）。 */
  now: () => string;
  /** stale 掃引のしきい値（時間）。既定は dispatcher-core の 72h。 */
  staleHours?: number;
}

/** runOnce の結果サマリ。掃引・処理・失敗を呼び出し側へ可視化する（握りつぶさない）。 */
export interface RunResult {
  /** stale により blocked にした id 一覧。 */
  swept: string[];
  /** processTask に成功した id（無ければ null）。 */
  processed: string | null;
  /** processTask に失敗し blocked にした対象（無ければ null）。 */
  failed: { id: string; reason: string } | null;
}

const STALE_REASON = '72時間以上 status が変化しなかったため自動的にブロックしました';

/**
 * ディスパッチャーを1回実行する。
 * 1) ボード取得 → 2) stale を blocked に掃引 → 3) 残りから対象1件を選定
 * → 4) processTask 実行（失敗時は理由付きで blocked、握りつぶさず結果に記録）。
 * 対象0件のときは安全に何もしない。すべての更新は client（REST）経由。
 */
export async function runOnce(deps: RunnerDeps): Promise<RunResult> {
  const { client, processTask, now, staleHours } = deps;
  const tasks = await client.fetchBoard();

  // 2) stale 掃引: 72h 無変更の active タスクを blocked にする。
  const stale = findStaleTasks(tasks, now(), staleHours);
  const swept: string[] = [];
  for (const t of stale) {
    await client.blockTask(t.id, STALE_REASON, t.updated_at);
    swept.push(t.id);
  }

  // 3) 掃引済みを除いた中から対象を選定。
  const sweptSet = new Set(swept);
  const next = selectNextTask(tasks.filter((t) => !sweptSet.has(t.id)));
  if (next === null) {
    return { swept, processed: null, failed: null };
  }

  // 4) 処理。失敗は blocked にして結果へ記録する（握りつぶさない）。
  try {
    await processTask(next);
    return { swept, processed: next.id, failed: null };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = `処理に失敗しました: ${message}`;
    await client.blockTask(next.id, reason, next.updated_at);
    return { swept, processed: null, failed: { id: next.id, reason } };
  }
}
