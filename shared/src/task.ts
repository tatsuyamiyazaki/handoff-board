// HANDOFF タスクスキーマの単一ソース（CONTEXT.md / docs/prd.md §データモデル準拠）。

export const STATUSES = [
  'needs-ai',
  'needs-human',
  'in-progress',
  'done',
  'blocked',
] as const;
export type Status = (typeof STATUSES)[number];

/**
 * タスクの担当主体（ADR-0006）。具体AI（cowork / claude-code / codex）を owner に昇格させた。
 * human はレーン分け・遷移の routing 軸、AI 系は「どのAIが MCP 経由で pull するか」も兼ねる。
 */
export const OWNERS = ['human', 'cowork', 'claude-code', 'codex'] as const;
export type Owner = (typeof OWNERS)[number];

/** owner が AI 系か（human 以外）。department/role を持てる前提条件。 */
export function isAiOwner(owner: Owner): boolean {
  return owner !== 'human';
}

/** AI部署（ADR-0006）。owner が AI 系のときのみ持てる組織軸。human タスクは null。 */
export const DEPARTMENTS = ['engineering', 'contents', 'business', 'infrastructure'] as const;
export type Department = (typeof DEPARTMENTS)[number];

/** AI部署ごとのロール一覧（ADR-0006）。role は必ずこのいずれかの部署リストに属する。 */
export const DEPARTMENT_ROLES = {
  engineering: [
    'tech-lead',
    'nightly-qa',
    'task-dispatcher',
    'eng-director',
    'debug',
    'code-review',
    'architecture',
    'system-design',
    'testing-strategy',
    'tech-debt',
    'documentation',
    'deploy-checklist',
    'incident-response',
    'standup',
  ],
  contents: ['content-director', 'brand-voice', 'uradorino', 'root-cause', 'anti-ai-slop'],
  business: ['partnership-manager', 'business-strategy', 'meeting-director', 'legal-review'],
  infrastructure: [
    'local-support-agent',
    'daily-task-dispatch',
    'morning-standup',
    'weekly-knowledge-sync',
  ],
} as const satisfies Record<Department, readonly string[]>;

/** ロール（ADR-0006）。department 配下の役割ラベル。owner が AI 系のときのみ持てる。 */
export type Role = (typeof DEPARTMENT_ROLES)[Department][number];

/** 全ロールの平坦な一覧（部署をまたいだ重複なし前提）。 */
export const ROLES: readonly Role[] = Object.values(DEPARTMENT_ROLES).flat();

/** 指定部署に属するロール一覧を返す（UI の連動ドロップダウン用）。 */
export function rolesForDepartment(department: Department): readonly Role[] {
  return DEPARTMENT_ROLES[department];
}

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

/** 認証種別（ADR-0001 の type）。作成主体の記録（ADR-0011）と遷移の人間例外判定（ADR-0007）に使う。 */
export type ActorType = 'human' | 'machine';

/** 活動履歴の1エントリ。いつ・誰が・何をしたか。 */
export interface ActivityEntry {
  /** ISO 8601（例: 2026-06-01T07:30:00Z） */
  timestamp: string;
  /** 操作主体。人間=メール等、機械系=トークン種別（owner[:機能]、ADR-0008）。owner とは別概念。 */
  actor: string;
  action: string;
  /**
   * 自己申告のセッション識別子（X-Agent-Session、ADR-0008）。記録専用で認証・強制には使わない。
   * 省略（既存データ）は null 扱い。
   */
  session?: string | null;
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
  /** AI部署。owner が AI 系のときのみ非 null（ADR-0006）。human タスク・未設定は null。 */
  department: Department | null;
  /** ロール。department 配下の役割。department が非 null かつ未割当でないときのみ非 null（ADR-0006）。 */
  role: Role | null;
  /** 所属プロジェクトの任意ラベル。未設定は null。 */
  project: string | null;
  /** 紐づくマイルストーンの任意ラベル。未設定は null。 */
  milestone: string | null;
  /**
   * このタスクを作成した主体。人間作成時はサインインメール、機械系作成時はトークン種別。
   * 人間UIはこの値が自分のメールと一致するタスクに加え、機械系作成タスクも読み込む（ADR-0011）。
   * 作成主体不明（レガシー）の場合は null。
   */
  created_by: string | null;
  /**
   * 作成主体の認証種別（ADR-0011）。人間ボードは「created_by が自分 ∨ machine」を表示する。
   * 既存データの欠落は 'human' として読む（保守的既定。リポジトリ実装が補完する）。
   */
  created_by_type: ActorType;
  /** ISO 8601 */
  created_at: string;
  /** ISO 8601。楽観的並行制御の照合キー。 */
  updated_at: string;
  activity: ActivityEntry[];
}
