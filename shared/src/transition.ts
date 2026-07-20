// status 遷移エンジン（純関数・深いモジュール）。ADR-0002/0007 の遷移グラフを唯一の真実とする。
// needs-* ↔ in-progress → in-review → done。blocked は作業・レビューの中断と復帰を扱う。

import { ValidationError } from './create-task.js';
import type { ActivityEntry, ActorType, Status, Task } from './task.js';

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

/** applyTransition の副作用（時刻・実行者・認証種別・上限既定値）を注入する依存。 */
export interface TransitionDeps {
  now: () => string;
  actor: string;
  /** 認証種別（ADR-0001）。自己レビュー例外とリセット規定の判定に使う（ADR-0007）。 */
  actorType: ActorType;
  /** グローバル既定の差し戻し上限。task.review_cycle_limit が null のとき使う。 */
  reviewCycleLimit: number;
  /** 自己申告の X-Agent-Session。記録専用（ADR-0008）。 */
  session?: string | null;
}

/**
 * 許可される遷移グラフ（ADR-0002、ADR-0007 で amend）。done への唯一の入口は in-review。
 * blocked → in-review はレビュー中断からの復帰（再実装ループに落とさないための辺）。
 */
const ALLOWED_TRANSITIONS: Readonly<Record<Status, readonly Status[]>> = {
  'needs-ai': ['in-progress', 'blocked'],
  'needs-human': ['in-progress', 'blocked'],
  'in-progress': ['needs-ai', 'needs-human', 'in-review', 'blocked'],
  'in-review': ['done', 'needs-ai', 'needs-human', 'blocked'],
  done: [],
  blocked: ['needs-ai', 'needs-human', 'in-review'],
};

/** 指定 status から許可される遷移先の一覧（UI のボタン描画用）。 */
export function allowedTransitions(from: Status): Status[] {
  return [...ALLOWED_TRANSITIONS[from]];
}

/** activity を末尾から走査し、述語に合う最初のエントリを返す（配列コピーなし）。 */
function findLastEntry(
  activity: readonly ActivityEntry[],
  predicate: (entry: ActivityEntry) => boolean,
): ActivityEntry | undefined {
  for (let i = activity.length - 1; i >= 0; i--) {
    const entry = activity[i];
    if (predicate(entry)) return entry;
  }
  return undefined;
}

/** レビュー中断から blocked になったタスクが in-review へ復帰できるか。 */
export function canRecoverToReview(
  task: Pick<Task, 'status' | 'activity'>,
): boolean {
  if (task.status !== 'blocked') return false;

  // 非遷移エントリは from/to が null または欠落のどちらもありうる（task.ts の契約）ため、
  // 両方を除外して「最新の遷移エントリ」を特定する。
  const latestTransition = findLastEntry(
    task.activity,
    (entry) => entry.from != null && entry.to != null,
  );
  return latestTransition?.from === 'in-review' && latestTransition.to === 'blocked';
}

/** 引き継ぎ遷移（handoff_note 必須）か。needs-* に入る遷移はすべて note 必須（ADR-0007）。 */
export function isHandoff(from: Status, to: Status): boolean {
  return (
    (from === 'in-progress' || from === 'blocked' || from === 'in-review') &&
    (to === 'needs-ai' || to === 'needs-human')
  );
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

  assertReviewRecovery(task, input.to);

  const handoff = isHandoff(task.status, input.to);
  if (handoff && (input.handoff_note ?? '').trim().length === 0) {
    throw new ValidationError('引き継ぎ遷移には handoff_note が必須です');
  }

  const blocking = input.to === 'blocked';
  if (blocking && (input.blocked_reason ?? '').trim().length === 0) {
    throw new ValidationError('ブロックには blocked_reason が必須です');
  }

  // レビュー中断中（in-review 由来の blocked）は blocked 迂回でも in-review と同じ規則を適用する。
  // これを外すと in-review → blocked → needs-ai の迂回で上限と自己レビュー排除を素通りできてしまう。
  const isReviewing =
    task.status === 'in-review' || (task.status === 'blocked' && canRecoverToReview(task));

  assertNotSelfReview(task, input.to, deps, isReviewing);

  // 差し戻し上限は遷移前の値で判定し、拒否時はカウンタを変更しない（ADR-0007）。
  const isSendback = isReviewing && input.to === 'needs-ai';
  if (isSendback) {
    const limit = task.review_cycle_limit ?? deps.reviewCycleLimit;
    if (task.review_cycles >= limit) {
      throw new ValidationError(
        `差し戻し上限（${limit}回）に達しています。needs-human へエスカレーションしてください`,
      );
    }
  }

  // 人間によるレビュー外からの再投入は、新しいレビュー予算としてリセットする。
  // レビュー由来の差し戻し（in-review 直接・blocked 迂回とも）はリセットでなくインクリメント。
  const isHumanReinjection =
    input.to === 'needs-ai' && !isReviewing && deps.actorType === 'human';
  const review_cycles = isSendback
    ? task.review_cycles + 1
    : isHumanReinjection
      ? 0
      : task.review_cycles;

  const timestamp = deps.now();
  return {
    ...task,
    status: input.to,
    review_cycles,
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
      {
        timestamp,
        actor: deps.actor,
        action: `${task.status} → ${input.to}`,
        session: deps.session ?? null,
        from: task.status,
        to: input.to,
      },
    ],
  };
}

/** blocked → in-review は、レビュー中に blocked へ入ったタスクの復帰に限る。 */
function assertReviewRecovery(task: Task, to: Status): void {
  if (task.status !== 'blocked' || to !== 'in-review') return;
  if (canRecoverToReview(task)) return;

  throw new ValidationError('in-review に復帰できるのはレビュー中に blocked になったタスクのみです');
}

/**
 * 自己レビュー排除（ADR-0007）。レビュー中（in-review、およびレビュー中断中の blocked）から
 * done / needs-ai へ進める actor は、直近の構造化 in-progress → in-review を実行した actor と
 * 異なる必要がある。owner=human かつ現在の actor も human の場合だけ、自分の作業を自分で完了できる。
 * 構造化提出履歴がない旧データは判定不能として通す。
 */
function assertNotSelfReview(
  task: Task,
  to: Status,
  deps: TransitionDeps,
  isReviewing: boolean,
): void {
  if (!isReviewing) return;
  if (to !== 'done' && to !== 'needs-ai') return;

  const submitted = findLastEntry(
    task.activity,
    (entry) => entry.from === 'in-progress' && entry.to === 'in-review',
  );
  if (submitted === undefined || submitted.actor !== deps.actor) return;
  if (task.owner === 'human' && deps.actorType === 'human') return;

  throw new ValidationError('実装者と同一 actor はレビューを通せません（自己レビュー排除）');
}
