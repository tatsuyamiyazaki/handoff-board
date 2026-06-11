# 10. owner 三値化（human / cowork / claude-code）と agent 廃止

Type: AFK ／ Source: [docs/adr/0006](../adr/0006-owner-department-role-three-axes.md)

## What to build

オーナーの語彙を `human` / `cowork` / `claude-code` に差し替える（旧 `ai-batch` / `ai-interactive` は廃止）。具体AIが owner に昇格したため、旧 `agent` フィールド（具体AI識別子）は enum・スキーマ・validation・UI ごと削除する（後継の「ロール」は issue 12 で別フィールドとして新設する）。作成・編集ダイアログの owner 選択肢、カードの担当ドット（`HUMAN` / `COWORK` / `CLAUDE-CODE` 表示と色）、BoardControls の owner フィルタ、dev seed を新語彙に揃える。`owner=human ⇒ agent 不可` だった不変条件は agent ごと消える（三軸の不変条件は issue 11/12 で再構築）。本番 Firestore は空のためデータ移行は不要。

## Acceptance criteria

- [ ] owner の値域が human / cowork / claude-code のみ（旧値は 422 で拒否）
- [ ] Task スキーマ・API・web から `agent` が消えている
- [ ] 作成ダイアログで owner=cowork のタスクを作ると、カードに `COWORK` の担当ドットが表示される
- [ ] owner フィルタが新3値で動作する
- [ ] shared / api / web の既存テストが新語彙で緑（旧語彙のテストデータが残っていない）

## Blocked by

- [09. ディスパッチャー撤去](09-remove-dispatcher.md)
