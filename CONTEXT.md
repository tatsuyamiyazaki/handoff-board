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
カンバンUIの縦の列。1レーンは1つ以上の `status` をまとめて表示する論理グルーピング。To Do レーン = needs-ai + needs-human、In Progress レーン = in-progress、Blocked レーン = blocked。`done` はレーンを持たず archive へ移動する。`status` 値自体は5つのまま変えない。
_Avoid_: カラム、ボード、status と1対1だと仮定する

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
タスクの担当主体。human / ai-batch / ai-interactive のいずれか。routing（レーン・ディスパッチャー・遷移）を決める粗い軸。操作主体を表す `activity.actor`、具体AIを表す `agent` とは別概念。
_Avoid_: ユーザー、担当者（人間とAIを区別しない曖昧語）

**エージェント (agent)**:
owner が AI 系（ai-batch / ai-interactive）のとき、実際に処理する具体的なAIの識別子（chatgpt / codex / gemini / claude-code）。owner の下位概念で、human タスクでは持たない（null）。
_Avoid_: owner と混同する、自由文字列で表記ゆれさせる

**プロジェクト (project)**:
タスクが属する取り組みを表す任意ラベル。カンバンのフィルタ軸。専用エンティティではなく、タスク上の文字列値。
_Avoid_: タグ（`tags` とは別フィールド）

**マイルストーン (milestone)**:
タスクが紐づく任意の節目を表すラベル。カンバンのフィルタ軸。project 同様、タスク上の文字列値で締切日付ではない。
_Avoid_: 締切、デッドライン（日付ではない）
