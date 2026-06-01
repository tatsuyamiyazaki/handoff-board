// ディスパッチャーのエントリ。REST クライアント実体と cron/launchd 骨組み（issue #07）。
// 更新は必ず api の REST 経由で行い、Firestore へは直接アクセスしない。

import type { ApiEnvelope, Task } from '@handoff/shared';
import { runOnce, type DispatcherClient, type RunnerDeps } from './dispatcher-runner.js';

export { runOnce } from './dispatcher-runner.js';
export type { DispatcherClient, RunnerDeps, RunResult } from './dispatcher-runner.js';
export {
  selectNextTask,
  findStaleTasks,
  DISPATCHER_LOCK_TAG,
  DEFAULT_STALE_HOURS,
} from './dispatcher-core.js';

export interface RestClientConfig {
  apiBase: string;
  /** 機械系認証トークン（api の BOARD_TOKENS に対応、actor=ai-batch）。 */
  boardToken: string;
  /** テスト・差し替え用の fetch 実装。既定はグローバル fetch。 */
  fetchImpl?: typeof fetch;
}

/** api の REST を叩く DispatcherClient 実体。envelope を剥がし、失敗は例外にする。 */
export function createRestClient(config: RestClientConfig): DispatcherClient {
  const doFetch = config.fetchImpl ?? fetch;
  const headers = { 'X-Board-Token': config.boardToken, 'Content-Type': 'application/json' };

  return {
    async fetchBoard(): Promise<Task[]> {
      const res = await doFetch(`${config.apiBase}/api/board`, { headers });
      const body = (await res.json()) as ApiEnvelope<Task[]>;
      if (!res.ok || !body.success || body.data === null) {
        throw new Error(body.error ?? `board の取得に失敗しました (${res.status})`);
      }
      return body.data;
    },

    async blockTask(id, blockedReason, expectedUpdatedAt): Promise<Task> {
      const res = await doFetch(`${config.apiBase}/api/board/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          to: 'blocked',
          blocked_reason: blockedReason,
          updated_at: expectedUpdatedAt,
        }),
      });
      const body = (await res.json()) as ApiEnvelope<Task>;
      if (!res.ok || !body.success || body.data === null) {
        throw new Error(body.error ?? `ブロックに失敗しました (${res.status})`);
      }
      return body.data;
    },
  };
}

/**
 * 設定を env から組み立てて DispatcherClient を返す。
 * 必須 env: API_BASE, BOARD_TOKEN。欠落時は例外で fail-fast。
 */
function clientFromEnv(): DispatcherClient {
  const apiBase = process.env.API_BASE;
  const boardToken = process.env.BOARD_TOKEN;
  if (!apiBase || !boardToken) {
    throw new Error('API_BASE と BOARD_TOKEN を設定してください');
  }
  return createRestClient({ apiBase, boardToken });
}

/**
 * cron/launchd から1回だけ呼ばれる想定のエントリ。
 * 周期実行は外部スケジューラ（crontab / launchd plist）に委ね、本体は1回分の処理に徹する。
 * processTask は実運用で LLM 呼び出し等に差し替える（既定は no-op）。
 */
export async function main(
  processTask: RunnerDeps['processTask'] = async () => {},
): Promise<void> {
  const client = clientFromEnv();
  const result = await runOnce({ client, processTask, now: () => new Date().toISOString() });
  // 結果は標準出力に1行で残す（cron のログに集約される）。
  console.log(JSON.stringify({ dispatcher: 'runOnce', ...result }));
}

// 直接起動された場合のみ main を実行（import 時は副作用なし）。
if (process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
