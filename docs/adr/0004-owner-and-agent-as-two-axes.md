# owner（粗い担当軸）と agent（具体AI）を二軸に分ける

## Status

accepted

## 決定

タスクの「誰が担当か」を**二層**で表現する。

- `owner`（`human` / `ai-batch` / `ai-interactive`）は従来どおり残し、**routing 軸**とする。レーン分け・ディスパッチャーの取得条件・遷移ステートマシンはすべて `owner` を見る。
- `Task` に `agent: string | null` を新設する。`owner` が AI 系（`ai-batch` / `ai-interactive`）のときだけ、実際に処理する**具体的なAIの識別子**（固定 enum: `chatgpt` / `codex` / `gemini` / `claude-code`、将来追加可）を保持する。`owner=human` のタスクは `agent=null`。
- `agent` は**表示・記録のためのメタデータ**であり、ディスパッチャーの routing には関与させない（dispatcher は引き続き `needs-ai` かつ `owner=ai-batch` を拾う）。
- カンバンのカードは、`owner=human` なら owner から `HUMAN` を、AI 系なら `agent` の値（`CHATGPT` 等）を担当ドットとして表示する。

## 文脈とトレードオフ

参照デザインのカードは担当を `HUMAN` / `CHATGPT` / `CODEX` / `GEMINI` / `CLAUDE-CODE` という単一の軸で見せていた。これを現ドメインに取り込むにあたり、`owner`（CONTEXT.md で human / ai-batch / ai-interactive と定義済み）との関係を決める必要があった。

検討した案:

1. **owner を廃し、担当を `agent` 軸（human / chatgpt / codex / …）へ一本化する** — 却下。ドメインモデルとしては素直だが、`owner` を前提に組まれた遷移ステートマシン（[ADR-0002](0002-status-transitions-as-server-state-machine.md)）・ディスパッチャー（`ai-batch` をキーに処理）・[ADR-0003](0003-per-user-board-scoping-by-created-by.md) の owner 解釈をすべて再設計することになり、既存データの移行も伴う。戻しにくく、得るものに対して破壊範囲が大きすぎる。
2. **`agent` を自由文字列にする** — 見送り。将来のエージェント追加にコード変更が不要になる利点はあるが、表記ゆれ（`Codex` / `codex` / `OpenAI Codex`）でフィルタ候補と色割り当てが破綻する。固定 enum で安定させ、追加時に enum を1行増やす運用を選ぶ。
3. **採用案: `owner` を routing 軸として残し、`agent` を owner の下位概念として追加する** — owner の安定した役割（routing）を壊さず、表示・記録に必要な粒度だけを足せる。`human` が owner と agent の二箇所に重複しないよう、agent は AI 系のときのみ非 null とする。

## 帰結

- `shared/src/task.ts` に `agent` を追加し、enum を定義する。`buildTask` / `validateCreateTask` は「`owner=human` なら `agent` は null でなければならない」不変条件を強制する。
- ディスパッチャー（`selectNextTask` 等）と遷移ステートマシンは無改修。`agent` を見ない。
- 既存タスク（`agent` 無し）は AI 系でも `agent=null` となり、カードは owner ベースの汎用表示（例: `AI`）にフォールバックする。必要ならバックフィルする。
- 担当を増やす（新しいAIを足す）には enum に値を1つ追加し、UI の色対応を1つ加えるだけでよい。
- 関連: [ADR-0002](0002-status-transitions-as-server-state-machine.md)（owner を前提とする遷移）、[ADR-0003](0003-per-user-board-scoping-by-created-by.md)（owner≠個人の整理）。CONTEXT.md の **オーナー** / **エージェント** の定義もこの二軸を反映している。
