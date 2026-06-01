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
  /** ISO 8601 */
  created_at: string;
  /** ISO 8601。楽観的並行制御の照合キー。 */
  updated_at: string;
  activity: ActivityEntry[];
}
