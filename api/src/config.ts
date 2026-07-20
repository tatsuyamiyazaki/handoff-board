import type { BoardTokenMap } from './auth/auth-middleware.js';

/** グローバル既定の差し戻し上限（ADR-0007）。 */
export const DEFAULT_REVIEW_CYCLE_LIMIT = 5;

/** REVIEW_CYCLE_LIMIT を正の整数にパースする。未設定は既定値 5。 */
export function loadReviewCycleLimit(raw: string | undefined): number {
  if (!raw) return DEFAULT_REVIEW_CYCLE_LIMIT;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('REVIEW_CYCLE_LIMIT must be a positive integer');
  }
  return limit;
}

/** actor の合法形式（ADR-0008）: `owner` または `owner:機能`。最初の `:` で分割し、両側非空・`:` は1個まで。 */
const ACTOR_FORMAT = /^[^:]+(:[^:]+)?$/;

/**
 * 環境変数 BOARD_TOKENS（token→actor のJSON）をパースする。未設定時は空。
 * actor 形式の違反は読み込み時（サーバー起動時）に fail-fast する（ADR-0008 —
 * 不正 actor をリクエスト時まで残さない）。
 */
export function loadBoardTokens(raw: string | undefined): BoardTokenMap {
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('BOARD_TOKENS must be a JSON object of {token: actor}');
  }
  for (const actor of Object.values(parsed as Record<string, unknown>)) {
    if (typeof actor !== 'string' || !ACTOR_FORMAT.test(actor)) {
      throw new Error(
        'BOARD_TOKENS: invalid actor format — expected "owner" or "owner:function"',
      );
    }
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
