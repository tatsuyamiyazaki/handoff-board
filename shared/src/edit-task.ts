// タスク内容の編集（純粋・深いモジュール）。status は変えない（遷移は transition.ts の責務）。
// 編集対象: title / owner / priority / action_type / handoff_note / tags。
// created_at / created_by / id / status / blocked_reason は不変。

import { ValidationError } from './create-task.js';
import {
  OWNERS,
  PRIORITIES,
  ACTION_TYPES,
  type Task,
  type Owner,
  type Priority,
  type ActionType,
} from './task.js';

/** 検証・既定値適用済みの編集ペイロード（status は含まない）。 */
export interface NormalizedEdit {
  title: string;
  owner: Owner;
  priority: Priority;
  action_type: ActionType;
  handoff_note: string;
  tags: string[];
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

/**
 * 編集入力を検証し、既定値を適用した NormalizedEdit を返す。違反は ValidationError(422)。
 * - title/handoff_note 必須、owner は有効値必須。
 * - priority/action_type/tags は省略時に既定値（P2/other/[]）、指定時は値域検証。
 */
export function validateEditTask(input: unknown): NormalizedEdit {
  const body = asRecord(input);

  const title = requireNonEmptyString(body.title, 'title');
  const handoff_note = requireNonEmptyString(body.handoff_note, 'handoff_note');

  if (!OWNERS.includes(body.owner as Owner)) {
    throw new ValidationError('owner is required and must be a valid owner');
  }
  const owner = body.owner as Owner;

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

  return { title, owner, priority, action_type, handoff_note, tags };
}

/** applyEdit の副作用（時刻・実行者）を注入する依存。 */
export interface EditTaskDeps {
  now: () => string;
  actor: string;
}

/**
 * NormalizedEdit を task に適用した新しい Task を返す。
 * status / blocked_reason / created_at / created_by / id は維持し、
 * updated_at を更新して edited の activity を1件付与する。
 */
export function applyEdit(task: Task, normalized: NormalizedEdit, deps: EditTaskDeps): Task {
  const timestamp = deps.now();
  return {
    ...task,
    title: normalized.title,
    owner: normalized.owner,
    priority: normalized.priority,
    action_type: normalized.action_type,
    handoff_note: normalized.handoff_note,
    tags: normalized.tags,
    updated_at: timestamp,
    activity: [...task.activity, { timestamp, actor: deps.actor, action: 'edited' }],
  };
}
