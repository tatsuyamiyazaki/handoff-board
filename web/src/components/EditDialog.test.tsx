import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Task } from '@handoff/shared';
import { EditDialog } from './EditDialog';
import { LabelOptionsProvider } from '../lib/label-options';

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: '元タイトル',
  status: 'in-progress',
  owner: 'cowork',
  priority: 'P2',
  action_type: 'other',
  handoff_note: '元メモ',
  blocked_reason: null,
  department: null,
  role: null,
  project: null,
  milestone: null,
  tags: ['old'],
  created_by: 'creator@example.com',
  created_by_type: 'human',
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
  activity: [],
  ...over,
});

describe('EditDialog', () => {
  it('AI 系タスクは department/role をプリフィルし、編集して送る（ADR-0006）', async () => {
    const editTask = vi.fn().mockResolvedValue(task());
    render(
      <EditDialog
        task={task({ owner: 'cowork', department: 'engineering', role: 'code-review' })}
        onClose={() => {}}
        onEdited={() => {}}
        editTask={editTask}
      />,
    );

    expect(screen.getByLabelText('AI部署')).toHaveValue('engineering');
    expect(screen.getByLabelText('ロール')).toHaveValue('code-review');
    fireEvent.change(screen.getByLabelText('ロール'), { target: { value: 'debug' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(editTask).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ department: 'engineering', role: 'debug' }),
      ),
    );
  });

  it('owner=human のタスクでは AI部署・ロール欄を表示しない', () => {
    render(
      <EditDialog
        task={task({ owner: 'human', department: null, role: null })}
        onClose={() => {}}
        onEdited={() => {}}
      />,
    );
    expect(screen.queryByLabelText('AI部署')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('ロール')).not.toBeInTheDocument();
  });

  it('現在値をプリフィルし、保存で editTask を updated_at 付きで呼ぶ', async () => {
    const updated = task({ title: '新タイトル' });
    const editTask = vi.fn().mockResolvedValue(updated);
    const onEdited = vi.fn();
    render(<EditDialog task={task()} onClose={() => {}} onEdited={onEdited} editTask={editTask} />);

    const titleInput = screen.getByDisplayValue('元タイトル');
    fireEvent.change(titleInput, { target: { value: '新タイトル' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(onEdited).toHaveBeenCalledWith(updated));
    expect(editTask).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ title: '新タイトル', updated_at: '2026-06-01T00:00:00.000Z' }),
    );
  });

  it('タイトルを空にして保存するとバリデーションエラーを表示し、editTask は呼ばれない', async () => {
    const editTask = vi.fn();
    render(<EditDialog task={task()} onClose={() => {}} onEdited={() => {}} editTask={editTask} />);

    fireEvent.change(screen.getByDisplayValue('元タイトル'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(editTask).not.toHaveBeenCalled();
  });

  it('project/milestone をプリフィルし、編集して送る（ADR-0004）', async () => {
    const editTask = vi.fn().mockResolvedValue(task());
    render(
      <EditDialog
        task={task({ project: '旧PJ', milestone: '旧MS' })}
        onClose={() => {}}
        onEdited={() => {}}
        editTask={editTask}
      />,
    );

    expect(screen.getByDisplayValue('旧PJ')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('マイルストーン'), { target: { value: 'v2' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(editTask).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ project: '旧PJ', milestone: 'v2' }),
      ),
    );
  });

  it('既存の project を datalist 候補としてサジェストする', () => {
    render(
      <LabelOptionsProvider value={{ projects: ['API刷新', 'ニュースレター'], milestones: ['v2'] }}>
        <EditDialog task={task()} onClose={() => {}} onEdited={() => {}} editTask={vi.fn()} />
      </LabelOptionsProvider>,
    );
    const projectInput = screen.getByLabelText('プロジェクト');
    const projectList = document.getElementById(projectInput.getAttribute('list') ?? '');
    expect(projectList?.querySelector('option[value="API刷新"]')).toBeInTheDocument();
  });

  it('タグはカンマ区切りを配列に正規化して送る', async () => {
    const editTask = vi.fn().mockResolvedValue(task());
    render(<EditDialog task={task()} onClose={() => {}} onEdited={() => {}} editTask={editTask} />);

    const tagsInput = screen.getByDisplayValue('old');
    fireEvent.change(tagsInput, { target: { value: 'a, b ,c' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(editTask).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ tags: ['a', 'b', 'c'] }),
      ),
    );
  });
});
