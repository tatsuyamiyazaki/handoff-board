import type { Task } from '@handoff/shared';
import { Card } from './Card';

interface LaneProps {
  /** 表示・アクセシブル名を兼ねるレーン名（例: "To Do"）。 */
  label: string;
  /** このレーンに属するタスク（複数 status を統合する場合あり、ADR-0004 のボード要件）。 */
  tasks: Task[];
  /** 遷移成功時に更新後タスクを親へ通知（Card→Lane→Board 経由）。 */
  onTransitioned?: (task: Task) => void;
  /** アーカイブ成功時に対象タスクを親へ通知（Card→Lane→Board 経由）。 */
  onArchived?: (task: Task) => void;
  /** 削除成功時に対象タスクを親へ通知（Card→Lane→Board 経由）。 */
  onDeleted?: (task: Task) => void;
}

/** カンバンの縦の列。1つ以上の status をまとめた表示単位。 */
export function Lane({ label, tasks, onTransitioned, onArchived, onDeleted }: LaneProps) {
  return (
    <section className="lane" aria-label={label}>
      <header className="lane__header">
        <h2 className="lane__title">{label}</h2>
        <span className="lane__count" aria-label={`${label} の件数`}>
          {tasks.length}
        </span>
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
