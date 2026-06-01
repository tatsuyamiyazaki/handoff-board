// Firebase Admin SDK による ID トークン検証の本番実装（配線のみ）。
// emulator/実機が無いローカルでは生成されず、テストはフェイク TokenVerifier を使う（#01 の Firestore と同方針）。

import type { Auth } from 'firebase-admin/auth';
import type { TokenVerifier } from './auth-middleware.js';

/** firebase-admin の Auth を包み、検証済みトークンから email を取り出す。 */
export class FirebaseTokenVerifier implements TokenVerifier {
  constructor(private readonly auth: Auth) {}

  async verify(idToken: string): Promise<{ email: string }> {
    const decoded = await this.auth.verifyIdToken(idToken);
    if (!decoded.email) {
      throw new Error('id token has no email claim');
    }
    return { email: decoded.email };
  }
}
