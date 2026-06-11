# 14. 本番ロールアウト（トークン分離＋ロックステップデプロイ）

Type: HITL ／ Source: [docs/adr/0005](../adr/0005-remove-dispatcher-pull-via-mcp.md), [docs/adr/0006](../adr/0006-owner-department-role-three-axes.md)

## What to build

三軸モデルを本番に反映する。機械トークンを AI 実行者ごとに分離し（Cloud Run の `BOARD_TOKENS` を cowork 用 / claude-code 用の2トークン構成に更新、actor 名も新語彙）、API（Cloud Run）・web（Firebase Hosting）・handoff-mcp クライアント設定（新トークン＋新ビルド）を**同時に**切り替える。enum が複数箇所に複製されているため部分デプロイは即 422 で壊れる — これがロックステップ制約（ADR-0006）。`.env.example` のトークン例と docs/DEPLOYMENT.md の手順・env 一覧も新構成に更新する。トークン発行・本番 env 更新・切り替えタイミングの判断が人間承認を要するため HITL。

## Acceptance criteria

- [ ] 本番 `BOARD_TOKENS` が cowork / claude-code の2トークン構成（旧トークンは無効化）
- [ ] API・web・MCP クライアント設定が同一タイミングで新版に切り替わり、切り替え後に MCP 経由で department / role 付きタスクが本番に作成できる
- [ ] 本番カンバンで owner ドット・部署色チップ・ロールチップ・部署フィルタが動作する
- [ ] activity の actor / created_by に cowork / claude-code の区別が記録される
- [ ] `.env.example` と docs/DEPLOYMENT.md が新構成を反映している

## Blocked by

- [13. handoff-mcp の三軸モデル追随](13-handoff-mcp-three-axes.md)
