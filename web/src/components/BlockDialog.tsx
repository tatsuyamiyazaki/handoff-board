import { useState, type FormEvent } from 'react';
import type { Task } from '@handoff/shared';
import { transitionTask as defaultTransitionTask, type TransitionInput } from '../api-client';

interface BlockDialogProps {
  task: Task;
  onClose: () => void;
  onTransitioned: (task: Task) => void;
  /** テスト用に差し替え可能な遷移関数。既定は api-client.transitionTask。 */
  transitionTask?: (id: string, input: TransitionInput) => Promise<Task>;
}

/** タスクをブロックするダイアログ。理由（blocked_reason）必須で PATCH を送る（#05）。 */
export function BlockDialog({
  task,
  onClose,
  onTransitioned,
  transitionTask = defaultTransitionTask,
}: BlockDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (reason.trim().length === 0) {
      setError('ブロック理由を入力してください');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const updated = await transitionTask(task.id, {
        to: 'blocked',
        blocked_reason: reason,
        updated_at: task.updated_at,
      });
      onTransitioned(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <form
        className="block-dialog"
        aria-label="タスクをブロック"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="block-dialog__title">ブロック</h2>

        {error && (
          <p role="alert" className="block-dialog__error">
            {error}
          </p>
        )}

        <label className="field">
          <span>ブロック理由</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>

        <div className="block-dialog__actions">
          <button type="button" onClick={onClose}>
            キャンセル
          </button>
          <button type="submit" disabled={submitting}>
            ブロック
          </button>
        </div>
      </form>
    </div>
  );
}
