import { useState, type FormEvent } from 'react';
import {
  OWNERS,
  PRIORITIES,
  INITIAL_STATUSES,
  validateCreateTask,
  type Task,
  type Owner,
  type Priority,
  type InitialStatus,
  type Agent,
} from '@handoff/shared';
import { createTask as defaultCreateTask } from '../api-client';
import { AgentField } from './AgentField';
import { Icon } from './icons';

const STATUS_LABEL: Record<InitialStatus, string> = {
  'needs-ai': 'AI待ち',
  'needs-human': '人間待ち',
};

interface CreateTaskDialogProps {
  onClose: () => void;
  onCreated: (task: Task) => void;
  /** テスト用に差し替え可能な作成関数。既定は api-client.createTask。 */
  createTask?: (input: unknown) => Promise<Task>;
}

/** タスク作成ダイアログ。送信前に shared の validateCreateTask でクライアント検証する。 */
export function CreateTaskDialog({
  onClose,
  onCreated,
  createTask = defaultCreateTask,
}: CreateTaskDialogProps) {
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState<Owner>('ai-batch');
  const [priority, setPriority] = useState<Priority>('P2');
  const [handoffNote, setHandoffNote] = useState('');
  const [status, setStatus] = useState<InitialStatus>('needs-ai');
  const [project, setProject] = useState('');
  const [milestone, setMilestone] = useState('');
  const [agent, setAgent] = useState<Agent | ''>('');

  // ADR-0004: owner=human は agent を持てない。AI 系のときだけ担当 AI を選べる。
  const isAiOwner = owner !== 'human';
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const input = {
      title,
      owner,
      priority,
      handoff_note: handoffNote,
      status,
      project,
      milestone,
      // human のとき agent は必ず null（ADR-0004 不変条件）。AI 系で未選択も null。
      agent: isAiOwner && agent !== '' ? agent : null,
    };

    try {
      validateCreateTask(input); // クライアント側の早期検証（サーバーと同一ルール）。
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const task = await createTask(input);
      onCreated(task);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <form
        className="create-dialog"
        aria-label="タスクを作成"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="create-dialog__title">タスクを作成</h2>

        {error && (
          <p role="alert" className="create-dialog__error">
            {error}
          </p>
        )}

        <div className="create-dialog__fields">
        <label className="field">
          <span>タイトル</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <label className="field">
          <span>担当</span>
          <select value={owner} onChange={(e) => setOwner(e.target.value as Owner)}>
            {OWNERS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>優先度</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>初期ステータス</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as InitialStatus)}>
            {INITIAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>

        {isAiOwner && <AgentField value={agent} onChange={setAgent} />}

        <label className="field">
          <span>プロジェクト</span>
          <input value={project} onChange={(e) => setProject(e.target.value)} />
        </label>

        <label className="field">
          <span>マイルストーン</span>
          <input value={milestone} onChange={(e) => setMilestone(e.target.value)} />
        </label>

        <label className="field field--full">
          <span>引き継ぎメモ</span>
          <textarea value={handoffNote} onChange={(e) => setHandoffNote(e.target.value)} />
        </label>
        </div>

        <div className="create-dialog__actions">
          <button type="button" aria-label="キャンセル" title="キャンセル" onClick={onClose}>
            <Icon name="x" />
          </button>
          <button type="submit" aria-label="作成" title="作成" disabled={submitting}>
            <Icon name="plus" />
          </button>
        </div>
      </form>
    </div>
  );
}
