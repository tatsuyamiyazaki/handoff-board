import type { Task } from '@handoff/shared';

const OWNER_LABEL: Record<Task['owner'], string> = {
  human: '人間',
  'ai-batch': 'AI(バッチ)',
  'ai-interactive': 'AI(対話)',
};

/** 1タスク=1カード。タイトル・オーナー・優先度・action_type を示す（Story 2）。 */
export function Card({ task }: { task: Task }) {
  return (
    <article className="card" data-priority={task.priority}>
      <h3 className="card__title">{task.title}</h3>
      <dl className="card__meta">
        <div>
          <dt>owner</dt>
          <dd>{OWNER_LABEL[task.owner]}</dd>
        </div>
        <div>
          <dt>priority</dt>
          <dd className="card__priority">{task.priority}</dd>
        </div>
        <div>
          <dt>type</dt>
          <dd>{task.action_type}</dd>
        </div>
      </dl>
      {task.tags.length > 0 && (
        <ul className="card__tags">
          {task.tags.map((tag) => (
            <li key={tag} className="card__tag">
              {tag}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
