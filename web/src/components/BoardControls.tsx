import { OWNERS, type Owner, type Task } from '@handoff/shared';
import { summarizeBoard, distinctValues, ALL, type BoardFilter } from '../lib/board-view';

interface BoardControlsProps {
  /** 集計・選択肢の元になる全タスク（フィルタ前）。 */
  tasks: Task[];
  filter: BoardFilter;
  onFilterChange: (filter: BoardFilter) => void;
}

/** ボード上部のサマリ件数とフィルタ操作（ADR-0004 のレイアウト要件）。 */
export function BoardControls({ tasks, filter, onFilterChange }: BoardControlsProps) {
  const summary = summarizeBoard(tasks);
  const projects = distinctValues(tasks, 'project');
  const milestones = distinctValues(tasks, 'milestone');

  return (
    <section className="board-controls" aria-label="ボードの概要とフィルタ">
      <dl className="board-summary">
        <div className="stat" aria-label="人間アサイン">
          <dt className="stat__label">人間アサイン</dt>
          <dd className="stat__value">{summary.humanAssigned}</dd>
        </div>
        <div className="stat" aria-label="進行中">
          <dt className="stat__label">進行中</dt>
          <dd className="stat__value">{summary.inProgress}</dd>
        </div>
        <div className="stat" aria-label="ブロック">
          <dt className="stat__label">ブロック</dt>
          <dd className="stat__value">{summary.blocked}</dd>
        </div>
      </dl>

      <div className="board-filters">
        <label className="field">
          <span>オーナー</span>
          <select
            value={filter.owner}
            onChange={(e) => onFilterChange({ ...filter, owner: e.target.value as Owner | typeof ALL })}
          >
            <option value={ALL}>すべて</option>
            {OWNERS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>プロジェクト</span>
          <select
            value={filter.project}
            onChange={(e) => onFilterChange({ ...filter, project: e.target.value })}
          >
            <option value={ALL}>すべて</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>マイルストーン</span>
          <select
            value={filter.milestone}
            onChange={(e) => onFilterChange({ ...filter, milestone: e.target.value })}
          >
            <option value={ALL}>すべて</option>
            {milestones.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
