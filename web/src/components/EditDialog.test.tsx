import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Task } from '@handoff/shared';
import { EditDialog } from './EditDialog';

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: '元タイトル',
  status: 'in-progress',
  owner: 'ai-batch',
  priority: 'P2',
  action_type: 'other',
  handoff_note: '元メモ',
  blocked_reason: null,
  tags: ['old'],
  created_by: 'creator@example.com',
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
  activity: [],
  ...over,
});

describe('EditDialog', () => {
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
