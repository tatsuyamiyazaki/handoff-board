import { useState } from 'react';
import { allowedTransitions, type Task } from '@handoff/shared';
import { BlockDialog } from './BlockDialog';
import { UnblockDialog } from './UnblockDialog';
import { completeTask as defaultCompleteTask, type TransitionInput } from '../api-client';

const OWNER_LABEL: Record<Task['owner'], string> = {
  human: '人間',
  'ai-batch': 'AI(バッチ)',
  'ai-interactive': 'AI(対話)',
};

interface CardProps {
  task: Task;
  /** 遷移成功時に更新後タスクを親へ通知する（Board→App でレーン移動に反映）。 */
  onTransitioned?: (task: Task) => void;
  /** アーカイブ成功時に対象タスクを親へ通知する（Board→App でボードから除去）。 */
  onArchived?: (task: Task) => void;
  /** テスト用に差し替え可能な遷移関数。ダイアログへそのまま渡す。 */
  transitionTask?: (id: string, input: TransitionInput) => Promise<Task>;
  /** テスト用に差し替え可能な完了関数。既定は api-client.completeTask。 */
  completeTask?: (id: string) => Promise<Task>;
}

/** 開いている遷移ダイアログの種別。 */
type OpenDialog = 'block' | 'unblock' | null;

/** 1タスク=1カード。#05 ブロック/解除、#06 done のアーカイブ操作を持つ。 */
export function Card({
  task,
  onTransitioned,
  onArchived,
  transitionTask,
  completeTask = defaultCompleteTask,
}: CardProps) {
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [archiving, setArchiving] = useState(false);

  const canBlock = allowedTransitions(task.status).includes('blocked');
  const isBlocked = task.status === 'blocked';
  const isDone = task.status === 'done';

  function handleTransitioned(updated: Task): void {
    setDialog(null);
    onTransitioned?.(updated);
  }

  async function handleArchive(): Promise<void> {
    setArchiving(true);
    try {
      const archived = await completeTask(task.id);
      onArchived?.(archived);
    } finally {
      setArchiving(false);
    }
  }

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
      {isBlocked && task.blocked_reason && (
        <p className="card__blocked-reason">⛔ {task.blocked_reason}</p>
      )}
      {task.tags.length > 0 && (
        <ul className="card__tags">
          {task.tags.map((tag) => (
            <li key={tag} className="card__tag">
              {tag}
            </li>
          ))}
        </ul>
      )}
      <div className="card__actions">
        {canBlock && (
          <button type="button" onClick={() => setDialog('block')}>
            ブロック
          </button>
        )}
        {isBlocked && (
          <button type="button" onClick={() => setDialog('unblock')}>
            解除
          </button>
        )}
        {isDone && (
          <button type="button" disabled={archiving} onClick={() => void handleArchive()}>
            アーカイブ
          </button>
        )}
      </div>

      {dialog === 'block' && (
        <BlockDialog
          task={task}
          onClose={() => setDialog(null)}
          onTransitioned={handleTransitioned}
          transitionTask={transitionTask}
        />
      )}
      {dialog === 'unblock' && (
        <UnblockDialog
          task={task}
          onClose={() => setDialog(null)}
          onTransitioned={handleTransitioned}
          transitionTask={transitionTask}
        />
      )}
    </article>
  );
}
