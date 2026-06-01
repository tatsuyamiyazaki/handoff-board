import type { BoardTokenMap } from './auth/auth-middleware.js';

/** 環境変数 BOARD_TOKENS（token→actor のJSON）をパースする。未設定時は空。 */
export function loadBoardTokens(raw: string | undefined): BoardTokenMap {
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('BOARD_TOKENS must be a JSON object of {token: actor}');
  }
  return parsed as BoardTokenMap;
}
