import type { Department, Owner, Task } from '@handoff/shared';

/** ボード上部に出すサマリ件数（ADR-0004 のレイアウト要件）。 */
export interface BoardSummary {
  /** owner=human のタスク数（人間にアサイン中）。 */
  humanAssigned: number;
  /** status=in-progress のタスク数。 */
  inProgress: number;
  /** status=blocked のタスク数。 */
  blocked: number;
}

/** タスク一覧からサマリ件数を集計する。 */
export function summarizeBoard(tasks: Task[]): BoardSummary {
  return {
    humanAssigned: tasks.filter((t) => t.owner === 'human').length,
    inProgress: tasks.filter((t) => t.status === 'in-progress').length,
    blocked: tasks.filter((t) => t.status === 'blocked').length,
  };
}

/** フィルタ「すべて」を表すセンチネル。各軸の未選択状態。 */
export const ALL = 'all' as const;
export type All = typeof ALL;

/** ボードの絞り込み条件（ADR-0006）。各軸 ALL で無効化。 */
export interface BoardFilter {
  owner: Owner | All;
  department: Department | All;
  project: string | All;
  milestone: string | All;
}

/** owner/department/project/milestone を AND で絞り込む。各軸が ALL なら無視。 */
export function filterTasks(tasks: Task[], filter: BoardFilter): Task[] {
  return tasks.filter((t) => {
    if (filter.owner !== ALL && t.owner !== filter.owner) return false;
    if (filter.department !== ALL && t.department !== filter.department) return false;
    if (filter.project !== ALL && t.project !== filter.project) return false;
    if (filter.milestone !== ALL && t.milestone !== filter.milestone) return false;
    return true;
  });
}

/** project/milestone の非 null な値を重複なく昇順で返す（フィルタ選択肢用）。 */
export function distinctValues(tasks: Task[], key: 'project' | 'milestone'): string[] {
  const set = new Set<string>();
  for (const t of tasks) {
    const value = t[key];
    if (value !== null) set.add(value);
  }
  return [...set].sort();
}
