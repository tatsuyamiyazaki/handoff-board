# 13. handoff-mcp の三軸モデル追随（別リポジトリ）

Type: AFK ／ Source: [docs/adr/0006](../adr/0006-owner-department-role-three-axes.md)

## What to build

別リポジトリ `handoff-mcp`（MCPサーバー、enum を自前複製している）を三軸モデルへ追随させる。複製している owner / agent の enum を新語彙（owner 三値・agent 廃止・department / role 追加）に同期し、create_task / edit_task ツールの入力スキーマと説明文を更新する。ツール説明は AI クライアントが読む実質的な API ドキュメントなので、不変条件（human では部署・ロール不可、role は部署のリストに属する、違反は 422）を明記する。本リポジトリ側と**ロックステップでデプロイする前提**（API だけ先に出すと MCP のタスク作成が 422 で壊れる）であり、デプロイ自体は issue 14 で行う。

## Acceptance criteria

- [ ] handoff-mcp の enum が shared の新語彙と一致している（owner 三値、agent なし、department 4値、role 23値の部署マップ）
- [ ] create_task / edit_task で department / role を指定でき、ツール説明文に不変条件が書かれている
- [ ] 旧語彙（ai-batch / ai-interactive / agent）がコード・テスト・説明文に残っていない
- [ ] handoff-mcp のテストが緑
- [ ] ローカルで新ビルドの MCP サーバー経由で department / role 付きタスクの作成・編集ができる（API はローカル新版に向ける）

## Blocked by

- [12. ロール end-to-end](12-role-field-cascade.md)
