# 02. 人間認証: Googleサインイン + 許可リスト

Type: HITL ／ Source: [docs/prd.md](../prd.md)（Stories 3, 4）／ 決定: [ADR-0001](../adr/0001-dual-auth-machine-token-and-human-firebase.md)

## What to build

`auth-middleware` を2系統に拡張する。`X-Board-Token` があれば機械系パス、`Authorization: Bearer <idToken>` があれば Admin SDK で検証し許可リスト（`ALLOWED_EMAILS`）にあるメールのみ通す人間パス、どちらも無効なら401/403。Web に Firebase の Google サインインを実装し、取得した ID トークンを `api-client` が全リクエストに注入する。

HITL: Firebase プロジェクト作成・Google プロバイダ有効化・許可メール設定という人間のセットアップが前提。

## Acceptance criteria

- [ ] 許可リスト内メールでサインインするとボード操作が通る
- [ ] 許可リスト外メールはサインインできても403
- [ ] `X-Board-Token` の機械系パスが引き続き機能する（回帰なし）
- [ ] 認証情報（トークン/許可リスト）は環境変数 / Secret Manager 管理、ハードコードなし。`.env.example` を用意
- [ ] `activity.actor` が人間ログイン時は当人のメール、機械系はトークン種別で記録される
- [ ] auth-middleware の単体/統合テスト（有効/無効/許可外/欠落、actor解決）が緑

## Blocked by

- 01. ウォーキングスケルトン
