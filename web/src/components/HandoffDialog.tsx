import { useState, type FormEvent } from 'react';
import type { Task } from '@handoff/shared';
import { transitionTask as defaultTransitionTask, type TransitionInput } from '../api-client';

/** 引き継ぎ先（in-progress → needs-*）。 */
type HandoffTarget = 'needs-ai' | 'needs-human';

const TARGET_LABEL: Record<HandoffTarget, string> = {
  'needs-ai': 'AI待ち',
  'needs-human': '人間待ち',
};

interface HandoffDialogProps {
  task: Task;
  onClose: () => void;
  onTransitioned: (task: Task) => void;
  /** テスト用に差し替え可能な遷移関数。既定は api-client.transitionTask。 */
  transitionTask?: (id: string, input: TransitionInput) => Promise<Task>;
}

/** 進行中タスクを needs-* へ引き継ぐダイアログ。引き継ぎ先と handoff_note 必須で PATCH を送る（#04）。 */
export function HandoffDialog({
  task,
  onClose,
  onTransitioned,
  transitionTask = defaultTransitionTask,
}: HandoffDialogProps) {
  const [target, setTarget] = useState<HandoffTarget>('needs-ai');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (note.trim().length === 0) {
      setError('引き継ぎメモを入力してください');
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

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <form
        className="unblock-dialog"
        aria-label="タスクを引き継ぐ"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="unblock-dialog__title">引き継ぎ</h2>

        {error && (
          <p role="alert" className="unblock-dialog__error">
            {error}
          </p>
        )}

        <label className="field">
          <span>引き継ぎ先</span>
          <select value={target} onChange={(e) => setTarget(e.target.value as HandoffTarget)}>
            {(Object.keys(TARGET_LABEL) as HandoffTarget[]).map((t) => (
              <option key={t} value={t}>
                {TARGET_LABEL[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>引き継ぎメモ</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        <div className="unblock-dialog__actions">
          <button type="button" onClick={onClose}>
            キャンセル
          </button>
          <button type="submit" disabled={submitting}>
            引き継ぐ
          </button>
        </div>
      </form>
    </div>
  );
}
