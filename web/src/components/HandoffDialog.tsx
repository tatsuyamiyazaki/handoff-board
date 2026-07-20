import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Task } from '@handoff/shared';
import { transitionTask as defaultTransitionTask, type TransitionInput } from '../api-client';
import { TARGET_LABEL, type HandoffTarget } from '../lib/handoff-targets';
import { Icon } from './icons';

/** 引き継ぎ・差し戻し先（in-progress / in-review → needs-*）。in-review 復帰は UnblockDialog の責務。 */
const HANDOFF_TARGETS = ['needs-ai', 'needs-human'] as const satisfies readonly HandoffTarget[];
type NeedsTarget = (typeof HANDOFF_TARGETS)[number];

interface HandoffDialogProps {
  task: Task;
  onClose: () => void;
  onTransitioned: (task: Task) => void;
  /** テスト用に差し替え可能な遷移関数。既定は api-client.transitionTask。 */
  transitionTask?: (id: string, input: TransitionInput) => Promise<Task>;
}

/** 進行中タスクの引き継ぎ、またはレビュー中タスクの差し戻しを行うダイアログ。 */
export function HandoffDialog({
  task,
  onClose,
  onTransitioned,
  transitionTask = defaultTransitionTask,
}: HandoffDialogProps) {
  const [target, setTarget] = useState<NeedsTarget>('needs-ai');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isReviewSendback = task.status === 'in-review';
  const actionLabel = isReviewSendback ? '差し戻し' : '引き継ぎ';

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (note.trim().length === 0) {
      setError(`${actionLabel}メモを入力してください`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const updated = await transitionTask(task.id, {
        to: target,
        handoff_note: note,
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
        aria-label={isReviewSendback ? 'タスクを差し戻す' : 'タスクを引き継ぐ'}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="unblock-dialog__title">{actionLabel}</h2>

        {error && (
          <p role="alert" className="unblock-dialog__error">
            {error}
          </p>
        )}

        <label className="field">
          <span>{actionLabel}先</span>
          <select value={target} onChange={(e) => setTarget(e.target.value as NeedsTarget)}>
            {HANDOFF_TARGETS.map((t) => (
              <option key={t} value={t}>
                {TARGET_LABEL[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>{actionLabel}メモ</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        <div className="unblock-dialog__actions">
          <button type="button" aria-label="キャンセル" title="キャンセル" onClick={onClose}>
            <Icon name="x" />
          </button>
          <button
            type="submit"
            aria-label={isReviewSendback ? '差し戻す' : '引き継ぐ'}
            title={isReviewSendback ? '差し戻す' : '引き継ぐ'}
            disabled={submitting}
          >
            <Icon name="handoff" />
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
