# ディスパッチャーを廃止し、AIへのタスク受け渡しをMCP経由のpull型にする

## Status

accepted

## 決定

- `dispatcher/` ワークスペース（issue #07 で実装した定時バッチ）を**廃止・削除**する。
- 対象選定（`selectNextTask`: needs-ai かつ ai-batch を priority 順に1件処理）だけでなく、**stale 掃引（72時間無変更タスクの自動 blocked 化）も機能ごと廃止**する。
- AIへのタスク受け渡しは、AI実行者（Cowork / Claude Code）が**ローカルから handoff-mcp（MCPサーバー、別リポジトリ）経由で REST API を叩いて pull する**モデルに一本化する。サーバー側からの push 経路は持たない。

## 文脈とトレードオフ

ディスパッチャーは「needs-ai のタスクを選んで AI に投げる」push 型の中核として設計されたが、肝心の AI 呼び出し部分（`processTask`）は no-op プレースホルダーのまま一度も実装されなかった。一方、handoff-mcp（list/get/create/edit/transition ツール）はすでに本番 API に対して稼働しており、Claude Code / Cowork がローカルセッションからタスクを読み書きする経路は実証済みである。AI実行者を Cowork と Claude Code の2つ（いずれもローカル・対話起点）に絞る運用方針により、「無人バッチが定時に拾う」というユースケース自体が消えた。

検討した代替案:

1. **ディスパッチャーを残し processTask を実装する（push 型を完成させる）** — 却下。ローカル対話型の実行者しかいない世界では、push する先のランタイムが存在しない。
2. **stale 掃引だけ API 側（Cloud Scheduler → Cloud Run）に移して残す** — 却下。単一ユーザー・少量タスクの現運用ではカンバンを開けば放置タスクは目視できる。勝手に blocked になる驚きの方がデメリットで、必要になれば後から追加できる（YAGNI）。
3. **掃引を MCP 利用時の指示ベース運用にする** — 却下。保証のない運用ルールを仕様のように扱うことになる。

## 帰結

- `dispatcher/` ワークスペースとそのテストを削除し、ルート設定・CLAUDE.md・README・docs の参照を更新する。docs/issues/07 は「廃止済み」注記を付ける。
- owner の `ai-batch` / `ai-interactive` 区別は唯一の消費者（ディスパッチャーの選定条件）を失い存在意義がなくなる。owner 語彙の再設計は [ADR-0006](0006-owner-department-role-three-axes.md) で決める。
- 72時間 stale の自動 blocked 化は行われなくなる。放置タスクの検知は人間のカンバン目視に委ねる。
- 機械系クライアントの認証は引き続き `BOARD_TOKENS`（X-Board-Token）。トークンは AI 実行者ごとに分離する（ADR-0006 参照）。
- 関連: [ADR-0002](0002-status-transitions-as-server-state-machine.md)（遷移は owner 非依存のサーバーステートマシンのまま不変）。
