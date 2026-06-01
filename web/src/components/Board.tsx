import { STATUSES, type Status, type Task } from '@handoff/shared';
import { Lane } from './Lane';

/** 5レーンのカンバン。タスクを status ごとに振り分けて表示する。 */
export function Board({ tasks }: { tasks: Task[] }) {
  const byStatus = (status: Status): Task[] => tasks.filter((t) => t.status === status);
  return (
    <div className="board">
      {STATUSES.map((status) => (
        <Lane key={status} status={status} tasks={byStatus(status)} />
      ))}
    </div>
  );
}
