# レビュー関門を in-review 状態として追加し、差し戻し往復に上限を設ける

## Status

accepted — [ADR-0002](0002-status-transitions-as-server-state-machine.md) を amend する（遷移グラフを拡張し、`in-progress → done` の辺を削除する）

## 決定

- `STATUSES` に **`in-review`** を追加する。意味は「実装は完了したが、実行者とは別の検証者による確認が済むまで完了と見なさない」。
- 遷移グラフ（[ADR-0002](0002-status-transitions-as-server-state-machine.md)）を次のとおり拡張する:
  - `in-progress` → `in-review`（実装完了・レビュー依頼）
  - `in-review` → `done`（レビュー通過。**`done` への唯一の入口をここに付け替える**。`in-progress` → `done` の辺は削除する）
  - `in-review` → `needs-ai`（差し戻し。引き継ぎ遷移として `handoff_note` にレビュー指摘を必須とする）
  - `in-review` → `needs-human`（エスカレーション。往復上限超過時の出口。こちらも引き継ぎ遷移として `handoff_note` を必須とする——「needs-* に入る遷移は note 必須」の規則性を保ち、何往復して何が未解決かを人間に引き継ぐ）
  - `in-review` → `blocked`（外的要因による中断。既存の `blocked_reason` 必須ルールを踏襲）
  - `blocked` → `in-review`（レビュー中断からの復帰。実装済み・レビュー待ちだっただけの成果物を `blocked → needs-ai` 経由の再実装ループに落とさないための辺。自己レビュー排除の判定材料（activity の最新 `in-progress → in-review` エントリ）は blocked 迂回では変化しないため、判定はそのまま機能する）
- **差し戻し往復上限**: タスクに `review_cycles`（差し戻し回数カウンタ、`in-review` → `needs-ai` のたびにサーバーがインクリメント）を持たせる。上限は二層構え:
  - グローバル既定値: API 環境変数 `REVIEW_CYCLE_LIMIT`（既定 **5**）
  - タスク単位の上書き: `review_cycle_limit: number | null`（null なら既定値を使用）
- **リセット規定**: `in-review → needs-ai` 以外の経路で `needs-ai` に入る遷移（例: 人間の再投入経路 `needs-human → in-progress → needs-ai`）を**人間（`type: 'human'`）の actor が実行した場合、サーバーが `review_cycles` を 0 にリセット**する。人間の介入＝新しいレビュー予算の付与と解釈する。機械系 actor による（`in-review` 以外からの）`needs-ai` への handoff はカウンタを変えない。人間レビュアーが `in-review → needs-ai` で差し戻す場合はリセットではなくインクリメント（往復は誰が回しても往復）。
- 上限判定は**遷移実行前の値で `review_cycles >= limit` なら 422**（拒否された遷移はインクリメントしない）。つまり limit=5 なら差し戻しは 5 回まで通り、6 回目が拒否される。上限到達後の `in-review` → `needs-ai` はサーバーが **422 で拒否**する（黙って `needs-human` に付け替えない。[ADR-0006](0006-owner-department-role-three-axes.md) の厳格拒否原則を踏襲）。クライアントは明示的に `in-review` → `needs-human` を選ぶ。
- **自己レビュー排除**: `in-review` からの遷移（`done` / `needs-ai`）は、**直近の `in-progress` → `in-review` 遷移を実行した actor と同一の actor には許可しない**（422）。actor の判定粒度は認証トークンで、同一判定は **actor 文字列の完全一致**（`owner:機能` の全体。owner 前方一致ではない — [ADR-0008](0008-agent-identity-role-token-and-session-id.md)）。判定材料は `activity` の最新 `in-progress → in-review` エントリ。
- `review_cycle_limit` の設定・変更は人間（認証種別 `type: 'human'`、[ADR-0001](0001-dual-auth-machine-token-and-human-firebase.md)）にのみ許可する（機械系クライアントからは 422）。実装者 AI が自分で上限を引き上げて安全弁を無効化する経路を塞ぐ。

## 文脈とトレードオフ

CEO オーケストレーション（[ADR-0009](0009-ceo-orchestrator-pull-based-sequential-scheduler.md)）の導入により、AI 実行者が生成した成果物を無検証で `done` にする経路は品質リスクとなった。先行運用（cc-agent-harness）では「実行者と別の検証者」による関門が実際に不良を捕捉しており（平均3往復で収束）、形式的な儀式ではないことが実証済みである。

`done` の意味論を守ることが本 ADR の核心である。レビューを後続タスクとして表現する案では、ボード上の `done` に「検証済み」と「実行者が完了を主張しただけ」の2種類が混在し、サマリの完了数も水増しされる。検証されるまで完了と見なさないなら、それは状態として型に載せるべきである。

差し戻し先が `needs-ai` への再投入（同一担当への返却ではない）なのは、AI 実行者が worktree 単位の短命プロセスであり、差し戻し時点で元の実装プロセスが存在しない可能性が高いため。同じ理由で、レビュー往復は担当者間の対話ではなく pull プール経由の非対面ループになり、収束を保証する機構がない。上限とエスカレーションはこのループの安全弁である。リセットを人間の再投入に紐づけるのは、上限到達→エスカレーション→人間が再投入、の後もカウンタが上限のままだと、次の差し戻しが即 422 で再び人間へ跳ね返り続け（エスカレーション・ループ）、人間介入の意味が消えるためである。エスカレーション先が `blocked` でなく `needs-human` なのは、往復超過は「外的要因による進行不能」ではなく「AI の手に負えないので人間の番」であり、人間のアクションを要求するシグナルとして `needs-human` の定義そのものだからである。

検討した代替案:

1. **レビューを子タスク（role=reviewer）として表現し、状態を増やさない** — 却下。`done` の意味論が壊れる（上述）。さらに「先行タスクが done になるまで pull 不可」という依存関係スキーマが必要になり、循環検出・失敗伝播が芋づる式に増える。状態1つ＋遷移数本の追加より明確に重い。
2. **ゲートなし（タスク内セルフレビュー）** — 却下。実行者と検証者の分離という品質ゲートの実効性（実証済み）を放棄することになる。
3. **上限超過時にサーバーが自動で `needs-human` へ付け替える** — 却下。サイレントな自動修正は fail-fast 原則に反する（ADR-0006 と同じ理由）。
4. **人間によるレビュー（`in-review` を人間の関門にする）** — 却下。承認 Gate はリスク単位（[ADR-0010](0010-approval-gate-enforcement-at-infrastructure-layer.md)）と決めており、社内影響に留まる成果物レビューに人間を必須にすると承認処理量が人間側のボトルネックに戻る。レビュアーはエージェント（例: engineering/code-review ロール）が担う。

## 帰結

- `shared/src/task.ts`: `STATUSES` に `in-review` 追加、`Task` に `review_cycles: number`（既定 0）と `review_cycle_limit: number | null` を追加。
- `shared/src/transition.ts`: `ALLOWED_TRANSITIONS` の拡張、`in-progress → done` の辺の削除、差し戻し・エスカレーション時の `handoff_note` 必須化、`review_cycles` インクリメント、上限検証、人間によるリセット、自己レビュー排除、レビュー中断からの復帰判定を実装した。`TransitionDeps` は `actor` に加えて `actorType` と `reviewCycleLimit` を必須で受け取り、人間例外と上限判定に使う。
- `ActivityEntry` に任意の構造化フィールド `from?` / `to?`（status または null）を追加し、新しい遷移エントリには両方を記録する。既存データの欠落フィールドは欠落（`undefined`）のまま後方互換で扱い、自由文字列 `action` のパースには依存しない。
- `in-review` タスクに「どのレビュー役割向けか（code-review / architecture 等）」を表す専用軸は持たない。reviewer は `status=in-review`（必要に応じて department で絞る）で pull する。レビュー役割のルーティング軸が必要になったら別 ADR で扱う。
- web: `in-review` レーン（またはチップ）の追加。`in-progress → done` ボタンは消え、`in-progress → in-review` に置き換わる。人間がレビュー中のタスクを一望できることが UI 要件。
- **handoff-mcp（別リポジトリ）はロックステップ更新が必須**（ADR-0006 と同様）: status enum の複製更新に加え、reviewer が `in-review` タスクを pull できるようクエリ対象を拡張する。
- 既存タスクのマイグレーション: `review_cycles` 欠落は 0 として読む（後方互換の読み出しデフォルト）。
- CONTEXT.md は status を 6 値として In Review レーンを含む定義へ更新し、[ADR-0002](0002-status-transitions-as-server-state-machine.md) に本 ADR の amend 注記を追加した。
- 人間 owner のタスクも、`done` への唯一の入口が `in-review` である以上 `in-review` を必ず経由する（免除されるのはレビュー関門そのものではなく**別レビュアーの介在**）。自己レビュー排除の例外は「**タスクの owner が `human`**、かつ**現遷移を実行している actor の認証種別が `type: 'human'`**（[ADR-0001](0001-dual-auth-machine-token-and-human-firebase.md)）」の場合に限る（人間は自分の作業を自分で完了と宣言できる）。判定に使う認証種別は現遷移の actor のものであり、activity 上の過去 actor の種別推定は行わない。owner が AI 系のタスクにはこの例外を適用しない — 人間が AI タスクを**レビューする**のは別 actor 遷移として例外なしで通る一方、人間が AI タスクを実装（`in-progress → in-review`）から完了まで単独で通すラバースタンプ経路は塞ぐ。
- **補強（2026-07-21、実装レビューによる迂回経路の閉塞）**:
  - **blocked 迂回の差し戻しも往復として扱う**: レビュー中断中の blocked（直近の遷移が `in-review → blocked`、復帰判定 `canRecoverToReview` と同一の述語）から `needs-ai` へ出る遷移は、`in-review → needs-ai` と同じ規則（遷移前値での上限判定・`review_cycles` インクリメント・自己レビュー排除）を適用する。これを欠くと `in-review → blocked → needs-ai` の 2 手で上限とレビュアー分離を素通りできてしまう。レビュー由来でない blocked からの `needs-ai` は従来どおり（機械系は不変、人間はリセット）。
  - **レビュー中の owner 変更禁止**: `in-review` およびレビュー中断中の blocked にあるタスクの owner は `/details` 編集で変更できない（422）。owner を `human` に書き換えてから人間例外で自己完了するラバースタンプ迂回を塞ぐ。
  - **作成時の `review_cycle_limit` 指定は 422**: `POST /api/board` はこのフィールドを黙殺せず明示拒否する（設定・変更は `/details` 経路の人間のみ。[ADR-0006](0006-owner-department-role-three-axes.md) の厳格拒否原則）。
