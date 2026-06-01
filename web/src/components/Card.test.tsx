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

  it('needs-* タスクには「着手」があり、押すと in-progress へ直接遷移し onTransitioned に渡す', async () => {
    const moved = task({ id: 'a', status: 'in-progress' });
    const transitionTask = vi.fn().mockResolvedValue(moved);
    const onTransitioned = vi.fn();
    render(
      <Card
        task={task({ id: 'a', status: 'needs-ai' })}
        transitionTask={transitionTask}
        onTransitioned={onTransitioned}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '着手' }));

    await waitFor(() => expect(onTransitioned).toHaveBeenCalledWith(moved));
    expect(transitionTask).toHaveBeenCalledWith('a', {
      to: 'in-progress',
      updated_at: '2026-06-01T00:00:00.000Z',
    });
  });

  it('in-progress タスクには「完了」があり、押すと done へ直接遷移する', async () => {
    const done = task({ id: 'a', status: 'done' });
    const transitionTask = vi.fn().mockResolvedValue(done);
    render(<Card task={task({ id: 'a', status: 'in-progress' })} transitionTask={transitionTask} />);

    fireEvent.click(screen.getByRole('button', { name: '完了' }));

    await waitFor(() =>
      expect(transitionTask).toHaveBeenCalledWith('a', {
        to: 'done',
        updated_at: '2026-06-01T00:00:00.000Z',
      }),
    );
  });

  it('in-progress タスクには「引き継ぎ」があり、押すと引き継ぎダイアログが開く', () => {
    render(<Card task={task({ status: 'in-progress' })} />);
    fireEvent.click(screen.getByRole('button', { name: '引き継ぎ' }));
    expect(screen.getByRole('form', { name: 'タスクを引き継ぐ' })).toBeInTheDocument();
  });

  it('どのタスクにも「編集」があり、押すと編集ダイアログが開く', () => {
    render(<Card task={task({ status: 'needs-human' })} />);
    fireEvent.click(screen.getByRole('button', { name: '編集' }));
    expect(screen.getByRole('form', { name: 'タスクを編集' })).toBeInTheDocument();
  });

  it('どのタスクにも「削除」があり、押すと削除確認ダイアログが開く', () => {
    render(<Card task={task({ status: 'needs-ai' })} />);
    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(screen.getByRole('alertdialog', { name: 'タスクを削除' })).toBeInTheDocument();
  });

  it('AI 系 owner で agent 指定時、担当ドットに agent 値を表示する（ADR-0004）', () => {
    render(<Card task={task({ owner: 'ai-batch', agent: 'codex' })} />);
    expect(screen.getByRole('img', { name: '担当: CODEX' })).toBeInTheDocument();
  });

  it('owner=human の担当ドットは HUMAN（agent は持たない）', () => {
    render(<Card task={task({ owner: 'human', agent: null })} />);
    expect(screen.getByRole('img', { name: '担当: HUMAN' })).toBeInTheDocument();
  });

  it('AI 系 owner で agent 未割当時は担当ドットを AI にフォールバックする', () => {
    render(<Card task={task({ owner: 'ai-batch', agent: null })} />);
    expect(screen.getByRole('img', { name: '担当: AI' })).toBeInTheDocument();
  });
});
