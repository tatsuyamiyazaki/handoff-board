// 認証ヘッダの組み立て（純粋関数）。サインイン状態に応じて人間/機械系を切り替える。
// 人間ログイン中は Firebase ID トークンを Bearer で、未ログインは開発用 X-Board-Token を使う。

/** ID トークンがあれば Bearer、無ければ開発用 board token のヘッダを返す。 */
export function authHeaders(idToken: string | null, devBoardToken: string): Record<string, string> {
  if (idToken) {
    return { Authorization: `Bearer ${idToken}` };
  }
  return { 'x-board-token': devBoardToken };
}
