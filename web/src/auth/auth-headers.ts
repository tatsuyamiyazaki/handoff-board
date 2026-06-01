// 認証ヘッダの組み立て（純粋関数）。Web は人間ログイン専用。
// サインイン中は Firebase ID トークンを Bearer で送る。未ログインは認証ヘッダ無し
// （機械系 X-Board-Token へはフォールバックしない＝サインインしないとボードを読めない）。

/** ID トークンがあれば Bearer ヘッダ、無ければ空（未認証）を返す。 */
export function authHeaders(idToken: string | null): Record<string, string> {
  return idToken ? { Authorization: `Bearer ${idToken}` } : {};
}
