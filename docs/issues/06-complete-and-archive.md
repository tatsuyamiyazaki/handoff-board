# 06. 完了とアーカイブ

Type: AFK ／ Source: [docs/prd.md](../prd.md)（Stories 13, 14, 15, 16）

## What to build

in-progress → done 遷移（transition-engine）と、`POST /api/board/:id/complete` を実装。complete は `status=done` を前提条件とし、`task-repository.complete` が `board` から `archive` へドキュメントを移動する。冪等（再送・二重クリックで壊れない）。Web に完了タスクのアーカイブボタンを実装。

## Acceptance criteria

- [ ] in-progress→done 遷移が成功し、done は終端（reopen不可）
- [ ] complete は status=done 以外を拒否
- [ ] complete でタスクが board から消え archive に現れる
- [ ] complete の再送が冪等（重複や破損を起こさない）
- [ ] アーカイブが activity に記録される
- [ ] complete の統合テスト（done前提・移動・冪等）が緑

## Blocked by

- 04. status遷移: 着手と引き継ぎ
