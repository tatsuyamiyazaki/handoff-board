# デプロイ / 運用メモ（開発引継ぎ用）

このドキュメントは **コードからは読み取れないインフラの現状と再現手順** をまとめたもの。
機能仕様はコード＋`docs/adr/`、ドメイン用語は `CONTEXT.md` を参照。
最終更新: 2026-06-02（API を Cloud Run、web を Firebase Hosting に初回デプロイ）。

## 公開 URL

| 面 | URL | ホスティング |
|---|---|---|
| Web（React SPA） | https://handoff-dashboard.web.app | Firebase Hosting |
| API（Fastify） | https://handoff-api-563758846764.asia-northeast1.run.app | Cloud Run |

- Cloud Run は同一サービスに別形式の URL も持つ（`https://handoff-api-yjpcj2vzka-an.a.run.app`）。どちらも同じサービスを指す。web バンドルには上表の `…-563758846764.asia-northeast1.run.app` 形式を焼き込み済み。

## 構成図

```
ブラウザ → handoff-dashboard.web.app (Firebase Hosting / 静的SPA)
            ├─ Google サインイン (Firebase Auth)
            └─ fetch(VITE_API_BASE) → Cloud Run API (handoff-api)
                                        ├─ 認証: Bearer(IDトークン)＋allowlist / 機械系は X-Board-Token
                                        └─ Firestore: コレクション board / archive
```

## GCP / Firebase リソース

| 項目 | 値 |
|---|---|
| プロジェクト | `handoff-dashboard`（projectNumber `563758846764`） |
| リージョン | `asia-northeast1`（東京） |
| Cloud Run サービス | `handoff-api` |
| Firebase Hosting サイト | `handoff-dashboard`（`*.web.app` / `*.firebaseapp.com`） |
| 課金アカウント | `Sunbit-eb-02`（`019D77-5C87AD-49C21E`）をリンク済み |
| Secret Manager | `handoff-board-tokens`（API の `BOARD_TOKENS` を格納） |
| ランタイム SA | `563758846764-compute@developer.gserviceaccount.com`（`roles/datastore.user` ＋ 当 secret の accessor 付与済み） |
| 有効化済み API | run / cloudbuild / artifactregistry / firestore / secretmanager |

## 環境変数

### Cloud Run（API）— `gcloud run services describe handoff-api` で確認可
| 変数 | 用途 | 供給元 |
|---|---|---|
| `USE_FIRESTORE=1` | Firestore を使う明示フラグ（後述の検知ロジック） | 平文 env |
| `GCLOUD_PROJECT=handoff-dashboard` | Firestore プロジェクトID | 平文 env |
| `CORS_ORIGIN` | `https://handoff-dashboard.web.app,https://handoff-dashboard.firebaseapp.com` | 平文 env |
| `ALLOWED_EMAILS` | 人間ログインの許可メール（例: `tatsuya.miyazaki@gmail.com`） | 平文 env |
| `ALLOWED_EMAIL_DOMAINS` | 許可ドメイン（例: `sunbit.co.jp`） | 平文 env |
| `BOARD_TOKENS` | 機械系トークン→actor の JSON。AI 実行者ごとに分離（例 `{"<cowork-token>":"cowork","<claude-code-token>":"claude-code"}`、ADR-0006） | **Secret Manager**（`handoff-board-tokens:latest`） |
| `PORT` | Cloud Run が自動注入（8080） | Cloud Run |

- **`GOOGLE_APPLICATION_CREDENTIALS` は Cloud Run に設定しない**。ランタイムはメタデータ ADC（ランタイム SA）で Firestore に接続する。

### Web ビルド（Vite、`import.meta.env`）
- `web/.env`（gitignore）: `VITE_FIREBASE_API_KEY` / `_AUTH_DOMAIN` / `_PROJECT_ID` / `_APP_ID`、ローカル用 `VITE_API_BASE=http://localhost:8787`。
- `web/.env.production`（gitignore）: 本番 `VITE_API_BASE=<Cloud Run URL>`。`vite build` 時に `.env` とマージされ優先される。
- `VITE_BOARD_TOKEN` はコード未参照のためバンドルに含まれない（web は Firebase ログイン専用、X-Board-Token フォールバック無し）。

## 再デプロイ手順

### API（Cloud Run）
リポジトリルートで（PowerShell 可、1行ずつ）:
```
gcloud run deploy handoff-api --source . --region asia-northeast1 --project handoff-dashboard --allow-unauthenticated --update-env-vars USE_FIRESTORE=1,GCLOUD_PROJECT=handoff-dashboard --set-secrets BOARD_TOKENS=handoff-board-tokens:latest
```
- `--source .` がルートの `Dockerfile` を Cloud Build でビルドする（pnpm monorepo を `tsx` 起動、`shared` は src 参照のまま）。
- env を変えたいときは `gcloud run services update handoff-api --region asia-northeast1 --update-env-vars KEY=VALUE`（**`--update-` はマージ**。`--set-env-vars` は全置換なので注意）。
- 値にカンマを含む場合（複数 origin 等）はカスタム区切り: `--update-env-vars "^;^CORS_ORIGIN=a,b;ALLOWED_EMAILS=x@y"`。

### Web（Firebase Hosting）
```
pnpm --filter @handoff/web build
firebase deploy --only hosting --project handoff-dashboard
```
- `firebase.json` の `hosting`（`public: web/dist`、SPA リライト）を使用。

## 三軸モデルのロールアウト（ロックステップ必須・ADR-0006）

owner/department/role の三軸モデルは enum を **3 箇所に複製**している（handoff-board `shared`、handoff-mcp `handoff-types.ts`、本番 Firestore のデータ）。**API・web・handoff-mcp を同時に切り替えること。** API だけ先にデプロイすると、旧 enum を載せた handoff-mcp からのタスク作成が即 422 で壊れる。

切り替え手順:

1. **トークン分離**: `handoff-board-tokens` Secret に AI 実行者ごとのトークンを入れた JSON を新バージョンとして登録する（例 `{"<cowork-token>":"cowork","<claude-code-token>":"claude-code"}`）。旧トークンは無効化する。
   ```
   # 新しい JSON を Secret の新バージョンに（PowerShell は echo 相当を避け、ファイル経由が安全）
   gcloud secrets versions add handoff-board-tokens --data-file=<tokens.json> --project handoff-dashboard
   ```
2. **API 再デプロイ**: 下記「再デプロイ手順」。`--set-secrets BOARD_TOKENS=handoff-board-tokens:latest` で最新版を参照する。
3. **web 再デプロイ**: 下記「Web」。三軸 UI（部署色チップ・ロールチップ・部署フィルタ）を含む。
4. **handoff-mcp 更新**: 別リポジトリ（`handoff-mcp`）を `npm run build` し直し、各クライアント設定（`.claude.json` 等）の `HANDOFF_BOARD_TOKEN` を実行者に対応する新トークンへ差し替える（Cowork 用設定＝cowork トークン、Claude Code 用設定＝claude-code トークン）。
5. **検証**: MCP 経由で department/role 付きタスクを作成し 201、本番カンバンでドット・部署色チップ・ロールチップ・部署フィルタが動くこと、activity の actor が実行者ごとに分かれることを確認する。

本番 Firestore（`board` / `archive`）が空のあいだに切り替えればデータ移行は不要。既存ドキュメントがある場合は `owner` の旧値（`ai-batch`/`ai-interactive`）と `agent` フィールドのバックフィル（→ `cowork`/`claude-code` と `department`/`role`）が必要になる。

## ローカル開発 vs 本番の差分（重要）

1. **Firestore 検知**（`api/src/server.ts`）: `FIRESTORE_EMULATOR_HOST || GOOGLE_APPLICATION_CREDENTIALS || USE_FIRESTORE || K_SERVICE` のいずれかで Firestore を使う。
   - ローカル: `.env` の `GOOGLE_APPLICATION_CREDENTIALS`（gitignore 外＝`AppData\Roaming\gcloud` 等）で接続。無ければ in-memory + `devSeed`。
   - Cloud Run: `K_SERVICE` が自動付与されるため Firestore に繋がる（保険として `USE_FIRESTORE=1` も設定済み）。
2. **資格情報**: `initializeApp({ credential: applicationDefault() })`。`applicationDefault()` が env キー / メタデータ / gcloud ADC のいずれからも解決する（`credential: undefined` を渡すと admin が起動失敗するため常にこれを使う）。
3. **起動コマンド**: 本番は `api` の `start:prod`（`tsx src/server.ts`、`../.env` 非依存）。dev は `start`（`--env-file=../.env`）。

## 前提・落とし穴（再現時に詰まりやすい点）

- **課金未リンクだと API 有効化で失敗**（`UREQ_PROJECT_BILLING_NOT_FOUND`）。Cloud Run/Build/Artifact Registry は課金必須。`gcloud billing projects link handoff-dashboard --billing-account=<ID>`。
- **Firebase Auth の Google プロバイダ**がコンソールで有効である必要あり（CLI 不可）。`*.web.app` / `*.firebaseapp.com` は既定で認可ドメイン。
- 人間ログインは、サインインした Google アカウントのメールが `ALLOWED_EMAILS` か、ドメインが `ALLOWED_EMAIL_DOMAINS` に一致する必要がある。
- `BOARD_TOKENS` は秘密。**コミットやイメージに焼き込まない**（`.dockerignore` で `.env` 除外済み、Secret Manager 経由で注入）。

## データ

- Firestore コレクション: `board`（処理中）/ `archive`（完了アーカイブ）。アーカイブは status を変えず board→archive へドキュメント移動（ADR-0002、`docs/issues/06-complete-and-archive.md`）。
- 削除（ゴミ箱）は board からハードデリート（archive に残さない）。
