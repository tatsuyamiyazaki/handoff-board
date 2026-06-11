import { useState, type FormEvent } from 'react';
import {
  OWNERS,
  PRIORITIES,
  INITIAL_STATUSES,
  isAiOwner,
  validateCreateTask,
  type Task,
  type Owner,
  type Priority,
  type InitialStatus,
  type Department,
  type Role,
} from '@handoff/shared';
import { createTask as defaultCreateTask } from '../api-client';
import { useLabelOptions } from '../lib/label-options';
import { DepartmentField } from './DepartmentField';
import { RoleField } from './RoleField';
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
  const [owner, setOwner] = useState<Owner>('cowork');
  const [priority, setPriority] = useState<Priority>('P2');
  const [handoffNote, setHandoffNote] = useState('');
  const [status, setStatus] = useState<InitialStatus>('needs-ai');
  const [project, setProject] = useState('');
  const [milestone, setMilestone] = useState('');
  const [department, setDepartment] = useState<Department | ''>('');
  const [role, setRole] = useState<Role | ''>('');
  const { projects, milestones } = useLabelOptions();

  const aiOwner = isAiOwner(owner);

  // owner を human にしたら AI 系メタデータ（department/role）をクリアする（ADR-0006 カスケード）。
  function handleOwnerChange(next: Owner): void {
    setOwner(next);
    if (!isAiOwner(next)) {
      setDepartment('');
      setRole('');
    }
  }

  // department を変えたら role をリセットする（部署に属さない role を残さない）。
  function handleDepartmentChange(next: Department | ''): void {
    setDepartment(next);
    setRole('');
  }

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
      // human のとき department は必ず null（ADR-0006 不変条件）。AI 系で未選択も null。
      department: aiOwner && department !== '' ? department : null,
      // role は department が選ばれているときのみ。未選択は null。
      role: aiOwner && department !== '' && role !== '' ? role : null,
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
          <select value={owner} onChange={(e) => handleOwnerChange(e.target.value as Owner)}>
            {OWNERS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>

        {aiOwner && <DepartmentField value={department} onChange={handleDepartmentChange} />}
        {aiOwner && department !== '' && (
          <RoleField department={department} value={role} onChange={setRole} />
        )}

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

        <label className="field">
          <span>プロジェクト</span>
          <input
            list="create-project-options"
            value={project}
            onChange={(e) => setProject(e.target.value)}
          />
          <datalist id="create-project-options">
            {projects.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>

        <label className="field">
          <span>マイルストーン</span>
          <input
            list="create-milestone-options"
            value={milestone}
            onChange={(e) => setMilestone(e.target.value)}
          />
          <datalist id="create-milestone-options">
            {milestones.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
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
