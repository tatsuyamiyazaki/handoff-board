# handoff

**人間とAIの共同タスクボード** — 人間と AI エージェントが1枚のカンバンでタスクを受け渡し（handoff）しながら進めるための共同作業ボード。

- Web: https://handoff-dashboard.web.app
- API: Cloud Run（`asia-northeast1`） / データは Firestore

---

## これは何か

タスクごとに「いま誰が担当か（owner）」を **人間 / Cowork / Claude Code / Codex** で表し、AI 系のときは AI部署（department）と役割（role）を併せて持つ。タスクはレーン間を遷移し、完了後はアーカイブされる。人間は Web からサインインして自分のボードを操作し、AI/機械系はトークン認証で同じボードを読み書きする — この「人間と AI のあいだの受け渡し」を一望できるのが狙い。

## 主な機能

- **5レーンのカンバン**: `To Do`（AI待ち＋人間待ちを統合）/ `In Progress` / `In Review` / `Blocked` / `Done`
- **owner / AI部署 / ロールの三軸**（[ADR-0006](docs/adr/0006-owner-department-role-three-axes.md)、ADR-0004 を supersede）: owner=実行者（`human` / `cowork` / `claude-code` / `codex`）、AI 系はさらに department と role を持つ。カードは担当ドット＋部署色チップ＋ロールチップで表示
- **サーバ側の遷移ステートマシン**（[ADR-0002](docs/adr/0002-status-transitions-as-server-state-machine.md)）: 着手 / 引き継ぎ / 完了 / ブロック / 解除を不正遷移なく制御
- **レビューサイクル**（[ADR-0007](docs/adr/0007-in-review-state-and-review-cycle-limit.md)）: 進行中タスクは直接完了せずレビュー依頼（`in-review`）を経由。レビューで完了 or 差し戻しでき、差し戻し往復は上限つき（`REVIEW_CYCLE_LIMIT`、既定 5。人間の差し戻しでカウントはリセット）。タスクを実行した本人によるセルフレビューはサーバ側で排除（人間所有×人間 actor は例外）。レビュー中にブロックされたタスクだけは引き継ぎメモ無しで In Review に復帰できる
- **エージェント識別**（[ADR-0008](docs/adr/0008-agent-identity-role-token-and-session-id.md)）: 機械系トークンは `owner[:機能]` 形式の actor に対応づけ（例 `claude-code:reviewer`）、`X-Agent-Session` ヘッダでセッション ID を activity に記録
- **密な2段カード**: 優先度（P0–P3）を左端の色帯で表現、ホバーでアクション表示
- **サマリ＋フィルタ**: 人間アサイン / 進行中 / ブロック数の集計、オーナー / AI部署 / プロジェクト / マイルストーンで絞り込み
- **作成・編集ダイアログ**: project / milestone は既存値を datalist でサジェスト（新規入力も可）。三軸の整合性（AI 系のみ department/role、role は部署配下）を共有ロジックで強制
- **完了→アーカイブ**: `board` → `archive` コレクションへ移動（冪等）
- **二系統の認証**（[ADR-0001](docs/adr/0001-dual-auth-machine-token-and-human-firebase.md)）: 人間は Firebase（Google サインイン）＋メール allowlist（完全一致 or ドメイン一致）、機械系は `X-Board-Token`
- **ユーザー別ボード**（[ADR-0003](docs/adr/0003-per-user-board-scoping-by-created-by.md) → [ADR-0011](docs/adr/0011-human-board-includes-machine-created-tasks.md) で拡張）: 人間は「自分が作成したタスク＋機械系が作成したタスク」を読み込む。機械系は全タスクを見る

## 技術スタック

- **shared** (`@handoff/shared`): `Task` スキーマと enum、API エンベロープ、作成/編集/遷移のドメインロジック（レビューグラフ、往復上限、セルフレビュー排除を含む）の単一ソース（ビルド無し・src 直接参照）
- **api** (`@handoff/api`): Fastify + Firebase Admin SDK。リポジトリ層は `InMemoryTaskRepository`（dev/テスト）/ `FirestoreTaskRepository`（本番）
- **web** (`@handoff/web`): Vite + React SPA。状態は TanStack Query、認証は Firebase Auth
- **desktop** (`@handoff/desktop`): Electron デスクトップアプリ。`@handoff/web` のビルドを `app://` スキームで同梱し、`window.handoffDesktop` ブリッジ経由で CLI 実行ボタン・ログパネル・設定画面を追加表示する。認証は PKCE ループバック OAuth → Firebase。設計は [docs/specs/2026-07-14-desktop-app-design.md](docs/specs/2026-07-14-desktop-app-design.md)、手順は [docs/DESKTOP.md](docs/DESKTOP.md)

AI 実行者（Cowork / Claude Code / Codex）はローカルから handoff-mcp（MCPサーバー、別リポジトリ）経由でタスクを pull する。サーバー側 push バッチのディスパッチャーは廃止した（[ADR-0005](docs/adr/0005-remove-dispatcher-pull-via-mcp.md)）。デスクトップアプリからのステータス遷移も CLI → handoff-mcp 経由で行う。

ESM 統一、`tsconfig` は `moduleResolution: Bundler` + `verbatimModuleSyntax`。pnpm ワークスペース。

## ドメインモデル（要点）

| 概念 | 値 |
|---|---|
| status | `needs-ai` / `needs-human` / `in-progress` / `in-review` / `done` / `blocked` |
| owner（実行者） | `human` / `cowork` / `claude-code` / `codex` |
| department（AI部署、owner が AI 系のみ） | `engineering` / `contents` / `business` / `infrastructure` |
| role（ロール、department 配下） | 部署ごとの固定リスト（[ADR-0006](docs/adr/0006-owner-department-role-three-axes.md)） |
| priority | `P0`（即時）/ `P1`（本日中）/ `P2`（今週中）/ `P3`（いつでも） |

用語の正確な定義は [CONTEXT.md](CONTEXT.md)、設計判断は [docs/adr/](docs/adr/) を参照。

## API エンドポイント

| メソッド / パス | 役割 |
|---|---|
| `GET /api/board` | ボード取得（人間は ADR-0011 スコープ、機械系は全件） |
| `POST /api/board` | タスク作成（actor と認証種別を記録） |
| `PATCH /api/board/:id` | ステータス遷移（着手 / 引き継ぎ / レビュー依頼 / 差し戻し / ブロック / 解除） |
| `PATCH /api/board/:id/details` | タイトル・優先度・三軸・レビュー上限などの編集（人間のみ変更可の項目あり） |
| `POST /api/board/:id/complete` | 完了 → `archive` コレクションへ移動（冪等） |
| `DELETE /api/board/:id` | タスク削除 |

## セットアップと開発

```bash
pnpm install

pnpm dev:api                # API（Firestore 資格情報が無ければ in-memory + devSeed で起動）
pnpm dev:web                # Web（http://localhost:5173 など）
pnpm dev:desktop            # デスクトップ（Vite dev server + Electron、HMR あり・推奨）
pnpm dev:desktop:bundle     # デスクトップ（web を再ビルドして app:// 同梱版で起動）
pnpm package:desktop        # デスクトップのインストーラ作成
```

環境変数は `.env.example` を参照（`BOARD_TOKENS`、`ALLOWED_EMAILS` / `ALLOWED_EMAIL_DOMAINS`、`CORS_ORIGIN`、`REVIEW_CYCLE_LIMIT` など）。秘密はコミットしない。
Web の Firebase 設定は `web/.env`（`VITE_FIREBASE_*`、`VITE_API_BASE`）。

## テスト・型チェック

```bash
pnpm -r test                       # 全パッケージのユニット/統合テスト
pnpm --filter @handoff/api test    # 単一パッケージ
pnpm -r typecheck                  # 型チェック
pnpm --filter @handoff/web e2e     # Playwright E2E
```

ユニット/統合テストは Java/Firestore エミュレータ無しで動く（api は in-memory にフォールバック）。

## デプロイ

API は Cloud Run、Web は Firebase Hosting（GCP プロジェクト `handoff-dashboard`）。
構成図・環境変数・再デプロイ手順・落とし穴は **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** にまとめている。

## ドキュメント

- [CLAUDE.md](CLAUDE.md) — リポジトリの全体像と作業規約
- [CONTEXT.md](CONTEXT.md) — ドメイン用語集
- [docs/adr/](docs/adr/) — アーキテクチャ決定記録（ADR）
- [docs/prd.md](docs/prd.md) — プロダクト要件 / [docs/issues/](docs/issues/) — 実装スライス
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — デプロイ / 運用
- [docs/DESKTOP.md](docs/DESKTOP.md) — デスクトップアプリの開発・配布手順
