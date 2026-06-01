# 04. status遷移: 着手と引き継ぎ

Type: AFK ／ Source: [docs/prd.md](../prd.md)（Stories 8, 9, 10, 17, 18, 22, 19）／ 決定: [ADR-0002](../adr/0002-status-transitions-as-server-state-machine.md)

## What to build

`transition-engine`（純関数）に遷移グラフを実装: needs-ai/needs-human → in-progress、in-progress → needs-ai/needs-human/done。グラフ外は422。引き継ぎ遷移（in-progress → needs-ai/needs-human）では `handoff_note` 必須。`PATCH /api/board/:id` が遷移検証 + 楽観的並行制御（last-seen `updated_at` 照合、不一致は409）を行い、`activity-log` に記録。Web はレーン間のドラッグ&ドロップ/ボタンで遷移を発火し、引き継ぎ時はダイアログで handoff_note を要求、サーバー拒否（422/409）時はUIをロールバックする。

## Acceptance criteria

- [ ] 全許可遷移が成功、全禁止遷移（例 needs-ai→done、done→任意）が422
- [ ] 引き継ぎ遷移で handoff_note 欠落は422
- [ ] 古い `updated_at` での更新は409、UIは再取得を促す
- [ ] `owner` は遷移で自動変更されない。actor は activity に記録
- [ ] DnD の楽観的更新がサーバー拒否時に元レーンへ戻る
- [ ] transition-engine 単体テストと PATCH 統合テストが緑

## Blocked by

- 01. ウォーキングスケルトン
- 03. タスク作成フロー
