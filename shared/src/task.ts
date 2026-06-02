// HANDOFF タスクスキーマの単一ソース（CONTEXT.md / docs/prd.md §データモデル準拠）。

export const STATUSES = [
  'needs-ai',
  'needs-human',
  'in-progress',
  'done',
  'blocked',
] as const;
export type Status = (typeof STATUSES)[number];

export const OWNERS = ['human', 'ai-batch', 'ai-interactive'] as const;
export type Owner = (typeof OWNERS)[number];

/** owner が AI 系のとき、実際に処理する具体的なAI（ADR-0004）。human タスクは持たない。 */
export const AGENTS = ['cowork', 'codex', 'gemini', 'claude-code'] as const;
export type Agent = (typeof AGENTS)[number];

export const PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ACTION_TYPES = [
  'content',
  'research',
  'review',
  'publish',
  'setup',
  'other',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/** 活動履歴の1エントリ。いつ・誰が・何をしたか。 */
export interface ActivityEntry {
  /** ISO 8601（例: 2026-06-01T07:30:00Z） */
  timestamp: string;
  /** 操作主体。人間=メール等、機械系=トークン種別。owner とは別概念。 */
  actor: string;
  action: string;
}

/** 1件の作業項目。Firestore では board / archive の1ドキュメント。 */
export interface Task {
  id: string;
  title: string;
  status: Status;
  owner: Owner;
  priority: Priority;
  action_type: ActionType;
  handoff_note: string;
  /** blocked 時のみ理由文字列、それ以外は null。 */
  blocked_reason: string | null;
  tags: string[];
  /** owner が AI 系のときの具体的な担当AI。human タスク・未割当は null（ADR-0004）。 */
  agent: Agent | null;
  /** 所属プロジェクトの任意ラベル。未設定は null。 */
  project: string | null;
  /** 紐づくマイルストーンの任意ラベル。未設定は null。 */
  milestone: string | null;
  /**
   * このタスクを作成した主体。人間作成時はサインインメール、機械系作成時はトークン種別。
   * 人間UIはこの値が自分のメールと一致するタスクだけを読み込む（ボードのユーザー絞り込み）。
   * 作成主体不明（レガシー）の場合は null。
   */
  created_by: string | null;
  /** ISO 8601 */
  created_at: string;
  /** ISO 8601。楽観的並行制御の照合キー。 */
  updated_at: string;
  activity: ActivityEntry[];
}
