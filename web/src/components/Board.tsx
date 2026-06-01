import { STATUSES, type Status, type Task } from '@handoff/shared';
import { Lane } from './Lane';

interface BoardProps {
  tasks: Task[];
  /** 遷移成功時に更新後タスクを親へ通知（Card→Lane→Board 経由）。 */
  onTransitioned?: (task: Task) => void;
  /** アーカイブ成功時に対象タスクを親へ通知（Card→Lane→Board 経由）。 */
  onArchived?: (task: Task) => void;
}

/** 5レーンのカンバン。タスクを status ごとに振り分けて表示する。 */
export function Board({ tasks, onTransitioned, onArchived }: BoardProps) {
  const byStatus = (status: Status): Task[] => tasks.filter((t) => t.status === status);
  return (
    <div className="board">
      {STATUSES.map((status) => (
        <Lane
          key={status}
          status={status}
          tasks={byStatus(status)}
          onTransitioned={onTransitioned}
          onArchived={onArchived}
        />
      ))}
    </div>
  );
}
