// リクエストヘッダー → {actor, type} を解決する認証ロジック（ADR-0001 デュアル認証）。
// #01 では機械系（X-Board-Token）パスのみ。人間 Firebase Bearer パスは #02 で追加する。

/** token 文字列 → actor 種別（例 'ai-batch'）のマップ。BOARD_TOKENS 由来。 */
export type BoardTokenMap = Record<string, string>;

export interface AuthConfig {
  boardTokens: BoardTokenMap;
}

export interface AuthResult {
  /** activity.actor に記録する操作主体。機械系はトークン種別。 */
  actor: string;
  type: 'machine' | 'human';
}

/** 認証失敗。HTTP ステータス（401=未認証 / 403=禁止）を持つ。 */
export class AuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

type Headers = Record<string, string | string[] | undefined>;

function headerValue(headers: Headers, name: string): string | undefined {
  const raw = headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * 認証ヘッダーから actor を解決する。
 * - `X-Board-Token` あり → 機械系。マップに無いトークンは 403。
 * - 認証情報が一切無い → 401。
 */
export function authenticate(headers: Headers, config: AuthConfig): AuthResult {
  const boardToken = headerValue(headers, 'x-board-token');

  if (boardToken !== undefined) {
    const actor = config.boardTokens[boardToken];
    if (actor === undefined) {
      throw new AuthError(403, 'invalid board token');
    }
    return { actor, type: 'machine' };
  }

  throw new AuthError(401, 'authentication required');
}
