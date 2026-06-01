# 03. タスク作成フロー

Type: AFK ／ Source: [docs/prd.md](../prd.md)（Stories 5, 6, 7, 20, 19一部）

## What to build

`POST /api/board` でタスクを作成する経路を端から端まで通す。作成コントラクト: `title` / `owner` / `handoff_note` 必須、初期 `status` は `needs-ai` か `needs-human` のみ許可、既定値は `priority=P2` / `action_type=other` / `tags=[]`。`task-repository.create` がドキュメントを作り、`activity-log` が「created」エントリを追記。Web に作成ダイアログ（バリデーション付き）を実装し、作成後ボードに反映される。

## Acceptance criteria

- [ ] 必須項目欠落・初期status不正（in-progress/done/blocked）は422で拒否
- [ ] 省略時に既定値（P2 / other / []）が適用される
- [ ] 作成タスクが `created_at`/`updated_at` を持ち、activity に created が1件入る
- [ ] UIの作成ダイアログがバリデーションエラーを表示し、成功時にカードが該当レーンに出る
- [ ] 作成の単体/統合テスト（必須・既定値・初期status制約）が緑

## Blocked by

- 01. ウォーキングスケルトン
