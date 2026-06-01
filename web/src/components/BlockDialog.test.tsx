import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Task } from '@handoff/shared';
import { BlockDialog } from './BlockDialog';

const sampleTask = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'サンプル',
  status: 'in-progress',
  owner: 'ai-batch',
  priority: 'P2',
  action_type: 'other',
  handoff_note: 'お願い',
  blocked_reason: null,
  agent: null,
  project: null,
  milestone: null,
  tags: [],
  created_by: 'creator@example.com',
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
  activity: [],
  ...over,
});

describe('BlockDialog', () => {
  it('理由が空で送信するとエラーを表示し、transitionTask を呼ばない', async () => {
    const transitionTask = vi.fn();
    render(
      <BlockDialog
        task={sampleTask()}
        onClose={() => {}}
        onTransitioned={() => {}}
        transitionTask={transitionTask}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'ブロック' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(transitionTask).not.toHaveBeenCalled();
  });

  it('理由を入力して送信すると to=blocked と blocked_reason・updated_at で遷移を呼ぶ', async () => {
    const blocked = sampleTask({ status: 'blocked', blocked_reason: 'API キー待ち' });
    const transitionTask = vi.fn().mockResolvedValue(blocked);
    const onTransitioned = vi.fn();
    render(
      <BlockDialog
        task={sampleTask({ id: 'x', updated_at: '2026-06-01T00:00:00.000Z' })}
        onClose={() => {}}
        onTransitioned={onTransitioned}
        transitionTask={transitionTask}
      />,
    );

    fireEvent.change(screen.getByLabelText('ブロック理由'), {
      target: { value: 'API キー待ち' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ブロック' }));

    await waitFor(() => expect(onTransitioned).toHaveBeenCalledWith(blocked));
    expect(transitionTask).toHaveBeenCalledWith('x', {
      to: 'blocked',
      blocked_reason: 'API キー待ち',
      updated_at: '2026-06-01T00:00:00.000Z',
    });
  });
});
