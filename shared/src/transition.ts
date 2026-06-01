// status 遷移エンジン（純関数・深いモジュール）。ADR-0002 の遷移グラフを唯一の真実とする。
// #04: needs-* ↔ in-progress ↔ done。#05: blocked への出入り（理由必須・離脱時リセット）。

import { ValidationError } from './create-task.js';
import type { Status, Task } from './task.js';

/**
 * status 遷移の入力。
 * - 引き継ぎ遷移（in-progress→needs-* / blocked→needs-*）では handoff_note を伴う。
 * - → blocked では blocked_reason を伴う。
 */
export interface TransitionInput {
  to: Status;
  handoff_note?: string;
  blocked_reason?: string;
}

/** applyTransition の副作用（時刻・実行者）を注入する依存。 */
export interface TransitionDeps {
  now: () => string;
  actor: string;
}

/**
 * 許可される遷移グラフ（ADR-0002）。needs-* ↔ in-progress ↔ done に加え、
 * #05 で (needs-* / in-progress) → blocked と blocked → needs-* を追加。done は終端（出口なし）。
 */
const ALLOWED_TRANSITIONS: Readonly<Record<Status, readonly Status[]>> = {
  'needs-ai': ['in-progress', 'blocked'],
  'needs-human': ['in-progress', 'blocked'],
  'in-progress': ['needs-ai', 'needs-human', 'done', 'blocked'],
  done: [],
  blocked: ['needs-ai', 'needs-human'],
};

/** 指定 status から許可される遷移先の一覧（UI のボタン描画用）。 */
export function allowedTransitions(from: Status): Status[] {
  return [...ALLOWED_TRANSITIONS[from]];
}

/** 引き継ぎ遷移（handoff_note 必須）か。in-progress→needs-* と blocked→needs-*（解除）。 */
export function isHandoff(from: Status, to: Status): boolean {
  return (from === 'in-progress' || from === 'blocked') && (to === 'needs-ai' || to === 'needs-human');
}

/**
 * task.status から input.to への遷移を検証し、成功すれば更新済みの新 Task を返す。
 * 不正な辺・handoff_note 欠落・blocked_reason 欠落は ValidationError(422)。owner は変更しない。
 * → blocked では blocked_reason をセット、blocked 離脱時は blocked_reason を null にリセットする。
 */
export function applyTransition(
  task: Task,
  input: TransitionInput,
  deps: TransitionDeps,
): Task {
  if (!ALLOWED_TRANSITIONS[task.status].includes(input.to)) {
    throw new ValidationError(`遷移不可: ${task.status} → ${input.to}`);
  }

  const handoff = isHandoff(task.status, input.to);
  if (handoff && (input.handoff_note ?? '').trim().length === 0) {
    throw new ValidationError('引き継ぎ遷移には handoff_note が必須です');
  }

  const blocking = input.to === 'blocked';
  if (blocking && (input.blocked_reason ?? '').trim().length === 0) {
    throw new ValidationError('ブロックには blocked_reason が必須です');
  }

  const timestamp = deps.now();
  return {
    ...task,
    status: input.to,
    handoff_note: handoff ? (input.handoff_note as string) : task.handoff_note,
    // → blocked: 理由をセット。blocked 離脱（解除）: null にリセット。それ以外は不変。
    blocked_reason: blocking
      ? (input.blocked_reason as string)
      : task.status === 'blocked'
        ? null
        : task.blocked_reason,
    updated_at: timestamp,
    activity: [
      ...task.activity,
      { timestamp, actor: deps.actor, action: `${task.status} → ${input.to}` },
    ],
  };
}
