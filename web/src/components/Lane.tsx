import type { Status, Task } from '@handoff/shared';
import { Card } from './Card';

const STATUS_LABEL: Record<Status, string> = {
  'needs-ai': 'AI待ち',
  'needs-human': '人間待ち',
  'in-progress': '進行中',
  done: '完了',
  blocked: 'ブロック',
};

interface LaneProps {
  status: Status;
  tasks: Task[];
  /** 遷移成功時に更新後タスクを親へ通知（Card→Lane→Board 経由）。 */
  onTransitioned?: (task: Task) => void;
  /** アーカイブ成功時に対象タスクを親へ通知（Card→Lane→Board 経由）。 */
  onArchived?: (task: Task) => void;
  /** 削除成功時に対象タスクを親へ通知（Card→Lane→Board 経由）。 */
  onDeleted?: (task: Task) => void;
}

/** カンバンの縦の列。status の値と1対1（CONTEXT.md）。 */
export function Lane({ status, tasks, onTransitioned, onArchived, onDeleted }: LaneProps) {
  return (
    <section className="lane" aria-label={status} data-status={status}>
      <header className="lane__header">
        <h2 className="lane__title">{STATUS_LABEL[status]}</h2>
        <span className="lane__count" aria-label={`${status} の件数`}>
          {tasks.length}
        </span>
        <span className="lane__status">{status}</span>
      </header>
      <ul className="lane__cards">
        {tasks.map((task) => (
          <li key={task.id}>
            <Card
              task={task}
              onTransitioned={onTransitioned}
              onArchived={onArchived}
              onDeleted={onDeleted}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
