import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Task } from '@handoff/shared';
import { CreateTaskDialog } from './CreateTaskDialog';

const sampleTask = (over: Partial<Task> = {}): Task => ({
  id: 'new-1',
  title: '記事を書く',
  status: 'needs-ai',
  owner: 'ai-batch',
  priority: 'P2',
  action_type: 'other',
  handoff_note: 'お願い',
  blocked_reason: null,
  tags: [],
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
  activity: [],
  ...over,
});

describe('CreateTaskDialog', () => {
  it('必須未入力で送信するとバリデーションエラーを表示し、作成は呼ばれない', async () => {
    const createTask = vi.fn();
    render(<CreateTaskDialog onClose={() => {}} onCreated={() => {}} createTask={createTask} />);

    fireEvent.click(screen.getByRole('button', { name: '作成' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(createTask).not.toHaveBeenCalled();
  });

  it('有効入力で createTask を呼び、成功時に onCreated に作成タスクを渡す', async () => {
    const created = sampleTask({ id: 'created-99' });
    const createTask = vi.fn().mockResolvedValue(created);
    const onCreated = vi.fn();
    render(<CreateTaskDialog onClose={() => {}} onCreated={onCreated} createTask={createTask} />);

    fireEvent.change(screen.getByLabelText('タイトル'), { target: { value: '記事を書く' } });
    fireEvent.change(screen.getByLabelText('引き継ぎメモ'), { target: { value: 'お願い' } });
    fireEvent.click(screen.getByRole('button', { name: '作成' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(createTask).toHaveBeenCalledTimes(1);
  });

  it('サーバーエラー（例外）時はエラーを表示し onCreated を呼ばない', async () => {
    const createTask = vi.fn().mockRejectedValue(new Error('作成に失敗しました (422)'));
    const onCreated = vi.fn();
    render(<CreateTaskDialog onClose={() => {}} onCreated={onCreated} createTask={createTask} />);

    fireEvent.change(screen.getByLabelText('タイトル'), { target: { value: '記事' } });
    fireEvent.change(screen.getByLabelText('引き継ぎメモ'), { target: { value: 'お願い' } });
    fireEvent.click(screen.getByRole('button', { name: '作成' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('作成に失敗しました');
    expect(onCreated).not.toHaveBeenCalled();
  });
});
