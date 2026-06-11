// リクエストヘッダー → {actor, type} を解決する認証ロジック（ADR-0001 デュアル認証）。
// 機械系（X-Board-Token）と人間（Firebase Bearer ID トークン + 許可リスト）の2系統。

/** token 文字列 → actor 種別（例 'cowork'）のマップ。BOARD_TOKENS 由来。 */
export type BoardTokenMap = Record<string, string>;

/**
 * Firebase ID トークンの検証器。Admin SDK の verifyIdToken を抽象化し、
 * テストではフェイクを注入できるようにする。検証失敗時は throw する。
 */
export interface TokenVerifier {
  verify(idToken: string): Promise<{ email: string }>;
}

export interface AuthConfig {
  boardTokens: BoardTokenMap;
  /** 人間パスで通過を許すメールアドレス（完全一致）。ALLOWED_EMAILS 由来。 */
  allowedEmails?: string[];
  /** 人間パスで通過を許すメールドメイン（@以降の完全一致）。ALLOWED_EMAIL_DOMAINS 由来。 */
  allowedEmailDomains?: string[];
  /** Firebase ID トークン検証器。未設定なら人間パスは利用不可。 */
  tokenVerifier?: TokenVerifier;
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
export async function authenticate(headers: Headers, config: AuthConfig): Promise<AuthResult> {
  const boardToken = headerValue(headers, 'x-board-token');

  if (boardToken !== undefined) {
    const actor = config.boardTokens[boardToken];
    if (actor === undefined) {
      throw new AuthError(403, 'invalid board token');
    }
    return { actor, type: 'machine' };
  }

  const authorization = headerValue(headers, 'authorization');
  if (authorization?.startsWith('Bearer ')) {
    return authenticateHuman(authorization.slice('Bearer '.length), config);
  }

  throw new AuthError(401, 'authentication required');
}

/**
 * Firebase ID トークンを検証し、許可されたメール/ドメインなら actor=メールの human を返す。
 * - 検証器未設定 / トークン不正 → 401。
 * - 検証は通るが許可リスト・許可ドメインのいずれにも合致しない → 403。
 */
async function authenticateHuman(idToken: string, config: AuthConfig): Promise<AuthResult> {
  if (config.tokenVerifier === undefined) {
    throw new AuthError(401, 'id token verification unavailable');
  }

  let email: string;
  try {
    ({ email } = await config.tokenVerifier.verify(idToken));
  } catch {
    throw new AuthError(401, 'invalid id token');
  }

  if (!isEmailAllowed(email, config)) {
    throw new AuthError(403, 'email not allowed');
  }

  return { actor: email, type: 'human' };
}

/** メール完全一致リスト、または @以降のドメイン一致のいずれかを満たすか判定する。 */
function isEmailAllowed(email: string, config: AuthConfig): boolean {
  const normalized = email.toLowerCase();
  if ((config.allowedEmails ?? []).includes(normalized)) {
    return true;
  }
  // 末尾一致ではなく @ で分割したドメイン部の完全一致で照合する
  // （evil-sunbit.co.jp のような偽装を弾くため）。
  const domain = normalized.split('@')[1];
  if (domain === undefined) {
    return false;
  }
  return (config.allowedEmailDomains ?? []).includes(domain);
}
