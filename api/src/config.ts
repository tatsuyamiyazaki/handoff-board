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

/** 環境変数 ALLOWED_EMAILS（カンマ区切り）を正規化した配列にする。未設定時は空。 */
export function loadAllowedEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);
}
