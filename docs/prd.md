# PRD: HANDOFF カンバンアプリ

> **注記（2026-06 更新）**: 本 PRD は計画時点の記録である。その後、ディスパッチャー（サーバー側 push バッチ）は廃止され、AI 実行者は MCP 経由でタスクを pull する方式に変わった（[ADR-0005](./adr/0005-remove-dispatcher-pull-via-mcp.md)）。担当モデルも owner（human / cowork / claude-code）/ AI部署 / ロールの三軸に再設計された（[ADR-0006](./adr/0006-owner-department-role-three-axes.md)）。以下の本文に残る「ディスパッチャー」「ai-batch / ai-interactive」「dispatcher-lock」「72時間ルール」の記述は歴史的経緯であり、現行仕様ではない。
>
> 対象: `docs/specs/requirement.md` の HANDOFF バックエンド仕様に、人間が操作するカンバンWeb UIを足したフルスタック実装。
> 関連: [ADR-0001 デュアル認証](./adr/0001-dual-auth-machine-token-and-human-firebase.md) / [ADR-0002 status遷移ステートマシン](./adr/0002-status-transitions-as-server-state-machine.md) / 用語は [CONTEXT.md](../CONTEXT.md) に従う。

## Problem Statement

運用者は、人間とAIエージェント（バッチ実行の `ai-batch`、対話的な `ai-interactive`）が同じタスク群を分担しながら進めたい。しかし現状、両者が安全に同じタスクリストを参照・更新するための共有された場所がない。

- 人間が「今どのタスクがAI待ち / 人間待ち / 進行中 / 完了 / ブロック中か」を一目で把握できない。
- 誰がいつ何をしたか（引き継ぎの履歴）が追えない。
- AIに渡すときの引き継ぎ指示（handoff_note）や、ブロック理由を構造化して残す場所がない。
- ディスパッチャーが自動で拾うべきタスクと、人間が触るべきタスクの境界が曖昧。

仕様 `requirement.md` は REST API + Firestore + ディスパッチャーというバックエンドを定義するが、人間が日常的に触れる入口（UI）がない。

## Solution

`board`（処理中）と `archive`（完了）の2コレクションを持つ Firestore を唯一のデータストアとし、その上に2つの利用面を載せる。

1. **カンバンWeb UI** — `status` を5レーン（needs-ai / needs-human / in-progress / done / blocked）に並べ、タスクをカードで表示。人間はGoogleサインインしてカードの作成・引き継ぎ・ブロック・完了（アーカイブ）を行う。10〜15秒ポーリングで他者（人間/AI/ディスパッチャー）の変更が反映される。
2. **REST API** — UI・AIエージェント・ディスパッチャーすべての唯一の窓口。`status` 遷移はサーバー側のステートマシンで強制し、楽観的並行制御で競合を検出する。
3. **ディスパッチャー** — 運用者のローカル機で定時実行され、API経由で `needs-ai` かつ `ai-batch` のタスクを1件処理し、結果に応じて遷移させる。

人間とAIで同一の遷移ルール・同一のAPIが効くため、「誰が触っても壊れない共同ボード」が成立する。

## User Stories

1. 運用者として、5レーンのカンバンで全タスクの `status` を一目で把握したい。次に何をすべきか即断できるように。
2. 運用者として、タスクをカードとして見たい。1カード=1タスクで、タイトル・オーナー・優先度・action_typeが分かるように。
3. 運用者として、Googleアカウントでサインインしたい。許可された人だけがボードを操作できるように。
4. 許可リスト外のユーザーとして、サインインしても操作を拒否されたい。ボードが部外者から守られるように。
5. 運用者として、新規タスクを作成したい。タイトル・オーナー・引き継ぎ指示を渡して作業を起票できるように。
6. 運用者として、新規タスクの初期 `status` を `needs-ai` か `needs-human` のどちらかに限定したい。いきなり進行中・完了で起票する事故を防ぐように。
7. 運用者として、作成時に優先度を省略したら `P2`、action_typeを省略したら `other` になってほしい。毎回全項目を埋めずに済むように。
8. 運用者として、タスクを `in-progress` に動かしたい。自分（または誰か）が着手中だと示せるように。
9. 運用者として、進行中タスクをAIに引き継ぎたい（in-progress → needs-ai）。引き継ぎ指示を必須で添えて、AIが何をすべきか分かるように。
10. 運用者として、進行中タスクを人間に引き継ぎたい（in-progress → needs-human）。引き継ぎ指示を必須で添えて、次の担当が迷わないように。
11. 運用者として、タスクを `blocked` にしたい。ブロック理由を必須で記録して、なぜ止まっているか後から分かるように。
12. 運用者として、ブロックを解除したい（blocked → needs-ai / needs-human）。再開時にブロック理由が自動でクリアされ、引き継ぎ指示を添えられるように。
13. 運用者として、進行中タスクを完了にしたい（in-progress → done）。`in-progress` を必ず経由する正しい流れで終われるように。
14. 運用者として、完了タスクを明示的なボタンでアーカイブしたい。`board` から `archive` へ移して処理中ボードを綺麗に保てるように。
15. 運用者として、`done` でないタスクはアーカイブできないようにしたい。未完了の取りこぼしを防ぐように。
16. 運用者として、アーカイブ操作が冪等であってほしい。二重クリックや再送で壊れないように。
17. 運用者として、不正な遷移（例: needs-ai → done のショートカット、done の reopen）はAPIに拒否されたい。ボードの状態が常に正しい流れに保たれるように。
18. 運用者として、自分が見ていた版が古いまま上書きされるのを防ぎたい。誰かが先に更新していたら競合として知らされ、再取得できるように。
19. 運用者として、各タスクの活動履歴（いつ・誰が・何をした）を見たい。引き継ぎの経緯を追えるように。
20. 運用者として、タスクに自由なタグを付けたい。分類や検索の足がかりにできるように。
21. 運用者として、`dispatcher-lock` タグを付けたタスクをディスパッチャーに拾わせたくない。手動で抱えたいタスクを自動処理から外せるように。
22. 運用者として、カードをドラッグ&ドロップでレーン間移動したい。素早く状態を変えられ、サーバー拒否時には元に戻ってほしいように（楽観的更新+ロールバック）。
23. AIエージェント（機械系）として、`X-Board-Token` ヘッダーでAPIを認証したい。人間ログインなしにボードを読み書きできるように。
24. ディスパッチャーとして、毎朝定時にボードを取得し、`needs-ai` かつ `ai-batch` のタスクのみを対象にしたい。自分が処理すべき範囲だけを拾えるように。
25. ディスパッチャーとして、`dispatcher-lock` タグの付いたタスクを除外したい。人間が手元で抱えるタスクに手を出さないように。
26. ディスパッチャーとして、対象を優先度順に並べ先頭1件だけを処理したい。1回の実行で1タスクに集中できるように。
27. ディスパッチャーとして、処理に失敗したらそのタスクを `blocked`（理由付き）にしたい。失敗が握りつぶされず可視化されるように。
28. ディスパッチャーとして、72時間 `status` が変わっていないタスクを `blocked` にしたい。塩漬けタスクを自動で表面化できるように。
29. 運用者として、ボードを定期ポーリングで自動更新したい。手動リロードなしに最新状態を見られるように。
30. 運用者として、各レーンの先頭に件数が出てほしい。ボードの負荷状況を素早く掴めるように。

## Implementation Decisions

### スコープ・全体構成
- 仕様のバックエンド（REST API + Firestore + ディスパッチャー）に**カンバンWeb UIを追加したフルスタック**として実装する。
- pnpm モノレポ。パッケージ: `shared`（型）/ `api`（Fastify + Firebase Admin SDK、Cloud Run）/ `web`（Vite + React SPA、Firebase Hosting）/ `dispatcher`（ローカル実行バッチ）。全て TypeScript。
- ローカル開発は Firestore + Auth エミュレータを使用。

### 認証（ADR-0001）
- API は2系統を受け付ける: 機械系は `X-Board-Token`（エージェント種別ごとに別トークン）、人間は Firebase ID トークンを `Authorization: Bearer <idToken>` で送る。
- ブラウザは Firebase で Googleサインイン後、ID トークンで**APIを直接**叩く。BFF層は置かず Web は静的SPA。
- API ミドルウェアは「`X-Board-Token` あり → 機械系パス」「`Authorization: Bearer` あり → Admin SDKでID検証 → 許可リストのメールのみ通す（人間パス）」「どちらも無効 → 401/403」と分岐する。
- `activity.actor` は人間ログイン時は当人（メール等）、機械系はトークン種別から特定する。

### データモデル（仕様§4準拠）
- Firestore native mode。`board` / `archive` の2コレクション。1タスク=1ドキュメント、自動ID。`activity` はドキュメント内のインライン配列。
- タスク項目: `id` / `title` / `status`(needs-ai|needs-human|in-progress|done|blocked) / `owner`(human|ai-batch|ai-interactive) / `priority`(P0|P1|P2|P3) / `action_type`(content|research|review|publish|setup|other) / `handoff_note` / `blocked_reason`(blocked時以外はnull) / `tags`(string[]) / `created_at` / `updated_at` / `activity`({timestamp, actor, action}[])。日付は ISO 8601（例 `2026-06-01T07:30:00Z`）。
- Firestore Security Rules は deny-all。クライアントは直接 Firestore に触れず、Cloud Run のサービスアカウント（ADC / Admin SDK）経由でのみアクセスする。クライアントはリアルタイムリスナーを使えないため、UIはポーリングで更新する。

### 作成コントラクト
- 作成時必須: `title` / `owner` / `handoff_note`。初期 `status` は `needs-ai` か `needs-human` のみ許可。
- 既定値: `priority` 省略時 `P2`、`action_type` 省略時 `other`、`tags` 省略時 `[]`。
- `dispatcher-lock` は予約タグ（自由タグだが、ディスパッチャーがこのタグを持つタスクを除外する）。

### status遷移ステートマシン（ADR-0002）
- `PATCH /api/board/{id}` の `status` 変更はサーバー側の明示的な遷移グラフを唯一の真実として検証する。グラフ外の変更は **422 Unprocessable Entity**。
- 許可する遷移:

  ```text
  needs-ai      → in-progress
  needs-human   → in-progress
  in-progress   → needs-ai | needs-human | done
  (needs-ai | needs-human | in-progress) → blocked
  blocked       → needs-ai | needs-human
  done          → (status変更不可。/complete で archive へ)
  ```

- `in-progress` は必須の中間状態（`needs-ai → done` 等のショートカット禁止）。`done` は終端（reopen不可）。
- **actor制約はかけない**。合法な辺なら認証済みの誰でも実行可。`owner` は遷移で自動変更しない。
- 引き継ぎ遷移（`in-progress → needs-ai/needs-human`、`blocked → needs-*`）では `handoff_note` 必須。`→ blocked` は `blocked_reason` 必須、`blocked` 離脱時は `blocked_reason` を null にリセット。
- **楽観的並行制御**: クライアントは last-seen `updated_at` を送り、トランザクション内で照合。不一致は **409 Conflict**（不正遷移422と競合409を分離）。

### API コントラクト
- `GET /api/board` — 処理中タスク一覧。
- `POST /api/board` — 作成（上記コントラクト）。
- `PATCH /api/board/{id}` — 部分更新。`status` 変更時は遷移検証 + 楽観ロック。
- `POST /api/board/{id}/complete` — `status=done` を前提条件に `board` → `archive` 移動。前提を満たさなければ拒否、冪等。
- レスポンスは一貫した envelope（success/data/error）。

### モジュール構成（deepモジュールを分離）
- **transition-engine**（api / deep・純関数）— 現タスク + 変更要求 → 合法 or 構造化エラー(422)。遷移グラフ・`handoff_note`/`blocked_reason` 必須ルールを内包。I/Oなし。
- **task-repository**（api / deep）— Firestore アクセスを `findAll / get / create / update / complete` の背後に隠蔽。`update` はトランザクション内で `updated_at` 照合（→409）、`complete` は board→archive 移動。差し替え可能なインターフェース。
- **auth-middleware**（api / deep）— リクエスト → `{actor, type}` or 401/403。機械系/人間の分岐と許可リストを内包。
- **activity-log**（api / 小ユーティリティ）— `{timestamp, actor, action}` を活動配列に追記。
- **api routes**（api / shallow）— Fastify 配線。engine + repository に委譲する薄い層。
- **dispatcher-core**（dispatcher / deep・純ロジック）— ボードスナップショット → 次の1件選定（`needs-ai`+`ai-batch` 抽出 → `dispatcher-lock` 除外 → priority ソート → 先頭1件）+ 72h無変更→blocked 掃引。`processTask` は差し替え可能なフック。
- **dispatcher-runner**（dispatcher / shallow）— REST クライアント + cron/launchd 配線。
- **api-client**（web）— fetch ラッパ。idToken 注入、409/422 ハンドリング。
- **useBoard / useTaskMutations**（web）— TanStack Query ポーリング（10〜15秒）+ 楽観的更新/ロールバック。
- **Kanban UI**（web）— Board / Lane / Card / 作成・引き継ぎ・ブロック・完了の各ダイアログ。
- **shared/types** — タスクスキーマ・status enum・遷移型の単一ソース。

### 設定（環境変数中心）
- `BOARD_TOKENS`（token → actor のJSONマップ）、`ALLOWED_EMAILS`（人間許可リスト）を環境変数 / Secret Manager で管理。`.env.example` を用意。シークレットはハードコードしない。

### UIデザイン方向
- Swiss / International 寄り + status を意味づける semantic color。テンプレ然としないレーン・カード設計。

## Testing Decisions

### 良いテストの定義
- **外部から観測可能なふるまい**だけを検証し、実装の内部構造には依存しない。入力（リクエスト/状態）→出力（結果/エラーコード/遷移後状態）の対応をテストする。
- AAA（Arrange-Act-Assert）構造。ふるまいを説明する記述的なテスト名。
- TDD（RED → GREEN → REFACTOR）。カバレッジ最低80%。

### テスト対象モジュール（合意済み4つ）
- **transition-engine** — 単体テスト（純関数・最重要）。全許可遷移が通ること、全禁止遷移が422になること、引き継ぎ遷移での `handoff_note` 必須、`→blocked` での `blocked_reason` 必須と離脱時のnullリセット、`done` 終端・`in-progress` 必須経由を網羅。
- **task-repository** — 統合テスト（Firestore エミュレータ or in-memory実装）。`create` の既定値適用、`update` の `updated_at` 照合による **409**、`complete` の board→archive 移動・`done` 前提・冪等性を検証。
- **auth-middleware** — 単体/統合テスト。`X-Board-Token` 有効/無効、Firebase Bearer の検証成功、許可リスト外メールの **403**、両ヘッダー欠落時の **401**、`actor` 解決を検証。
- **dispatcher-core** — 単体テスト（純ロジック）。`needs-ai`+`ai-batch` 抽出、`dispatcher-lock` 除外、priority ソートの先頭1件選定、72h無変更→blocked 掃引、対象0件時の挙動を検証。

### テスト種別と道具
- **単体**: Vitest（transition-engine / dispatcher-core / auth-middleware のロジック）。
- **統合**: Fastify `inject` + Firestore/Auth エミュレータ（API エンドポイント、task-repository、認証分岐）。
- **E2E**: Playwright で重要4フロー（作成 / 引き継ぎ / ブロック・解除 / 完了→アーカイブ）+ 375/768/1440 の最小限の視覚回帰。

### prior art
- greenfield のため既存テストは無い。本PRDのテスト群が以後のテストのひな型（prior art）になる。

## Out of Scope

- タスクの**削除**（`archive` への移動はあるが物理削除・ゴミ箱機能は持たない）。
- AIエージェント本体の実装（`dispatcher-core` の `processTask` はフックとして差し込み可能にするのみ）。
- リアルタイム購読（Firestore deny-all のためクライアント直リスナーは不可。ポーリングで代替）。
- 複数ボード / マルチテナント（単一の `board`・`archive`）。
- 通知（メール/Slack等）、検索インデックス、添付ファイル。
- アーカイブ済みタスクの一覧UI（最小実装ではアーカイブは「移動先」としてのみ扱う。閲覧UIは将来）。
- 仕様§8の認証拡張のうち、Google以外のIDプロバイダ。

## Further Notes

- 用語は [CONTEXT.md](../CONTEXT.md) に厳密に従う（ボード=Firestoreコレクション、カンバン=UI、レーン=列、タスク=作業項目、ディスパッチャー=ローカルバッチ、オーナー≠actor）。
- ディスパッチャーは Firestore へ直接アクセスせず**必ずREST API経由**。72hルールもAPIから取得したボードに対するクライアント側フィルタで判定する。
- 本PRDは GitHub Issue 化せず `docs/prd.md` として管理する（tracker設定が未整備のため）。Issue 分解が必要になったら `setup-matt-pocock-skills` で tracker/ラベル設定を入れてから `/to-issues` を実行する。
- 実装は規模が大きいため、垂直スライス単位（例: 「作成フロー一気通貫」「引き継ぎ遷移」「アーカイブ」「ディスパッチャー選定」）で段階的に進めるのが望ましい。
