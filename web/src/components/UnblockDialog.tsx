import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { canRecoverToReview, type Task } from '@handoff/shared';
import { transitionTask as defaultTransitionTask, type TransitionInput } from '../api-client';
import { TARGET_LABEL, type HandoffTarget } from '../lib/handoff-targets';
import { Icon } from './icons';

interface UnblockDialogProps {
  task: Task;
  onClose: () => void;
  onTransitioned: (task: Task) => void;
  /** テスト用に差し替え可能な遷移関数。既定は api-client.transitionTask。 */
  transitionTask?: (id: string, input: TransitionInput) => Promise<Task>;
}

/** ブロックを解除するダイアログ。needs-* への引き継ぎ時のみ handoff_note 必須で PATCH を送る（#05）。 */
export function UnblockDialog({
  task,
  onClose,
  onTransitioned,
  transitionTask = defaultTransitionTask,
}: UnblockDialogProps) {
  const [target, setTarget] = useState<HandoffTarget>('needs-human');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const targets = (Object.keys(TARGET_LABEL) as HandoffTarget[]).filter(
    (candidate) => candidate !== 'in-review' || canRecoverToReview(task),
  );

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const isHandoffTarget = target !== 'in-review';
    if (isHandoffTarget && note.trim().length === 0) {
      setError('引き継ぎメモを入力してください');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const updated = await transitionTask(task.id, {
        to: target,
        ...(isHandoffTarget ? { handoff_note: note } : {}),
        updated_at: task.updated_at,
      });
      onTransitioned(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <form
        className="unblock-dialog"
        aria-label="ブロックを解除"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="unblock-dialog__title">ブロック解除</h2>

        {task.blocked_reason && (
          <p className="unblock-dialog__reason">ブロック理由: {task.blocked_reason}</p>
        )}

        {error && (
          <p role="alert" className="unblock-dialog__error">
            {error}
          </p>
        )}

        <label className="field">
          <span>引き継ぎ先</span>
          <select value={target} onChange={(e) => setTarget(e.target.value as HandoffTarget)}>
            {targets.map((t) => (
              <option key={t} value={t}>
                {TARGET_LABEL[t]}
              </option>
            ))}
          </select>
        </label>

        {target !== 'in-review' && (
          <label className="field">
            <span>引き継ぎメモ</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        )}

        <div className="unblock-dialog__actions">
          <button type="button" aria-label="キャンセル" title="キャンセル" onClick={onClose}>
            <Icon name="x" />
          </button>
          <button type="submit" aria-label="解除" title="解除" disabled={submitting}>
            <Icon name="unlock" />
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
