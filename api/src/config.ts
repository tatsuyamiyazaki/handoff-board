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

/**
 * 環境変数 ALLOWED_EMAIL_DOMAINS（カンマ区切り）を正規化したドメイン配列にする。
 * 先頭の `@` は許容して除去し、小文字化する。未設定時は空。
 */
export function loadAllowedEmailDomains(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ''))
    .filter((domain) => domain.length > 0);
}

/** ローカル開発で Web(Vite) が動く既定オリジン。CORS_ORIGIN 未設定時に許可する。 */
const DEV_WEB_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

/**
 * 環境変数 CORS_ORIGIN（カンマ区切り）を許可オリジン配列にする。
 * 未設定時はローカル開発の Vite オリジンを既定で許可する。
 */
export function loadCorsOrigins(raw: string | undefined): string[] {
  if (!raw) return DEV_WEB_ORIGINS;
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
