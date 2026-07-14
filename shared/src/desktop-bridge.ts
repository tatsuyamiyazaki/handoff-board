// デスクトップ（Electron）ブリッジの共有型。web（renderer）と desktop（main/preload）の契約。
// ランタイムコードは置かない（検証ロジックは desktop 側の settings-core にある）。
import type { Owner } from './task.js';

/** 設定可能な CLI ランナー1件の定義。 */
export interface CliDefinition {
  /** 一意な slug（例: "claude-code"）。 */
  id: string;
  /** 表示名。 */
  name: string;
  /** 実行コマンド（PATH 解決される。例: "claude"）。 */
  command: string;
  /** 引数列。{prompt} / {taskId} / {title} が要素単位で展開される。 */
  argsTemplate: string[];
  /** この owner のタスクでデフォルト選択される（human は不可）。 */
  defaultForOwners: Owner[];
}

/** デスクトップアプリの永続設定（userData/settings.json）。 */
export interface DesktopSettings {
  /** API ベース URL。空文字は「web ビルドに焼き込まれた VITE_API_BASE を使う」の意。 */
  apiBaseUrl: string;
  cliDefinitions: CliDefinition[];
  /** project 名 → ローカル作業フォルダの対応表。 */
  projectFolderMap: Record<string, string>;
  /** 実行プロンプトのテンプレート。{taskId} / {title} が展開される。 */
  promptTemplate: string;
}

export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

/** 1回の CLI 実行のサマリ（ログ本文は含まない）。 */
export interface RunSummary {
  runId: string;
  taskId: string;
  taskTitle: string;
  cliName: string;
  status: RunStatus;
  exitCode: number | null;
}

/** main → renderer へストリーミングされる実行イベント。 */
export type RunEvent =
  | { runId: string; type: 'stdout' | 'stderr'; chunk: string }
  | { runId: string; type: 'status'; run: RunSummary };

/** 実行リクエスト。cwd と cliId の解決は renderer 側（RunDialog）で済ませてから渡す。 */
export interface RunTaskRequest {
  taskId: string;
  taskTitle: string;
  cliId: string;
  cwd: string;
}

/** preload が window.handoffDesktop として公開する API。 */
export interface HandoffDesktopBridge {
  runTask(req: RunTaskRequest): Promise<{ runId: string }>;
  cancelRun(runId: string): Promise<void>;
  listRuns(): Promise<RunSummary[]>;
  /** 実行イベントを購読する。戻り値は解除関数。 */
  onRunEvent(cb: (ev: RunEvent) => void): () => void;
  getSettings(): Promise<DesktopSettings>;
  setSettings(patch: Partial<DesktopSettings>): Promise<DesktopSettings>;
  /** OS のフォルダ選択ダイアログ。キャンセルは null。 */
  pickFolder(): Promise<string | null>;
  /** システムブラウザで Google サインインし、id_token を返す。 */
  signIn(): Promise<{ idToken: string }>;
}
