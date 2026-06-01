// status 遷移エンジン（純関数・深いモジュール）。ADR-0002 の遷移グラフを唯一の真実とする。
// #04 スコープ: needs-* ↔ in-progress ↔ done。blocked 関連の辺は #05 で追加する。

import { ValidationError } from './create-task.js';
import type { Status, Task } from './task.js';

/** status 遷移の入力。引き継ぎ遷移では handoff_note を伴う。 */
export interface TransitionInput {
  to: Status;
  handoff_note?: string;
}

/** applyTransition の副作用（時刻・実行者）を注入する依存。 */
export interface TransitionDeps {
  now: () => string;
  actor: string;
}

/**
 * 許可される遷移グラフ（ADR-0002）。#04 スコープ＝ needs-* ↔ in-progress ↔ done。
 * blocked 関連の辺は #05 で追加する。done は終端（出口なし）。
 */
const ALLOWED_TRANSITIONS: Readonly<Record<Status, readonly Status[]>> = {
  'needs-ai': ['in-progress'],
  'needs-human': ['in-progress'],
  'in-progress': ['needs-ai', 'needs-human', 'done'],
  done: [],
  blocked: [],
};

/** 指定 status から許可される遷移先の一覧（UI のボタン描画用）。 */
export function allowedTransitions(from: Status): Status[] {
  return [...ALLOWED_TRANSITIONS[from]];
}

/** 引き継ぎ遷移（handoff_note 必須）か。#04 では in-progress → needs-*。blocked→needs-* は #05。 */
export function isHandoff(from: Status, to: Status): boolean {
  return from === 'in-progress' && (to === 'needs-ai' || to === 'needs-human');
}

/**
 * task.status から input.to への遷移を検証し、成功すれば更新済みの新 Task を返す。
 * 不正な辺や handoff_note 欠落は ValidationError(422)。owner は変更しない。
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

  const timestamp = deps.now();
  return {
    ...task,
    status: input.to,
    handoff_note: handoff ? (input.handoff_note as string) : task.handoff_note,
    updated_at: timestamp,
    activity: [
      ...task.activity,
      { timestamp, actor: deps.actor, action: `${task.status} → ${input.to}` },
    ],
  };
}
