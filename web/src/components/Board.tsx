import type { Status, Task } from '@handoff/shared';
import { Lane } from './Lane';

/** カンバンのレーン定義（ADR-0004 のボード要件）。needs-* は To Do に統合。 */
interface LaneDef {
  label: string;
  statuses: Status[];
}

const LANES: LaneDef[] = [
  { label: 'To Do', statuses: ['needs-ai', 'needs-human'] },
  { label: 'In Progress', statuses: ['in-progress'] },
  { label: 'In Review', statuses: ['in-review'] },
  { label: 'Blocked', statuses: ['blocked'] },
  { label: 'Done', statuses: ['done'] },
];

interface BoardProps {
  tasks: Task[];
  /** 遷移成功時に更新後タスクを親へ通知（Card→Lane→Board 経由）。 */
  onTransitioned?: (task: Task) => void;
  /** アーカイブ成功時に対象タスクを親へ通知（Card→Lane→Board 経由）。 */
  onArchived?: (task: Task) => void;
  /** 削除成功時に対象タスクを親へ通知（Card→Lane→Board 経由）。 */
  onDeleted?: (task: Task) => void;
}

/** 5レーンのカンバン。タスクをレーン定義の status 群ごとに振り分けて表示する。 */
export function Board({ tasks, onTransitioned, onArchived, onDeleted }: BoardProps) {
  const inLane = (lane: LaneDef): Task[] =>
    tasks.filter((t) => lane.statuses.includes(t.status));
  return (
    <div className="board">
      {LANES.map((lane) => (
        <Lane
          key={lane.label}
          label={lane.label}
          tasks={inLane(lane)}
          onTransitioned={onTransitioned}
          onArchived={onArchived}
          onDeleted={onDeleted}
        />
      ))}
    </div>
  );
}
