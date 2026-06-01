import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Task } from '@handoff/shared';
import { Card } from './Card';

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'サンプル',
  status: 'in-progress',
  owner: 'ai-batch',
  priority: 'P2',
  action_type: 'other',
  handoff_note: '',
  blocked_reason: null,
  tags: [],
  created_by: 'creator@example.com',
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
  activity: [],
  ...over,
});

describe('Card', () => {
  it('blocked タスクは blocked_reason を表示する', () => {
    render(<Card task={task({ status: 'blocked', blocked_reason: 'API キー待ち' })} />);
    expect(screen.getByText(/API キー待ち/)).toBeInTheDocument();
  });

  it('ブロック可能なタスクには「ブロック」ボタンがあり、押すとブロックダイアログが開く', () => {
    render(<Card task={task({ status: 'in-progress' })} />);
    fireEvent.click(screen.getByRole('button', { name: 'ブロック' }));
    expect(screen.getByRole('form', { name: 'タスクをブロック' })).toBeInTheDocument();
  });

  it('blocked タスクには「解除」ボタンがあり、押すと解除ダイアログが開く', () => {
    render(<Card task={task({ status: 'blocked', blocked_reason: '依存待ち' })} />);
    fireEvent.click(screen.getByRole('button', { name: '解除' }));
    expect(screen.getByRole('form', { name: 'ブロックを解除' })).toBeInTheDocument();
  });

  it('done タスクには「ブロック」ボタンを出さない', () => {
    render(<Card task={task({ status: 'done' })} />);
    expect(screen.queryByRole('button', { name: 'ブロック' })).not.toBeInTheDocument();
  });

  it('done タスクには「アーカイブ」ボタンがあり、押すと completeTask を呼び onArchived に渡す', async () => {
    const archived = task({ id: 'fin', status: 'done' });
    const completeTask = vi.fn().mockResolvedValue(archived);
    const onArchived = vi.fn();
    render(
      <Card
        task={task({ id: 'fin', status: 'done' })}
        completeTask={completeTask}
        onArchived={onArchived}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'アーカイブ' }));

    await waitFor(() => expect(onArchived).toHaveBeenCalledWith(archived));
    expect(completeTask).toHaveBeenCalledWith('fin');
  });

  it('done でないタスクには「アーカイブ」ボタンを出さない', () => {
    render(<Card task={task({ status: 'in-progress' })} />);
    expect(screen.queryByRole('button', { name: 'アーカイブ' })).not.toBeInTheDocument();
  });
});
