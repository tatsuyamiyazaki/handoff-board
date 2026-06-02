# handoff

**人間とAIの共同タスクボード** — 人間と AI エージェントが1枚のカンバンでタスクを受け渡し（handoff）しながら進めるための共同作業ボード。

- Web: https://handoff-dashboard.web.app
- API: Cloud Run（`asia-northeast1`） / データは Firestore

---

## これは何か

タスクごとに「いま誰が担当か（owner）」を **人間 / AI（バッチ）/ AI（対話）** で表し、AI 系のときは具体的な担当 AI（agent）を併せて持つ。タスクはレーン間を遷移し、完了後はアーカイブされる。人間は Web からサインインして自分のボードを操作し、AI/機械系はトークン認証で同じボードを読み書きする — この「人間と AI のあいだの受け渡し」を一望できるのが狙い。

## 主な機能

- **4レーンのカンバン**: `To Do`（AI待ち＋人間待ちを統合）/ `In Progress` / `Blocked` / `Done`
- **owner と agent の二軸**（[ADR-0004](docs/adr/0004-owner-and-agent-as-two-axes.md)）: owner=ルーティング軸、agent=具体 AI（`cowork` / `codex` / `gemini` / `claude-code`）。カードは担当ドットで表示
- **サーバ側の遷移ステートマシン**（[ADR-0002](docs/adr/0002-status-transitions-as-server-state-machine.md)）: 着手 / 引き継ぎ / 完了 / ブロック / 解除を不正遷移なく制御
- **密な2段カード**: 優先度（P0–P3）を左端の色帯で表現、ホバーでアクション表示
- **サマリ＋フィルタ**: 人間アサイン / 進行中 / ブロック数の集計、プロジェクト / オーナー / マイルストーンで絞り込み
- **作成・編集ダイアログ**: project / milestone は既存値を datalist でサジェスト（新規入力も可）
- **完了→アーカイブ**: `board` → `archive` コレクションへ移動（冪等）
- **二系統の認証**（[ADR-0001](docs/adr/0001-dual-auth-machine-token-and-human-firebase.md)）: 人間は Firebase（Google サインイン）＋メール allowlist、機械系は `X-Board-Token`
- **ユーザー別ボード**（[ADR-0003](docs/adr/0003-per-user-board-scoping-by-created-by.md)）: 人間は自分が作成したタスクのみ読み込む

## 技術スタック

- **shared** (`@handoff/shared`): `Task` スキーマと enum、API エンベロープ、作成/編集のドメインロジックの単一ソース（ビルド無し・src 直接参照）
- **api** (`@handoff/api`): Fastify + Firebase Admin SDK。リポジトリ層は `InMemoryTaskRepository`（dev/テスト）/ `FirestoreTaskRepository`（本番）
- **web** (`@handoff/web`): Vite + React SPA。状態は TanStack Query、認証は Firebase Auth
- **dispatcher** (`@handoff/dispatcher`): AI 系タスクを拾うローカルバッチ（プレースホルダ、未実装）

ESM 統一、`tsconfig` は `moduleResolution: Bundler` + `verbatimModuleSyntax`。pnpm ワークスペース。

## ドメインモデル（要点）

| 概念 | 値 |
|---|---|
| status | `needs-ai` / `needs-human` / `in-progress` / `done` / `blocked` |
| owner（ルーティング軸） | `human` / `ai-batch` / `ai-interactive` |
| agent（具体 AI、owner が AI 系のみ） | `cowork` / `codex` / `gemini` / `claude-code` |
| priority | `P0`（即時）/ `P1`（本日中）/ `P2`（今週中）/ `P3`（いつでも） |

用語の正確な定義は [CONTEXT.md](CONTEXT.md)、設計判断は [docs/adr/](docs/adr/) を参照。

## セットアップと開発

```bash
pnpm install

pnpm dev:api    # API（Firestore 資格情報が無ければ in-memory + devSeed で起動）
pnpm dev:web    # Web（http://localhost:5173 など）
```

環境変数は `.env.example` を参照（`BOARD_TOKENS`、`ALLOWED_EMAILS` など）。秘密はコミットしない。
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
