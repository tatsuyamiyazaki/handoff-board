# 14. 本番ロールアウト（トークン分離＋ロックステップデプロイ）

Type: HITL ／ Source: [docs/adr/0005](../adr/0005-remove-dispatcher-pull-via-mcp.md), [docs/adr/0006](../adr/0006-owner-department-role-three-axes.md), [docs/adr/0008](../adr/0008-agent-identity-role-token-and-session-id.md)

## What to build

三軸モデルとエージェント識別を本番に反映する。機械トークンを **AI 実行者×機能**ごとに分離し（[ADR-0008](../adr/0008-agent-identity-role-token-and-session-id.md)。ADR-0006 の「実行者ごと」から粒度を細分化）、Cloud Run の `BOARD_TOKENS` を更新したうえで、API（Cloud Run）・web（Firebase Hosting）・handoff-mcp クライアント設定（新トークン＋新ビルド）を**同時に**切り替える。enum が複数箇所に複製されているため部分デプロイは即 422 で壊れる — これがロックステップ制約（ADR-0006）。トークン発行・本番 env 更新・切り替えタイミングの判断が人間承認を要するため HITL。

**dev と reviewer は必ず別トークンにする**: 自己レビュー排除（[ADR-0007](../adr/0007-in-review-state-and-review-cycle-limit.md)）は actor の完全一致で判定するため、1本しか無いとレビュー依頼したタスクを自分で `done` にも差し戻しにもできず 422 で詰む。

## Acceptance criteria

- [x] 本番 `BOARD_TOKENS` が `claude-code:dev` / `claude-code:reviewer` の2トークン構成（旧トークン ── actor `ai-batch` と actor=運用者メール ── は Secret バージョンごと無効化）
- [x] ローカル `.env` は本番と**別値**のトークンを持つ（本番トークンをローカル開発と共有しない）
- [x] handoff-mcp クライアント設定が `handoff-dev` / `handoff-review` の2エントリに分かれ、両方に `HANDOFF_OWNER=claude-code` がある
- [ ] API・web・MCP クライアント設定が同一タイミングで新版に切り替わり、切り替え後に MCP 経由で department / role 付きタスクが本番に作成できる
- [ ] 本番カンバンで owner ドット・部署色チップ・ロールチップ・部署フィルタが動作する
- [ ] activity の actor / created_by に実行者×機能（`claude-code:dev` / `claude-code:reviewer`）の区別が記録される
- [ ] dev トークンでレビュー依頼したタスクを reviewer トークンで `done` にできる（自己レビュー排除の通過を本番で確認）
- [x] `.env.example` と docs/DEPLOYMENT.md が新構成を反映している

## 積み残し

旧 actor（運用者メール）で作られた既存タスクは `created_by` がメール値のままで、handoff-mcp の owner 前方一致照合から漏れる（Web からは見える）。件数と要否は本番疎通後に判断する。手順は [docs/DEPLOYMENT.md](../DEPLOYMENT.md) の「旧 actor（メール）で作られたタスクと MCP の可視性」を参照。

## Blocked by

- [13. handoff-mcp の三軸モデル追随](13-handoff-mcp-three-axes.md)
