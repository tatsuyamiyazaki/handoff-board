import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Task } from '@handoff/shared';
import { fetchBoard } from '../api-client';

/** ボードのポーリング間隔（ミリ秒）。手動リロード不要にする（Story 29、10〜15秒）。 */
export const BOARD_POLL_INTERVAL_MS = 12_000;

/** ボードクエリの共有キー。遷移/アーカイブ後の無効化にも使う。 */
export const BOARD_QUERY_KEY = ['board'] as const;

interface UseBoardOptions {
  /** テスト用に差し替え可能な取得関数。既定は api-client.fetchBoard。 */
  queryFn?: () => Promise<Task[]>;
  /** 再取得間隔（ミリ秒）。既定は BOARD_POLL_INTERVAL_MS。 */
  refetchInterval?: number;
  /** サインイン済みのときだけ取得する。未ログイン時は取得・ポーリングを止める。既定は true。 */
  enabled?: boolean;
}

/**
 * ボードを取得し、一定間隔で自動再取得する（#08）。
 * 他クライアント（人間/AI/ディスパッチャー）の変更はポーリングで反映される。
 * enabled=false（未ログイン）の間は取得しない。
 */
export function useBoard(options: UseBoardOptions = {}): UseQueryResult<Task[]> {
  return useQuery({
    queryKey: BOARD_QUERY_KEY,
    queryFn: options.queryFn ?? fetchBoard,
    refetchInterval: options.refetchInterval ?? BOARD_POLL_INTERVAL_MS,
    enabled: options.enabled ?? true,
  });
}
