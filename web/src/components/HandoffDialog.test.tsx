import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Task } from '@handoff/shared';
import { HandoffDialog } from './HandoffDialog';

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'サンプル',
  status: 'in-progress',
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
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
  activity: [],
  ...over,
});

describe('HandoffDialog', () => {
  it('メモ未入力で送信するとエラーを表示し、遷移は呼ばれない', async () => {
    const transitionTask = vi.fn();
    render(
      <HandoffDialog
        task={task()}
        onClose={() => {}}
        onTransitioned={() => {}}
        transitionTask={transitionTask}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '引き継ぐ' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(transitionTask).not.toHaveBeenCalled();
  });

  it('引き継ぎ先と handoff_note を付けて PATCH を送る', async () => {
    const updated = task({ status: 'needs-human' });
    const transitionTask = vi.fn().mockResolvedValue(updated);
    const onTransitioned = vi.fn();
    render(
      <HandoffDialog
        task={task()}
        onClose={() => {}}
        onTransitioned={onTransitioned}
        transitionTask={transitionTask}
      />,
    );

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'needs-human' } });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '続きをお願いします' } });
    fireEvent.click(screen.getByRole('button', { name: '引き継ぐ' }));

    await waitFor(() => expect(onTransitioned).toHaveBeenCalledWith(updated));
    expect(transitionTask).toHaveBeenCalledWith('t1', {
      to: 'needs-human',
      handoff_note: '続きをお願いします',
      updated_at: '2026-06-01T00:00:00.000Z',
    });
  });
});
