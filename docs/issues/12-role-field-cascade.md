# 12. ロール end-to-end（部署連動ドロップダウン）

Type: AFK ／ Source: [docs/adr/0006](../adr/0006-owner-department-role-three-axes.md)

## What to build

タスクにロール `role`（nullable）を追加する。値域は部署→ロールの固定マップ（全23値、正準リストは ADR-0006 に記載。例: engineering 配下の `tech-lead` `code-review` `debug` …、contents 配下の `uradorino` `anti-ai-slop` …）。不変条件は「`role` 非 null ⇒ `department` 非 null かつ role はその部署のリストに属する」で、違反はサーバーが 422 で厳格拒否。作成・編集ダイアログのロールドロップダウンは選択中の部署のロールだけを候補に出し、部署を変えたら role をリセット、owner を human にしたら部署・ロール両方をクリアする。カードには部署チップに加えてロールチップを常時表示する（null なら非表示）。ロールフィルタは作らない（ADR-0006 で見送り）。

## Acceptance criteria

- [ ] role の値域が部署→ロールのマップに従う（部署不一致・部署 null での role 指定・human での指定はすべて 422）
- [ ] department=engineering を選ぶとロール候補が engineering の14個に絞られる
- [ ] 部署を変更すると選択済み role がリセットされる
- [ ] role=code-review のタスクのカードに部署チップとロールチップが両方表示される
- [ ] BoardControls にロールフィルタが**ない**こと（部署フィルタまで）
- [ ] shared / api / web のテストが緑（マップ整合・カスケード・チップ表示を含む）

## Blocked by

- [11. AI部署フィールド end-to-end](11-department-field.md)
