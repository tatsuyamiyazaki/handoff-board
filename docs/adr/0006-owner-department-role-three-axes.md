# 担当を owner（実行者）/ AI部署（department）/ ロール（role）の三軸で表現する

## Status

accepted — [ADR-0004](0004-owner-and-agent-as-two-axes.md) を supersede する

## 決定

タスクの「誰がどうやるか」を三層で表現する。

- **owner（実行者）**: `human` / `cowork` / `claude-code` の固定 enum。旧 `ai-batch` / `ai-interactive` は廃止。具体AI（旧 `agent` の値）を owner に昇格させる。AI系 owner のタスクは、そのAIがローカルから MCP 経由で pull して処理する。
- **department（AI部署）**: `engineering` / `contents` / `business` / `infrastructure` の固定 enum、nullable。owner が AI 系のときのみ持てる組織軸。**タスク上に独立フィールドとして保存**する（role からの導出にしない）。「部署だけ決まりロール未定」の状態を許す。
- **role（ロール）**: department 配下の役割ラベル、固定 enum、nullable。旧 `agent` フィールドの後継だが意味が異なる（具体AIではなく役割）ため、フィールド名も `role` に改名する。部署ごとの値:
  - engineering: `tech-lead` `nightly-qa` `task-dispatcher` `eng-director` `debug` `code-review` `architecture` `system-design` `testing-strategy` `tech-debt` `documentation` `deploy-checklist` `incident-response` `standup`
  - contents: `content-director` `brand-voice` `uradorino` `root-cause`（原稿の深掘りチェック用途） `anti-ai-slop`
  - business: `partnership-manager` `business-strategy` `meeting-director` `legal-review`
  - infrastructure: `local-support-agent` `daily-task-dispatch` `morning-standup` `weekly-knowledge-sync`

不変条件（サーバーが 422 で**厳格拒否**、黙って自動修正しない）:

- `owner=human` ⇒ `department=null` かつ `role=null`
- `role` 非 null ⇒ `department` 非 null かつ role はその部署のリストに属する

UI 側は逆にカスケードで自動クリアする（owner を human に変えたら部署・ロール欄を消去、department を変えたら role をリセット）。サーバーに不整合値は届かない設計とし、MCP 経由の AI クライアントが不整合を送った場合は 422 を受けて自分で直す。

department / role は表示・フィルタ・AI が pull 時に読む指示のためのメタデータであり、サーバー側 routing・遷移ルールには関与しない（初期 status ルール・遷移ステートマシンは owner からも独立、従来どおり）。

## 文脈とトレードオフ

ADR-0004 は「owner を具体AIに一本化する案」を、ディスパッチャーと遷移エンジンが owner（ai-batch）を routing キーにしていることを理由に却下した。[ADR-0005](0005-remove-dispatcher-pull-via-mcp.md) でディスパッチャーが廃止され、batch / interactive の区別は唯一の消費者を失ったため、却下理由が前提ごと消滅した。AI実行者を Cowork / Claude Code の2つに絞る運用では、「誰がやるか＝どのAIか」を owner が直接持つ方がドメインとして素直になる。

検討した代替案:

1. **department を保存せず role から導出する**（現リストは部署間で重複がないため技術的には可能）— 却下。「Engineering の何か」という粗い割り当て（role 未定）を表現できず、将来ロールが部署をまたいだ時点で破綻する。
2. **旧 `agent` フィールド名を流用して意味だけ差し替える** — 却下。「agent＝具体AI識別子」という旧定義との衝突が将来の読み手（人間・AI双方）を確実に混乱させる。データ移行が不要な今（本番 Firestore は board / archive とも空）が改名の最安タイミング。
3. **不整合入力をサーバーが自動修正する** — 却下。サイレントなデータ変化は fail-fast 原則に反し、MCP クライアントのデバッグも困難にする。

## 帰結

- `shared/src/task.ts` の `OWNERS` を差し替え、`AGENTS`/`agent` を `DEPARTMENTS`/`department` と `ROLES`/`role`（部署→ロールのマップ）に置き換える。`normalizeAgent` は department/role 対応の検証に拡張。本番データは空のためマイグレーション不要。
- カードの担当ドットは owner（`HUMAN` / `COWORK` / `CLAUDE-CODE`）を表示。department は**部署ごとの色分けチップ**、role はロールチップとして、設定されている限り**両方常時表示**する。
- BoardControls のフィルタに department を追加（owner / department / project / milestone の4軸）。role フィルタは見送り（必要になったら追加）。
- `BOARD_TOKENS` の機械トークンは AI 実行者ごとに分離する（例: `{"cowork-token":"cowork","claude-code-token":"claude-code"}`）。activity の `actor` / `created_by` にどちらのAIの操作かが残る。
- **handoff-mcp（別リポジトリ）は enum を自前複製しているため、本変更とロックステップで更新が必須**。先に API だけデプロイすると MCP のタスク作成が 422 で壊れる。
- ロール追加・部署追加は enum とUI色対応を1箇所ずつ増やす運用（ADR-0004 の方針を踏襲）。
- CONTEXT.md の **オーナー** / **AI部署** / **ロール** の定義はこの三軸を反映済み。
