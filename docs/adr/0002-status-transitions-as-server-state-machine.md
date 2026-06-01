# status遷移をサーバー側ステートマシンとして強制し、楽観的並行制御を行う

## Status

accepted

## 決定

`PATCH /api/board/{id}` による `status` 変更は、サーバー側で明示的な遷移グラフを唯一の真実として検証する。

許可する遷移（これ以外の `status` 変更は **422 Unprocessable Entity**）:

| From → To | 可否 |
|---|---|
| needs-ai → in-progress | ✅ |
| needs-human → in-progress | ✅ |
| in-progress → needs-ai | ✅ |
| in-progress → needs-human | ✅ |
| in-progress → done | ✅ |
| (needs-ai / needs-human / in-progress) → blocked | ✅ |
| blocked → needs-ai | ✅ |
| blocked → needs-human | ✅ |
| done → （`status`変更不可。`/complete`でarchiveへ） | — |

付随ルール:

- `in-progress` は必須の中間状態。`needs-ai → done` 等のショートカットは禁止。`done` は終端（reopen不可）。
- **actor制約はかけない**。合法な辺なら認証済みの誰でも実行可。`owner` は遷移で自動変更せず、`activity.actor` に実行者を記録する。
- `in-progress → needs-ai/needs-human` および `blocked → needs-*`（引き継ぎ遷移）では `handoff_note` 必須。`→ blocked` は `blocked_reason` 必須、`blocked` 離脱時は `blocked_reason` を null にリセット。
- **楽観的並行制御**: クライアントは last-seen `updated_at` を送り、トランザクション内で現在値と照合。不一致は **409 Conflict**。これにより「不正遷移(422)」と「競合(409)」を分離する。

## 文脈とトレードオフ

仕様§3は `PATCH /api/board/{id}` を「タスク部分更新」とだけ書き、§5に遷移ルールを図示するが、両者を結ぶ強制点を定義していない。ディスパッチャー・AIエージェント・人間UIがすべて PATCH を使うため、検証をUI側だけに置くと機械系がルールを破れる。

検討した代替案:

1. **UI側だけで遷移を誘導** — 却下。機械系クライアントがグラフを無視できる。
2. **強制せず記録のみ（後勝ち）** — 却下。古い状態を前提にした誤遷移や上書き事故が起きうる。
3. **採用案: サーバー側ステートマシン + 楽観ロック** — 機械系と人間で同一ルールが効き、競合とルール違反を別レスポンスで返せる。

## 帰結

- API は遷移グラフ・必須ノート・`blocked_reason` ルール・`updated_at` 照合を実装する責務を持つ。
- クライアント（UI・ディスパッチャー）は 409 を受けたら再取得してリトライ、422 は不正操作として扱う。
- この強制を外して「ただの部分更新」に戻すと、引き継ぎ履歴の一貫性と並行安全性が失われる（本ADRの前提を破壊する）。
