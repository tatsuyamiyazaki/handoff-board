// ディスパッチャーの純ロジック（副作用なし・テスト主対象）。
// API から取得したボードスナップショットに対して対象選定と stale 掃引を行う（issue #07）。

import { PRIORITIES, type Task } from '@handoff/shared';

/** このタグが付いたタスクはディスパッチャーの自動処理対象から除外する。 */
export const DISPATCHER_LOCK_TAG = 'dispatcher-lock';

/** stale 判定の既定しきい値（時間）。status 無変更がこれを超えたら blocked 候補。 */
export const DEFAULT_STALE_HOURS = 72;

/** priority の優先度インデックス（P0 が最優先＝0）。 */
function priorityRank(task: Task): number {
  return PRIORITIES.indexOf(task.priority);
}

/**
 * 次に処理すべきタスクを1件選ぶ。
 * needs-ai かつ ai-batch を抽出し、dispatcher-lock タグを除外、
 * priority 昇順（P0→P3）→ 同値は created_at 昇順（古い順）でソートし先頭を返す。
 * 対象が無ければ null（安全に何もしない）。
 */
export function selectNextTask(tasks: Task[]): Task | null {
  const candidates = tasks
    .filter(
      (t) =>
        t.status === 'needs-ai' &&
        t.owner === 'ai-batch' &&
        !t.tags.includes(DISPATCHER_LOCK_TAG),
    )
    .sort((a, b) => priorityRank(a) - priorityRank(b) || a.created_at.localeCompare(b.created_at));

  return candidates[0] ?? null;
}

/** 掃引対象となる「進行中」status（done / blocked は対象外）。 */
const ACTIVE_STATUSES: ReadonlySet<Task['status']> = new Set([
  'needs-ai',
  'needs-human',
  'in-progress',
]);

/**
 * status が thresholdHours を超えて無変更（updated_at が古い）の active タスクを返す。
 * 返ったタスクは blocked へ遷移させる候補（runner が PATCH する）。
 * done / blocked は対象外。境界（ちょうど閾値）は stale としない。
 */
export function findStaleTasks(
  tasks: Task[],
  now: string,
  thresholdHours: number = DEFAULT_STALE_HOURS,
): Task[] {
  const cutoff = new Date(now).getTime() - thresholdHours * 60 * 60 * 1000;
  return tasks.filter(
    (t) => ACTIVE_STATUSES.has(t.status) && new Date(t.updated_at).getTime() < cutoff,
  );
}
