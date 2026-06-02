import { useState } from 'react';
import { allowedTransitions, type Task } from '@handoff/shared';
import { BlockDialog } from './BlockDialog';
import { UnblockDialog } from './UnblockDialog';
import { HandoffDialog } from './HandoffDialog';
import { EditDialog } from './EditDialog';
import { DeleteDialog } from './DeleteDialog';
import { Icon } from './icons';
import {
  completeTask as defaultCompleteTask,
  transitionTask as defaultTransitionTask,
  type TransitionInput,
  type EditInput,
} from '../api-client';

/** 担当ドットの表示名（ADR-0004）。human は HUMAN、AI系は agent 値、未割当の AI系は AI。 */
function assigneeLabel(task: Task): string {
  if (task.owner === 'human') return 'HUMAN';
  return task.agent ? task.agent.toUpperCase() : 'AI';
}

interface CardProps {
  task: Task;
  /** 遷移成功時に更新後タスクを親へ通知する（Board→App でレーン移動に反映）。 */
  onTransitioned?: (task: Task) => void;
  /** アーカイブ成功時に対象タスクを親へ通知する（Board→App でボードから除去）。 */
  onArchived?: (task: Task) => void;
  /** 削除成功時に対象タスクを親へ通知する（Board→App でボードから除去）。 */
  onDeleted?: (task: Task) => void;
  /** テスト用に差し替え可能な遷移関数。ダイアログと直接遷移で使う。 */
  transitionTask?: (id: string, input: TransitionInput) => Promise<Task>;
  /** テスト用に差し替え可能な完了関数。既定は api-client.completeTask。 */
  completeTask?: (id: string) => Promise<Task>;
  /** テスト用に差し替え可能な編集関数。EditDialog へそのまま渡す。 */
  editTask?: (id: string, input: EditInput) => Promise<Task>;
  /** テスト用に差し替え可能な削除関数。DeleteDialog へそのまま渡す。 */
  deleteTask?: (id: string) => Promise<Task>;
}

/** 開いている遷移/編集/削除ダイアログの種別。 */
type OpenDialog = 'block' | 'unblock' | 'handoff' | 'edit' | 'delete' | null;

/** 1タスク=1カード。レーン遷移（着手/引き継ぎ/完了/ブロック/解除）と内容編集・アーカイブを持つ。 */
export function Card({
  task,
  onTransitioned,
  onArchived,
  onDeleted,
  transitionTask = defaultTransitionTask,
  completeTask = defaultCompleteTask,
  editTask,
  deleteTask,
}: CardProps) {
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [busy, setBusy] = useState(false);

  const transitions = allowedTransitions(task.status);
  const canStart = transitions.includes('in-progress'); // needs-* → in-progress
  const canComplete = transitions.includes('done'); // in-progress → done
  const canHandoff = task.status === 'in-progress'; // in-progress → needs-*（メモ必須）
  const canBlock = transitions.includes('blocked');
  const isBlocked = task.status === 'blocked';
  const isDone = task.status === 'done';

  function handleTransitioned(updated: Task): void {
    setDialog(null);
    onTransitioned?.(updated);
  }

  // メモ不要の直接遷移（着手 / 完了）。引き継ぎ・ブロックはダイアログでメモ/理由を取る。
  async function handleDirect(to: Task['status']): Promise<void> {
    setBusy(true);
    try {
      const updated = await transitionTask(task.id, { to, updated_at: task.updated_at });
      onTransitioned?.(updated);
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive(): Promise<void> {
    setBusy(true);
    try {
      const archived = await completeTask(task.id);
      onArchived?.(archived);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card" data-priority={task.priority}>
      {/* 1段目: priority・project・milestone・action_type を横詰め、担当ドットを右（ラベル無し）。 */}
      <div className="card__meta">
        <span className="card__priority" data-priority={task.priority}>
          {task.priority}
        </span>
        <span className="card__tagline">
          {task.project && <span className="card__chip">{task.project}</span>}
          {task.milestone && <span className="card__chip">{task.milestone}</span>}
          <span className="card__chip">{task.action_type.toUpperCase()}</span>
        </span>
        {isBlocked && (
          <span
            className="card__blocked"
            role="img"
            aria-label="ブロック中"
            title={task.blocked_reason ?? undefined}
          >
            ⛔
          </span>
        )}
        <span
          className="card__assignee"
          role="img"
          aria-label={`担当: ${assigneeLabel(task)}`}
          data-assignee={assigneeLabel(task)}
        >
          {assigneeLabel(task)}
        </span>
      </div>
      {/* 2段目: タイトル。 */}
      <h3 className="card__title">{task.title}</h3>
      <div className="card__actions">
        {canStart && (
          <button
            type="button"
            aria-label="着手"
            title="着手"
            disabled={busy}
            onClick={() => void handleDirect('in-progress')}
          >
            <Icon name="play" />
          </button>
        )}
        {canHandoff && (
          <button type="button" aria-label="引き継ぎ" title="引き継ぎ" onClick={() => setDialog('handoff')}>
            <Icon name="handoff" />
          </button>
        )}
        {canComplete && (
          <button
            type="button"
            aria-label="完了"
            title="完了"
            disabled={busy}
            onClick={() => void handleDirect('done')}
          >
            <Icon name="check" />
          </button>
        )}
        {canBlock && (
          <button type="button" aria-label="ブロック" title="ブロック" onClick={() => setDialog('block')}>
            <Icon name="ban" />
          </button>
        )}
        {isBlocked && (
          <button type="button" aria-label="解除" title="解除" onClick={() => setDialog('unblock')}>
            <Icon name="unlock" />
          </button>
        )}
        {isDone && (
          <button
            type="button"
            aria-label="アーカイブ"
            title="アーカイブ"
            disabled={busy}
            onClick={() => void handleArchive()}
          >
            <Icon name="archive" />
          </button>
        )}
        <button type="button" aria-label="編集" title="編集" onClick={() => setDialog('edit')}>
          <Icon name="pencil" />
        </button>
        <button type="button" aria-label="削除" title="削除" onClick={() => setDialog('delete')}>
          <Icon name="trash" />
        </button>
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
      {dialog === 'handoff' && (
        <HandoffDialog
          task={task}
          onClose={() => setDialog(null)}
          onTransitioned={handleTransitioned}
          transitionTask={transitionTask}
        />
      )}
      {dialog === 'edit' && (
        <EditDialog
          task={task}
          onClose={() => setDialog(null)}
          onEdited={handleTransitioned}
          editTask={editTask}
        />
      )}
      {dialog === 'delete' && (
        <DeleteDialog
          task={task}
          onClose={() => setDialog(null)}
          onDeleted={(deleted) => {
            setDialog(null);
            onDeleted?.(deleted);
          }}
          deleteTask={deleteTask}
        />
      )}
    </article>
  );
}
