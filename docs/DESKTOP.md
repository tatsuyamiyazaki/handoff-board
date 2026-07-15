# Handoff デスクトップアプリ

## 概要

Handoff デスクトップアプリは、クラウド上のタスクボードを表示し、選択したタスクをローカルの AI CLI で実行する Electron アプリです。サーバーから実行ジョブを配信する dispatcher は設けず、CLI が handoff-mcp 経由でタスクを取得・更新する [ADR-0005](adr/0005-remove-dispatcher-pull-via-mcp.md) の方針を維持します。

## 開発

このプロジェクトは `pnpm 11.13.0` を必要とし、ルート `package.json` の `packageManager` も `pnpm@11.13.0` に固定しています。Corepack などでこのバージョンを有効にしてから依存関係をインストールしてください。

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

Google OAuth のループバック認証には、Firebase Authentication と**同じ GCP プロジェクト**の「認証情報」から「OAuth クライアント ID（デスクトップ アプリ）」を作成します。Firebase Authentication のログインプロバイダでは Google を有効にしてください。別プロジェクトの OAuth クライアントを使うと、OAuth のコード交換まで成功しても Firebase の認証で拒否されます。

- `HANDOFF_GOOGLE_CLIENT_ID`（必須）
- `HANDOFF_GOOGLE_CLIENT_SECRET`（任意。Google の installed-app flow でクライアントに発行されている場合のみ）

値は起動シェルの環境変数、または `web/.env`、`web/.env.local`、`web/.env.production`、`web/.env.production.local` で指定できます。env ファイルはこの順に後の値を優先して読み込み、シェルに設定した値を最優先します。`package:desktop` のリリース事前検査と Electron ビルドは同じ resolver を使うため、検査した OAuth 値と esbuild が埋め込む値は一致します。

`HANDOFF_GOOGLE_CLIENT_SECRET` はデスクトップアプリでは秘匿できない任意値であり、`desktop/check-release-env.mjs` の必須変数リストには追加しません。

renderer の Firebase 認証と API 接続には `web/.env` の `VITE_FIREBASE_*` および `VITE_API_BASE` が必要です。必要なキーはルートの `.env.example` も参照してください。

本番 CSP の `connect-src` は、実行時に変更できる `apiBaseUrl` を許可するため HTTPS 接続先を限定していません。HTTP はローカル開発・エミュレーター用の `localhost`、`127.0.0.1`、`[::1]` のみに制限されるため、リモート API には HTTPS を使用してください。

Cloud Run の `handoff-api` では、`CORS_ORIGIN` に `app://bundle` を追加してください。環境変数の確認・更新方法は [DEPLOYMENT.md](DEPLOYMENT.md) の Cloud Run 運用手順に従います。

実行対象フォルダ、またはユーザースコープには handoff-mcp の接続設定が必要です。デスクトップアプリ自身は MCP サーバーの登録を行いません。

## アプリ設定

設定は通常 `%APPDATA%/Handoff/settings.json` に保存されます。設定キーと形式は [デスクトップアプリ仕様 §8](specs/2026-07-14-desktop-app-design.md#8-設定ファイル仕様) を参照してください。

## Windows インストーラー

```powershell
pnpm package:desktop
```

必要なリリース環境変数が不足している場合は開始前に失敗します。Web と Electron をビルドし、NSIS インストーラーを `desktop/release/` に生成します。

リリース前には、実機で次の両方を確認するスモークテストを必須（リリースブロッキング）とします。

1. システムブラウザで Google にログインし、ループバック URL で認可コードを受け取り、トークン交換まで成功する。
2. 取得した Google 資格情報を使う Firebase `signInWithCredential` が成功し、認証済み画面まで進む。

コード交換は成功するのに Firebase で `auth/invalid-credential` になる場合は、まずデスクトップ OAuth クライアントと Firebase Authentication が同じ GCP プロジェクトかを確認し、あわせて Firebase の Google プロバイダが有効かを確認してください。プロジェクト不一致が代表的な原因です。

## 現在の制約

- CLI 引数は設定画面でスペース区切りとして解釈されます。
- プロンプトテンプレートは単一行です。
- 実行ログはメモリ上だけに保持され、アプリを再起動すると消えます。
