import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Task } from '@handoff/shared';
import { UnblockDialog } from './UnblockDialog';

const blockedTask = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'サンプル',
  status: 'blocked',
  owner: 'human',
  priority: 'P2',
  action_type: 'other',
  handoff_note: '',
  blocked_reason: 'API キー待ち',
  tags: [],
  department: null,
  role: null,
  project: null,
  milestone: null,
  created_by: 'creator@example.com',
  created_by_type: 'human',
  review_cycles: 0,
  review_cycle_limit: null,
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
  activity: [],
  ...over,
});

describe('UnblockDialog', () => {
  it('引き継ぎメモが空で送信するとエラーを表示し、transitionTask を呼ばない', async () => {
    const transitionTask = vi.fn();
    render(
      <UnblockDialog
        task={blockedTask()}
        onClose={() => {}}
        onTransitioned={() => {}}
        transitionTask={transitionTask}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '解除' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(transitionTask).not.toHaveBeenCalled();
  });

  it('メモを入力し引き継ぎ先を選んで送信すると to=needs-* と handoff_note・updated_at で遷移を呼ぶ', async () => {
    const unblocked = blockedTask({ status: 'needs-ai', blocked_reason: null });
    const transitionTask = vi.fn().mockResolvedValue(unblocked);
    const onTransitioned = vi.fn();
    render(
      <UnblockDialog
        task={blockedTask({ id: 'x', updated_at: '2026-06-01T00:00:00.000Z' })}
        onClose={() => {}}
        onTransitioned={onTransitioned}
        transitionTask={transitionTask}
      />,
    );

    fireEvent.change(screen.getByLabelText('引き継ぎ先'), { target: { value: 'needs-ai' } });
    fireEvent.change(screen.getByLabelText('引き継ぎメモ'), {
      target: { value: 'キー入手、調査お願いします' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解除' }));

    await waitFor(() => expect(onTransitioned).toHaveBeenCalledWith(unblocked));
    expect(transitionTask).toHaveBeenCalledWith('x', {
      to: 'needs-ai',
      handoff_note: 'キー入手、調査お願いします',
      updated_at: '2026-06-01T00:00:00.000Z',
    });
  });
});
