# Handoff デスクトップアプリ

## 概要

Handoff デスクトップアプリは、クラウド上のタスクボードを表示し、選択したタスクをローカルの AI CLI で実行する Electron アプリです。サーバーから実行ジョブを配信する dispatcher は設けず、CLI が handoff-mcp 経由でタスクを取得・更新する [ADR-0005](adr/0005-remove-dispatcher-pull-via-mcp.md) の方針を維持します。

## 開発

依存関係をインストールした後、Web の開発サーバーと Electron を別々のターミナルで起動します。

```powershell
pnpm dev:web

$env:HANDOFF_DEV_SERVER_URL="http://localhost:5173"
pnpm dev:desktop
```

静的ビルドを Electron から読む場合は、次のコマンドを実行します。

```powershell
pnpm --filter @handoff/web build
pnpm dev:desktop
```

## 環境変数と外部設定

Google OAuth のループバック認証には、GCP コンソールの「認証情報」から「OAuth クライアント ID（デスクトップ アプリ）」を作成し、次を設定します。

- `HANDOFF_GOOGLE_CLIENT_ID`（必須）
- `HANDOFF_GOOGLE_CLIENT_SECRET`（クライアントで発行されている場合）

renderer の Firebase 認証と API 接続には `web/.env` の `VITE_FIREBASE_*` および `VITE_API_BASE` が必要です。必要なキーはルートの `.env.example` も参照してください。

Cloud Run の `handoff-api` では、`CORS_ORIGIN` に `app://bundle` を追加してください。環境変数の確認・更新方法は [DEPLOYMENT.md](DEPLOYMENT.md) の Cloud Run 運用手順に従います。

実行対象フォルダ、またはユーザースコープには handoff-mcp の接続設定が必要です。デスクトップアプリ自身は MCP サーバーの登録を行いません。

## アプリ設定

設定は通常 `%APPDATA%/Handoff/settings.json` に保存されます。設定キーと形式は [デスクトップアプリ仕様 §8](specs/2026-07-14-desktop-app-design.md#8-設定ファイル仕様) を参照してください。

## Windows インストーラー

```powershell
pnpm package:desktop
```

必要なリリース環境変数が不足している場合は開始前に失敗します。Web と Electron をビルドし、NSIS インストーラーを `desktop/release/` に生成します。

## 現在の制約

- CLI 引数は設定画面でスペース区切りとして解釈されます。
- プロンプトテンプレートは単一行です。
- 実行ログはメモリ上だけに保持され、アプリを再起動すると消えます。
