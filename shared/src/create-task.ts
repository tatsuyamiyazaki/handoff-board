// タスク作成の検証と組み立て（純粋・深いモジュール）。docs/issues/03 の作成コントラクト。
// title/owner/handoff_note 必須、初期 status は needs-ai|needs-human のみ、既定値 P2/other/[]。

import {
  OWNERS,
  PRIORITIES,
  ACTION_TYPES,
  AGENTS,
  type Task,
  type Owner,
  type Priority,
  type ActionType,
  type Agent,
} from './task.js';

/** 入力検証の失敗。HTTP 422 に対応。 */
export class ValidationError extends Error {
  readonly status = 422 as const;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** 作成時に許可される初期 status。 */
export const INITIAL_STATUSES = ['needs-ai', 'needs-human'] as const;
export type InitialStatus = (typeof INITIAL_STATUSES)[number];

/** 検証・既定値適用済みの作成ペイロード。 */
export interface NormalizedCreate {
  title: string;
  owner: Owner;
  handoff_note: string;
  status: InitialStatus;
  priority: Priority;
  action_type: ActionType;
  tags: string[];
  agent: Agent | null;
  project: string | null;
  milestone: string | null;
}

function asRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new ValidationError('request body must be an object');
  }
  return input as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${field} is required`);
  }
  return value;
}

/** 任意文字列フィールド（project/milestone）の正規化。空白のみ・未指定は null（trim 済みを返す）。 */
export function normalizeOptionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * agent の正規化（ADR-0004）。owner=human のときは agent を持てない（指定で 422）。
 * AI 系 owner のときのみ有効な Agent を許可し、未指定は null。
 */
export function normalizeAgent(value: unknown, owner: Owner): Agent | null {
  if (value === undefined || value === null) return null;
  if (owner === 'human') {
    throw new ValidationError('agent must be null when owner is human');
  }
  if (!AGENTS.includes(value as Agent)) {
    throw new ValidationError('agent must be a valid agent');
  }
  return value as Agent;
}

/**
 * 作成入力を検証し、既定値を適用した NormalizedCreate を返す。違反は ValidationError(422)。
 * - title/owner/handoff_note 必須、status は needs-ai|needs-human のみ。
 * - priority/action_type/tags は省略時に既定値、指定時は値域を検証。
 */
export function validateCreateTask(input: unknown): NormalizedCreate {
  const body = asRecord(input);

  const title = requireNonEmptyString(body.title, 'title');
  const handoff_note = requireNonEmptyString(body.handoff_note, 'handoff_note');

  if (!OWNERS.includes(body.owner as Owner)) {
    throw new ValidationError('owner is required and must be a valid owner');
  }
  const owner = body.owner as Owner;

  if (!INITIAL_STATUSES.includes(body.status as InitialStatus)) {
    throw new ValidationError('status must be one of needs-ai, needs-human');
  }
  const status = body.status as InitialStatus;

  const priority = body.priority === undefined ? 'P2' : (body.priority as Priority);
  if (!PRIORITIES.includes(priority)) {
    throw new ValidationError('priority must be a valid priority');
  }

  const action_type =
    body.action_type === undefined ? 'other' : (body.action_type as ActionType);
  if (!ACTION_TYPES.includes(action_type)) {
    throw new ValidationError('action_type must be a valid action type');
  }

  let tags: string[];
  if (body.tags === undefined) {
    tags = [];
  } else if (Array.isArray(body.tags) && body.tags.every((t) => typeof t === 'string')) {
    tags = body.tags as string[];
  } else {
    throw new ValidationError('tags must be an array of strings');
  }

  const agent = normalizeAgent(body.agent, owner);
  const project = normalizeOptionalString(body.project, 'project');
  const milestone = normalizeOptionalString(body.milestone, 'milestone');

  return { title, owner, handoff_note, status, priority, action_type, tags, agent, project, milestone };
}

/** buildTask の副作用（ID・時刻・操作主体）を注入する依存。 */
export interface BuildTaskDeps {
  id: () => string;
  now: () => string;
  actor: string;
}

/** NormalizedCreate から Task を生成。created_at/updated_at と created の activity を付与。 */
export function buildTask(normalized: NormalizedCreate, deps: BuildTaskDeps): Task {
  const timestamp = deps.now();
  return {
    id: deps.id(),
    title: normalized.title,
    status: normalized.status,
    owner: normalized.owner,
    priority: normalized.priority,
    action_type: normalized.action_type,
    handoff_note: normalized.handoff_note,
    blocked_reason: null,
    tags: normalized.tags,
    agent: normalized.agent,
    project: normalized.project,
    milestone: normalized.milestone,
    created_by: deps.actor,
    created_at: timestamp,
    updated_at: timestamp,
    activity: [{ timestamp, actor: deps.actor, action: 'created' }],
  };
}
