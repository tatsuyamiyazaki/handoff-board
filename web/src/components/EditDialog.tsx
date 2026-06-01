import { useState, type FormEvent } from 'react';
import {
  OWNERS,
  PRIORITIES,
  ACTION_TYPES,
  validateEditTask,
  type Task,
  type Owner,
  type Priority,
  type ActionType,
  type Agent,
} from '@handoff/shared';
import { editTask as defaultEditTask, type EditInput } from '../api-client';
import { AgentField } from './AgentField';
import { Icon } from './icons';

interface EditDialogProps {
  task: Task;
  onClose: () => void;
  onEdited: (task: Task) => void;
  /** テスト用に差し替え可能な編集関数。既定は api-client.editTask。 */
  editTask?: (id: string, input: EditInput) => Promise<Task>;
}

/** タスク内容（title/owner/priority/action_type/handoff_note/tags）の編集ダイアログ。status は変えない。 */
export function EditDialog({
  task,
  onClose,
  onEdited,
  editTask = defaultEditTask,
}: EditDialogProps) {
  const [title, setTitle] = useState(task.title);
  const [owner, setOwner] = useState<Owner>(task.owner);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [actionType, setActionType] = useState<ActionType>(task.action_type);
  const [handoffNote, setHandoffNote] = useState(task.handoff_note);
  const [tagsText, setTagsText] = useState(task.tags.join(', '));
  const [project, setProject] = useState(task.project ?? '');
  const [milestone, setMilestone] = useState(task.milestone ?? '');
  const [agent, setAgent] = useState<Agent | ''>(task.agent ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ADR-0004: owner=human は agent を持てない。AI 系のときだけ担当 AI を編集できる。
  const isAiOwner = owner !== 'human';

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const input = {
      title,
      owner,
      priority,
      action_type: actionType,
      handoff_note: handoffNote,
      tags,
      project,
      milestone,
      // human のとき agent は必ず null（ADR-0004 不変条件）。AI 系で未選択も null。
      agent: isAiOwner && agent !== '' ? agent : null,
    };

    try {
      validateEditTask(input); // クライアント側の早期検証（サーバーと同一ルール）。
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const updated = await editTask(task.id, { ...input, updated_at: task.updated_at });
      onEdited(updated);
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
        aria-label="タスクを編集"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="create-dialog__title">タスクを編集</h2>

        {error && (
          <p role="alert" className="create-dialog__error">
            {error}
          </p>
        )}

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
          <span>種別</span>
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value as ActionType)}
          >
            {ACTION_TYPES.map((a) => (
              <option key={a} value={a}>
                {a}
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

        <label className="field">
          <span>引き継ぎメモ</span>
          <textarea value={handoffNote} onChange={(e) => setHandoffNote(e.target.value)} />
        </label>

        <label className="field">
          <span>タグ（カンマ区切り）</span>
          <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
        </label>

        <div className="create-dialog__actions">
          <button type="button" aria-label="キャンセル" title="キャンセル" onClick={onClose}>
            <Icon name="x" />
          </button>
          <button type="submit" aria-label="保存" title="保存" disabled={submitting}>
            <Icon name="check" />
          </button>
        </div>
      </form>
    </div>
  );
}
