# 人間ボードのスコープを「自分の作成分＋機械系作成タスク」に拡張する

## Status

accepted — [ADR-0003](0003-per-user-board-scoping-by-created-by.md) を amend する（人間ボードの絞り込み規則の拡張）

## 決定

- `GET /api/board` の人間パス（Firebase Bearer）の絞り込みを「`created_by` が当人メールに一致」から「**`created_by` が当人メールに一致 ∨ 作成主体が機械系**」に拡張する。機械系パス（`X-Board-Token`）は従来どおり全件で不変。
- 「作成主体が機械系」の判定は `created_by` 文字列の形式推定（メールっぽいか等）にしない。`Task` に **`created_by_type: 'human' | 'machine'`** を追加し、`buildTask` が認証種別（[ADR-0001](0001-dual-auth-machine-token-and-human-firebase.md) の `type`）から刻む。
- `created_by_type` 欠落（既存データ）は **`'human'` として読む**（保守的既定: 見せない方向に倒す）。既存の機械系作成タスクを人間ボードに出す必要があれば別途バックフィルする。

## 文脈とトレードオフ

CEO オーケストレーション（[ADR-0009](0009-ceo-orchestrator-pull-based-sequential-scheduler.md)）の導入で、機械系クライアントがタスクを大量生成する運用が始まる。ADR-0003 の「created_by（メール）完全一致」のままでは、CEO が生成した子タスク——とりわけ `owner=human` に分離された**承認 Gate タスク**——が、どの人間のボードにも表示されない。これは「Gate の可視化はボードが担う」（[ADR-0010](0010-approval-gate-enforcement-at-infrastructure-layer.md)）と「人間の監視下の同期セッション」（ADR-0009）の両方の前提を崩す。

ADR-0003 の本来の目的は「未ログインで見せない」と「人間同士のタスクを混ぜない」であり、機械系が作ったタスクを人間から隠す積極的な理由はなかった。本 amend は後者の目的を保ったまま、機械系作成分を人間の視界に入れる。

可視性は統制の構成要素（Gate の可視化）であるため、**LLM の申告・規律に依存させない**ことを設計原則とした（「強制を申告値に依存させない」ADR-0010 と同型の判断）。スコープ規則というサーバー側の決定的ロジックに載せることで、CEO が何をどう作ろうと人間の視界から漏れない。

検討した代替案:

1. **CEO が親タスクの `created_by`（人間メール）を子タスクに引き継ぐ** — 却下。多人数運用でも個人ボードが綺麗に保たれる利点はあるが、Gate タスクの可視性が CEO の伝搬規律（LLM 出力）に依存する。伝搬し忘れたタスクは誰にも見えず、統制上いちばん見えなければならないものが最も見えにくい障害モードになる。機械系クライアントに `created_by` の指定を許す API 変更も必要になる。
2. **`owner=human` のタスクのみ全人間に表示する** — 却下。Gate タスクの可視化だけは直るが、CEO が生成した AI 子タスクは不可視のままで、「人間の監視下」の実質がボードに載らない（CEO セッションのターミナル出力頼みになる）。
3. **created_by 文字列の形式（`:` を含む／メール形式でない）で機械系を推定する** — 却下。actor 形式（[ADR-0008](0008-agent-identity-role-token-and-session-id.md)）の変更に暗黙結合し、メール形式のトークン actor を設定した瞬間に壊れる。1フィールド追加で決定的に判定できるものを推定にする理由がない。

受容するトレードオフ: 複数人運用になった場合、機械系作成タスクは**全員のボードに見える**。現在の運用（`ALLOWED_EMAILS` は実質1人）では実害がなく、多人数化の際に「機械系タスクの帰属」が必要になったら代替案 1 の伝搬規約を**この規則の上に**追加すればよい（本決定は縮小方向の変更を要しない）。

## 帰結

- `shared/src/task.ts`: `Task` に `created_by_type: 'human' | 'machine'` を追加し、`buildTask` が必須の `actorType` から作成時に刻む。Firestore の既存データで欠落している場合は保守的に `human` として読む。
- `api/src/repository/task-repository.ts`: `findAll` のフィルタを「`createdBy` 完全一致」から「`createdBy` 一致 ∨ `created_by_type === 'machine'`」の OR 条件に拡張。Firestore 実装は `Filter.or`（Admin SDK）または2クエリのマージ。in-memory 実装は述語の変更のみ。
- `api/src/dev-seed.ts`: シードタスクに `created_by_type: 'machine'` を設定する。副作用として、ローカル開発で人間サインイン時にもシードが見えるようになる（従来は `created_by: null` のため不可視だった）。
- web / handoff-mcp: 変更不要（機械系パスは全件のまま）。
- ADR-0009 の「人間の監視下」・ADR-0010 の「Gate の可視化はボードが担う」は、本 ADR によって初めて成立する。**導入順序として、CEO 運用開始前に本 ADR の実装が必要**（ADR-0007 と並ぶ前提条件）。
- ADR-0003 の Status に、本 ADR による amend の注記を追加した。
