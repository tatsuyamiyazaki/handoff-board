# 07. ディスパッチャー

Type: AFK ／ Source: [docs/prd.md](../prd.md)（Stories 21, 24, 25, 26, 27, 28）

## What to build

`dispatcher-core`（純ロジック）: APIから取得したボードスナップショットに対し、`needs-ai` かつ `ai-batch` を抽出 → `dispatcher-lock` タグを除外 → priority 順にソート → 先頭1件を選定。加えて 72時間 `status` 無変更のタスクを blocked にする掃引ロジック。`dispatcher-runner` は REST クライアント + cron/launchd 骨組みで、`processTask` を差し替え可能なフックとして呼ぶ。処理失敗時は対象を blocked（理由付き）に PATCH する。Firestore へは直接アクセスせず必ず REST API 経由。

## Acceptance criteria

- [ ] 対象抽出（needs-ai+ai-batch、dispatcher-lock除外、priorityソート先頭1件）が正しい
- [ ] 72h無変更タスクが blocked（理由付き）になる
- [ ] processTask 失敗時に対象が blocked になる（握りつぶしなし）
- [ ] 対象0件のとき安全に何もしない
- [ ] すべての更新が REST API 経由（Firestore直アクセスなし）
- [ ] dispatcher-core の単体テスト（抽出・ソート・掃引・0件・失敗）が緑

## Blocked by

- 03. タスク作成フロー
- 04. status遷移: 着手と引き継ぎ
