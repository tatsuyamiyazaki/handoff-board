# handoff デスクトップアプリ（Electron）設計仕様

- 日付: 2026-07-14
- ステータス: 実装済み（PR #2 レビュー反映中）
- 関連: [ADR-0005](../adr/0005-remove-dispatcher-pull-via-mcp.md)（プル型モデル）, [ADR-0001](../adr/0001-dual-auth-machine-token-and-human-firebase.md)（二重認証）, [ADR-0003](../adr/0003-per-user-board-scoping-by-created-by.md)（created_by スコーピング）

## 1. 目的

クラウドの handoff ボードからタスクを取得し、ローカルの CLI（Claude Code / Codex CLI など）に実行させるデスクトップアプリを追加する。既存の Web アプリの UI を流用し、デスクトップ固有の機能（CLI 実行・設定）を上乗せする。

ADR-0005 の「AI 実行者がローカルから handoff-mcp 経由でタスクをプルする」モデルは維持する。デスクトップアプリはプルの**起点を GUI 化するランチャー**であり、サーバー側に push 経路を作らない。

## 2. スコープ

### Phase 1（本仕様の実装範囲）

- ボード表示: 既存 `@handoff/web` の UI をそのまま renderer として表示
- Google サインイン（システムブラウザ + ループバック OAuth）
- タスクの手動実行: カードの「実行」ボタンからローカル CLI をヘッドレス起動
- 実行ログのアプリ内ストリーミング表示
- 設定画面: CLI 定義、project→フォルダマッピング、プロンプトテンプレート、API ベース URL

### Phase 2（本仕様に含めるが実装は後続）

- needs-ai タスクの自動ポーリング実行（常駐エージェント的動作）

### スコープ外

- アプリ内対話ターミナル（xterm.js 埋め込み）
- サーバー側の変更（API・Firestore・デプロイ構成は一切変更しない）
- macOS / Linux 対応（Windows を一次ターゲットとする。他 OS は動けば儲けもの）

## 3. アーキテクチャ

### 3.1 ワークスペース構成

monorepo に `desktop/` ワークスペースを追加する。renderer は新規作成せず、`@handoff/web` のビルド成果物を同梱する。

```
handoff-board/
├─ shared/   @handoff/shared（desktop bridge の共有契約を保持）
├─ api/      @handoff/api（変更なし）
├─ web/      @handoff/web ← renderer としてもビルドされる（軽微な変更）
└─ desktop/  @handoff/desktop（新規）
   ├─ src/main/
   │   ├─ index.ts       ウィンドウ生成・app:// スキーム登録・IPC 配線
   │   ├─ cli-runner.ts  CLI 子プロセスの起動・出力ストリーミング・実行管理
   │   ├─ settings.ts    設定の読み書き（userData/settings.json）
   │   └─ auth.ts        Google OAuth（PKCE + ループバック）
   ├─ src/preload/
   │   └─ index.ts       contextBridge で window.handoffDesktop を公開
   ├─ package.json
   └─ electron-builder 設定
```

- ESM・explicit `.js` 拡張子・`moduleResolution: Bundler` は既存ワークスペースの流儀に合わせる。
- main/preload のビルドは esbuild（または tsup）。renderer のビルドは既存の `pnpm --filter @handoff/web build` を利用する。
- パッケージマネージャーは `packageManager` で pnpm `11.13.0` に固定し、Dockerfile も同じ版を使う。依存パッケージのビルド許可は pnpm 11 の `allowBuilds` で管理する。

### 3.2 renderer の配信

- 本番: `app://` カスタムスキームで web のビルド成果物を配信する。`file://` を使わないのは、オリジンを安定させて localStorage と Firebase 認証の永続化を機能させるため。
- 開発: `HANDOFF_DEV_SERVER_URL`（例 `http://localhost:5173`）が設定されていれば Vite dev server に接続する。
- セキュリティ設定: `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`。renderer からの機能アクセスは preload ブリッジ経由のみ。
- IPC は `app://bundle` または明示した開発サーバー URL からの呼び出しだけを受け付ける。外部 URL へのナビゲーションと新規ウィンドウは遮断し、必要なリンクだけをシステムブラウザへ渡す。
- Content Security Policy は Vite の本番ビルド時だけ `index.html` に注入する。開発時は react-refresh と HMR を妨げない。

### 3.3 web 側の変更（単一コードベース維持）

`window.handoffDesktop` の有無で出し分ける。ブラウザで開いたときは従来どおりの Web アプリとして動く。

- ブリッジあり:
  - AI オーナー（`isAiOwner()`）のカードに「実行」ボタンを表示
  - 実行ログパネル（実行中・履歴）を表示
  - デスクトップ設定画面への導線を表示
  - `api-client` のベース URL をブリッジの設定値から取得
  - サインインボタンはブリッジの `signIn()` を呼ぶ（`signInWithPopup` の代わり）
- ブリッジの型定義は `shared/src/desktop-bridge.ts` を単一ソースとし、renderer/main/preload が `@handoff/shared` から参照する。

## 4. preload ブリッジ（window.handoffDesktop）

すべて `ipcRenderer.invoke` ベースの非同期 API。イベントは購読形式。

```ts
interface HandoffDesktopBridge {
  // 実行
  runTask(req: {
    taskId: string;
    taskTitle: string;
    cliId: string;
    cwd: string;
  }): Promise<{ runId: string }>;
  cancelRun(runId: string): Promise<void>;
  listRuns(): Promise<RunSummary[]>;
  getRunLog(runId: string): Promise<{ log: string; lastSequence: number }>;
  onRunEvent(cb: (ev: RunEvent) => void): () => void; // stdout/stderr チャンク・状態遷移・終了

  // 設定
  getSettings(): Promise<DesktopSettings>;
  setSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings>;
  pickFolder(): Promise<string | null>; // OS のフォルダ選択ダイアログ

  // 認証
  signIn(): Promise<{ idToken: string }>; // Google の id_token を返す
}
```

stdout/stderr の `RunEvent` は実行単位で単調増加する `sequence` を持つ。`getRunLog()` はログ本文と、その本文に含まれる最後の `sequence` を同一スナップショットとして返す。renderer は購読開始後のイベントを一時保持し、スナップショット取得後に `sequence > lastSequence` のチャンクだけを連結する。これにより購読開始とbackfillの競合でもログを欠落・重複させない。`status` は `running → succeeded | failed | cancelled`。

## 5. タスク実行フロー

1. ユーザーがカードの「実行」ボタンを押す。
2. **作業ディレクトリ解決**: タスクの `project` を設定の `projectFolderMap` で引く。未登録なら `pickFolder()` でフォルダを選ばせ、マッピングに保存する（`project` が null のタスクも毎回 `pickFolder()`）。
3. **CLI 選択**: タスクの `owner` に対して `defaultForOwners` が一致する CLI 定義をデフォルト選択。実行前に変更できる。
4. **プロンプト生成**: `promptTemplate` のプレースホルダ（`{taskId}` / `{title}`）を展開する。デフォルトテンプレート:

   > handoff のタスク {taskId} を handoff-mcp の get_task で取得し、内容に従って作業してください。着手時と完了時に transition_task でステータスを遷移させてください。

5. **spawn**: main プロセスが `cross-spawn(command, expandedArgs, { cwd, shell: false })` で起動する。Windows の `.cmd` シム解決は `cross-spawn` に委ね、シェル文字列を組み立てない。起動前にコマンドの存在を検査し、stdout/stderr を `RunEvent` として renderer に流す。
6. **終了**: exit code 0 → succeeded、非 0 → failed。renderer は終了イベントを受けてボードを再取得する。

### 実行の前提と責務分担

- **ステータス遷移はアプリではなく CLI 自身が handoff-mcp 経由で行う**（ADR-0005 のプルモデルを保つ。遷移ルールは server の transition-engine が引き続き単一の門番）。
- 前提: 実行対象の作業ディレクトリ（またはユーザースコープ）で CLI に handoff-mcp が設定済みであること。未設定の場合タスク取得に失敗するが、それは CLI の出力ログとしてユーザーに見える。アプリは検知を試みない（Phase 1）。
- 同一タスクの二重実行は main 側で拒否する（実行中の taskId を保持）。実行中のカードはスピナー表示。
- キャンセル要求を受理して `taskkill` を開始した後はキャンセルを優先する。kill中に子プロセスが自然終了した場合や `taskkill` が「既に存在しない」（exit code 128）を返した場合も `cancelled` とする。それ以外のkill失敗だけを `failed` とし、どの競合順でも終端イベントは1回だけ発行する。終端済みまたはキャンセル処理中への再度のキャンセルは何もしない。

## 6. CLI 定義（設定可能なランナー）

```jsonc
{
  "id": "claude-code",          // 一意な slug
  "name": "Claude Code",        // 表示名
  "command": "claude",          // 実行コマンド
  "argsTemplate": ["-p", "{prompt}"],  // プレースホルダ展開される引数列
  "defaultForOwners": ["claude-code"]  // この owner のタスクでデフォルト選択
}
```

- 初期プリセットとして Claude Code（`claude -p {prompt}`）と Codex CLI（`codex exec {prompt}`）を同梱する。
- ユーザーは設定画面で追加・編集・削除できる。`{prompt}` は引数列のどこに置いてもよい。
- プレースホルダは `{prompt}` / `{taskId}` / `{title}` の 3 つ。シェルインジェクション対策として、プレースホルダ展開は**引数配列の要素単位**で行い、文字列連結でコマンドラインを組み立てない。
- CLI 引数と `promptTemplate` は単一行に制限し、改行を含む値は保存時または実行時に拒否する。
- owner の選択肢は `@handoff/shared` の `OWNERS.filter(isAiOwner)` から導出し、AI owner の一覧をデスクトップUI内に再定義しない。

## 7. 認証

- **方式**: システムブラウザで Google OAuth 認可コードフロー（PKCE）+ ループバックリダイレクト（`http://127.0.0.1:<ランダムポート>`）。取得した `id_token` を renderer に渡し、Firebase JS SDK の `signInWithCredential(GoogleAuthProvider.credential(idToken))` でサインインする。
- 以降のリクエストは web と同一: `Authorization: Bearer <Firebase idToken>` → API 側で `ALLOWED_EMAILS` 許可リスト検証 → `created_by` スコーピング。**API 側の変更は不要**。
- **前提となる事前作業**: Firebase Authentication と同じ GCP プロジェクトで「デスクトップアプリ」タイプの OAuth クライアント ID を 1 つ発行し、Google プロバイダを有効化する。異なるプロジェクトのクライアント ID は Firebase の `signInWithCredential` で拒否され得るため使用しない。クライアント ID はビルド時埋め込み（`VITE_FIREBASE_*` と同様の扱い）。デスクトップ OAuth のクライアントシークレットは任意で、発行されている場合だけ env で注入する。リポジトリには含めない。
- OAuth ループバックは最初のコールバックだけを処理し、成功ページ後の favicon/keep-alive 再リクエストは 204 で無視する。
- 配布前に実機で OAuth コード交換と `signInWithCredential` の両方が成功することを確認する。
- トークンの永続化は Firebase SDK の標準機構（`app://` オリジンの IndexedDB/localStorage）に任せる。アプリ独自のトークン保存はしない。

## 8. 設定（userData/settings.json）

| キー | 型 | 説明 | デフォルト |
|---|---|---|---|
| `apiBaseUrl` | string | handoff API の URL | Cloud Run 本番 URL |
| `cliDefinitions` | CliDefinition[] | CLI 定義の配列 | Claude Code / Codex プリセット |
| `projectFolderMap` | Record<string, string> | project 名 → ローカルフォルダ | `{}` |
| `promptTemplate` | string | 実行プロンプトのテンプレート | §5 のデフォルト文 |

- 読み書きは main プロセスのみ。renderer はブリッジ経由。
- 保存時にスキーマ検証し、不正値は 422 相当のエラーをブリッジ越しに返す（`@handoff/shared` の ValidationError パターンに合わせる）。
- 秘密情報（トークン類）はこのファイルに保存しない。

## 9. エラー処理

| 状況 | 挙動 |
|---|---|
| CLI コマンドが見つからない（ENOENT） | 「コマンドが見つかりません」+ 設定画面への導線を表示 |
| 実行中に同一タスクを再実行 | 拒否してトースト表示 |
| exit code ≠ 0 | 失敗表示。ログは保持し再確認できる |
| キャンセル | プロセスツリーを kill（Windows: `taskkill /pid /T /F`）し cancelled 表示 |
| API 到達不能 / 401 | 既存 web のエラー表示をそのまま利用。401 は再サインイン導線 |
| フォルダマッピング先が存在しない | 実行前チェックで検出し、再選択ダイアログへ |
| デスクトップ設定の初期読み込みに失敗 | API ベース URL は既定値のまま React を描画し、画面上にエラーを表示 |

ログは実行ごとにリングバッファ（上限あり、目安 1MB/run）でメモリ保持し、アプリ再起動で消える（Phase 1）。ファイル永続化は必要になったら追加する。

## 10. テスト方針

- **web**: `window.handoffDesktop` のフェイクを注入し、実行ボタンの出し分け・実行フロー・設定画面を既存 Vitest + Testing Library パターンでテストする。ブリッジはインターフェース経由なのでモックは容易。
- **web**: ログ購読とbackfillが競合しても、スナップショットの`lastSequence`以前を重複させず、それより後のライブチャンクを欠落させないことをテストする。
- **desktop/main**: `cli-runner`（spawn をモックし、引数展開・イベント発火・二重実行拒否・キャンセルを検証）、`settings`（スキーマ検証・デフォルト値・マイグレーション耐性）、プロンプトテンプレート展開の純関数をユニットテスト。
- **desktop/main**: kill中の自然終了、`taskkill` exit code 128、その他のkill失敗、キャンセル再入について、終端状態と終端イベントが1回だけになることをテストする。
- **E2E**: Playwright の Electron ドライバで「起動 → ボード表示」の最小スモークを用意する（Phase 1 では任意。CI には載せない）。
- カバレッジ目標は既存方針（80%）に従うが、Electron 結線コード（index.ts の配線部分）は除外対象とする。

## 11. 実装スライス

| # | スライス | 内容 | 検証 |
|---|---|---|---|
| d1 | 骨格 | desktop ワークスペース + ウィンドウ + web renderer 表示 + apiBaseUrl 設定 + 暫定トークン認証（web の X-Board-Token 経路を流用）でボード表示 | アプリを起動して本番ボードが見える |
| d2 | サインイン | ループバック OAuth + signInWithCredential | Google アカウントでサインインし自分のボードが見える |
| d3 | CLI 実行 | 実行ボタン + cli-runner + ログパネル（フォルダは毎回選択） | タスクを Claude Code に実行させ、ステータスが遷移する |
| d4 | 設定完成 | CLI 定義編集 + projectFolderMap + プロンプトテンプレート編集 | 設定画面から Codex 定義を追加して実行できる |
| d5 | 配布 | electron-builder で Windows インストーラ（NSIS）生成 | インストールして動く |
| d6 | Phase 2 | 自動ポーリング実行（別スペックで詳細化） | — |

d1〜d5 はそれぞれ独立に完結する縦切りスライスとして issue 化する（to-issues スキルの流儀）。

## 12. 決定事項の要約

| 論点 | 決定 |
|---|---|
| アプリの役割 | クラウドからタスクを取得しローカル CLI で実行するランチャー |
| 実行トリガー | 手動実行を先行、自動ポーリングは Phase 2 |
| CLI 実行形態 | ヘッドレス（`claude -p` / `codex exec`）、出力はアプリ内表示 |
| 作業ディレクトリ | project→フォルダマッピング（未登録時はダイアログ選択） |
| 認証 | Firebase Google サインイン（ループバック OAuth）。API 変更なし |
| UI 流用方式 | `@handoff/web` のビルドを renderer に同梱、ブリッジ有無で機能を出し分け |
| ステータス遷移 | アプリは関与せず、CLI が handoff-mcp 経由で行う |
