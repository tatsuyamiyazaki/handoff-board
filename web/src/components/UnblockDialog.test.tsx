import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Task } from '@handoff/shared';
import { makeTask } from '@handoff/shared/testing';
import { UnblockDialog } from './UnblockDialog';

const blockedTask = (over: Partial<Task> = {}): Task =>
  makeTask({
    title: 'サンプル',
    status: 'blocked',
    owner: 'human',
    handoff_note: '',
    blocked_reason: 'API キー待ち',
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

  it('復帰先に in-review を選べ、そのときメモは不要', async () => {
    const recovered = blockedTask({ status: 'in-review', blocked_reason: null });
    const transitionTask = vi.fn().mockResolvedValue(recovered);
    const onTransitioned = vi.fn();
    render(
      <UnblockDialog
        task={blockedTask({
          id: 'x',
          updated_at: 'U1',
          activity: [
            {
              timestamp: '2026-06-01T00:00:00.000Z',
              actor: 'reviewer',
              action: 'in-review → blocked',
              from: 'in-review',
              to: 'blocked',
            },
          ],
        })}
        onClose={() => {}}
        onTransitioned={onTransitioned}
        transitionTask={transitionTask}
      />,
    );

    fireEvent.change(screen.getByLabelText('引き継ぎ先'), {
      target: { value: 'in-review' },
    });
    expect(screen.queryByLabelText('引き継ぎメモ')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '解除' }));

    await waitFor(() =>
      expect(transitionTask).toHaveBeenCalledWith('x', {
        to: 'in-review',
        updated_at: 'U1',
      }),
    );
    expect(onTransitioned).toHaveBeenCalledWith(recovered);
  });

  it('レビュー中断の構造化履歴がない blocked タスクには in-review 復帰を表示しない', () => {
    render(
      <UnblockDialog
        task={blockedTask()}
        onClose={() => {}}
        onTransitioned={() => {}}
      />,
    );

    expect(screen.queryByRole('option', { name: 'レビュー待ちに戻す' })).not.toBeInTheDocument();
  });
});
