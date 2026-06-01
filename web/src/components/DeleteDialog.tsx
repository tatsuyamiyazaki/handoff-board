import { useState } from 'react';
import type { Task } from '@handoff/shared';
import { deleteTask as defaultDeleteTask } from '../api-client';
import { Icon } from './icons';

interface DeleteDialogProps {
  task: Task;
  onClose: () => void;
  onDeleted: (task: Task) => void;
  /** テスト用に差し替え可能な削除関数。既定は api-client.deleteTask。 */
  deleteTask?: (id: string) => Promise<Task>;
}

/** カード削除の確認ダイアログ。破壊的操作なので確認を挟み、DELETE を送る。 */
export function DeleteDialog({
  task,
  onClose,
  onDeleted,
  deleteTask = defaultDeleteTask,
}: DeleteDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const deleted = await deleteTask(task.id);
      onDeleted(deleted);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="block-dialog"
        role="alertdialog"
        aria-label="タスクを削除"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="block-dialog__title">削除</h2>
        <p className="unblock-dialog__reason">
          「{task.title}」を削除します。この操作は元に戻せません。
        </p>

        {error && (
          <p role="alert" className="block-dialog__error">
            {error}
          </p>
        )}

        <div className="block-dialog__actions">
          <button type="button" aria-label="キャンセル" title="キャンセル" onClick={onClose}>
            <Icon name="x" />
          </button>
          <button
            type="button"
            aria-label="削除"
            title="削除"
            disabled={submitting}
            onClick={() => void handleDelete()}
          >
            <Icon name="trash" />
          </button>
        </div>
      </div>
    </div>
  );
}
