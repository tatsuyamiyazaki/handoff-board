# 01. ウォーキングスケルトン: ボード表示

Type: AFK ／ Source: [docs/prd.md](../prd.md)（Stories 1, 2, 23）

## What to build

pnpmモノレポ（`shared` / `api` / `web` / `dispatcher`）を立ち上げ、ボードを端から端まで表示する最小経路を通す。`shared/types` にタスクスキーマと status enum を定義。`api` は Fastify + Firebase Admin SDK で `GET /api/board` を提供し、`X-Board-Token` ヘッダーで認証する。`task-repository.findAll` が Firestore エミュレータの `board` コレクションを読む。`web` は Vite + React SPA で、`api-client`（dev用トークン注入）経由で取得したタスクを5レーン（needs-ai / needs-human / in-progress / done / blocked）にカードとして描画する。

## Acceptance criteria

- [ ] `pnpm install` 後、api/web/エミュレータがローカルで起動する
- [ ] `GET /api/board` が正しい `X-Board-Token` で200、無効/欠落で403/401を返す
- [ ] エミュレータの `board` に入れたタスクがUIの該当レーンにカード表示される
- [ ] `shared/types` がタスク全項目（id/title/status/owner/priority/action_type/handoff_note/blocked_reason/tags/created_at/updated_at/activity）を型定義
- [ ] Vitest が動作し、Playwright E2E「ボードが開き5レーンが見える」が緑
- [ ] レスポンスは共通 envelope（success/data/error）

## Blocked by

None - can start immediately
