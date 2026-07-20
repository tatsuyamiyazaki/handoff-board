import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Task } from '@handoff/shared';
import { DeleteDialog } from './DeleteDialog';

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: '消すタスク',
  status: 'needs-ai',
  owner: 'cowork',
  priority: 'P2',
  action_type: 'other',
  handoff_note: '',
  blocked_reason: null,
  department: null,
  role: null,
  project: null,
  milestone: null,
  tags: [],
  created_by: 'creator@example.com',
  created_by_type: 'human',
  review_cycles: 0,
  review_cycle_limit: null,
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
  activity: [],
  ...over,
});

describe('DeleteDialog', () => {
  it('タイトルを示し、削除で deleteTask を呼び onDeleted に渡す', async () => {
    const deleted = task();
    const deleteTask = vi.fn().mockResolvedValue(deleted);
    const onDeleted = vi.fn();
    render(
      <DeleteDialog task={task()} onClose={() => {}} onDeleted={onDeleted} deleteTask={deleteTask} />,
    );

    expect(screen.getByText(/消すタスク/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '削除' }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(deleted));
    expect(deleteTask).toHaveBeenCalledWith('t1');
  });

  it('削除失敗時はエラーを表示し onDeleted を呼ばない', async () => {
    const deleteTask = vi.fn().mockRejectedValue(new Error('タスクの削除に失敗しました (404)'));
    const onDeleted = vi.fn();
    render(
      <DeleteDialog task={task()} onClose={() => {}} onDeleted={onDeleted} deleteTask={deleteTask} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '削除' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('削除に失敗しました');
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
