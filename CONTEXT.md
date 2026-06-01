# HANDOFF

人間とAIエージェントが同じタスクリストを参照・更新する共同タスクボード。バックエンド（REST API + Firestore + ディスパッチャー）と、その上に載るカンバンWeb UIで構成される。

## Language

**ボード (board)**:
処理中タスクを保持するFirestoreコレクション、およびそれを表示する論理単位。完了タスクの `archive` と対になる概念。
_Avoid_: ボード列の意味で使わない（列は「レーン」と呼ぶ）

**カンバン (Kanban) / カンバンボード**:
`status` を列（レーン）として並べ、タスクをカードとして表示するWeb UIの呼称。
_Avoid_: 単に「ボード」と呼ぶ（Firestoreの `board` コレクションと紛れる）

**レーン (lane)**:
カンバンUIの縦の列。`status` の値（needs-ai / needs-human / in-progress / done / blocked）に1対1で対応する。
_Avoid_: カラム、ボード

**タスク (task)**:
1件の作業項目。Firestoreでは1ドキュメント、UIでは1カード。`board` か `archive` のどちらに属するかで「処理中／完了」を区別し、別途のフラグは持たない。
_Avoid_: チケット、アイテム、カード（UI上の表現を指すときのみ「カード」可）

**アーカイブ (archive)**:
完了済みタスクを保持するFirestoreコレクション。`/complete` で `board` から移動してくる。
_Avoid_: 削除、ゴミ箱

**ディスパッチャー (dispatcher)**:
運用者のローカル機でcron/launchdにより定時実行され、REST API経由で `needs-ai` かつ `ai-batch` のタスクを1件処理するバッチ。Firestoreへ直接アクセスはしない。
_Avoid_: ワーカー、ジョブ、スケジューラ単体

**オーナー (owner)**:
タスクの担当主体。human / ai-batch / ai-interactive のいずれか。操作主体を表す `activity.actor` とは別概念。
_Avoid_: ユーザー、担当者（人間とAIを区別しない曖昧語）
