import type { Status, Task } from '@handoff/shared';
import { Card } from './Card';

const STATUS_LABEL: Record<Status, string> = {
  'needs-ai': 'AI待ち',
  'needs-human': '人間待ち',
  'in-progress': '進行中',
  done: '完了',
  blocked: 'ブロック',
};

/** カンバンの縦の列。status の値と1対1（CONTEXT.md）。 */
export function Lane({ status, tasks }: { status: Status; tasks: Task[] }) {
  return (
    <section className="lane" aria-label={status} data-status={status}>
      <header className="lane__header">
        <h2 className="lane__title">{STATUS_LABEL[status]}</h2>
        <span className="lane__status">{status}</span>
      </header>
      <ul className="lane__cards">
        {tasks.map((task) => (
          <li key={task.id}>
            <Card task={task} />
          </li>
        ))}
      </ul>
    </section>
  );
}
