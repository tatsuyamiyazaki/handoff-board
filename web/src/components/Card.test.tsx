import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Task } from '@handoff/shared';
import { Card } from './Card';

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
  created_by_type: 'human',
  review_cycles: 0,
  review_cycle_limit: null,
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
  activity: [],
  ...over,
});

describe('Card', () => {
  it('blocked タスクは理由文ではなくブロックマーカーを表示する', () => {
    render(<Card task={task({ status: 'blocked', blocked_reason: 'API キー待ち' })} />);
    expect(screen.getByRole('img', { name: 'ブロック中' })).toBeInTheDocument();
    // 密なカードでは理由文はカード面に出さない（解除ダイアログで確認）。
    expect(screen.queryByText(/API キー待ち/)).not.toBeInTheDocument();
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

  it('in-progress カードには完了ボタンがなく、レビュー依頼ボタンがある', () => {
    render(<Card task={task({ status: 'in-progress' })} />);
    expect(screen.queryByRole('button', { name: '完了' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'レビュー依頼' })).toBeInTheDocument();
  });

  it('レビュー依頼で in-review への直接遷移が送られる', async () => {
    const reviewed = task({ id: 'a', status: 'in-review' });
    const transitionTask = vi.fn().mockResolvedValue(reviewed);
    const onTransitioned = vi.fn();
    render(
      <Card
        task={task({ id: 'a', status: 'in-progress' })}
        transitionTask={transitionTask}
        onTransitioned={onTransitioned}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'レビュー依頼' }));

    await waitFor(() =>
      expect(transitionTask).toHaveBeenCalledWith('a', {
        to: 'in-review',
        updated_at: '2026-06-01T00:00:00.000Z',
      }),
    );
    expect(onTransitioned).toHaveBeenCalledWith(reviewed);
  });

  it('in-review カードには完了と差し戻しボタンがある', () => {
    render(<Card task={task({ status: 'in-review' })} />);
    expect(screen.getByRole('button', { name: '完了' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '差し戻し' })).toBeInTheDocument();
  });

  it('in-review の完了で done への直接遷移を送り onTransitioned に渡す', async () => {
    const done = task({ id: 'a', status: 'done' });
    const transitionTask = vi.fn().mockResolvedValue(done);
    const onTransitioned = vi.fn();
    render(
      <Card
        task={task({ id: 'a', status: 'in-review' })}
        transitionTask={transitionTask}
        onTransitioned={onTransitioned}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '完了' }));

    await waitFor(() => expect(onTransitioned).toHaveBeenCalledWith(done));
    expect(transitionTask).toHaveBeenCalledWith('a', {
      to: 'done',
      updated_at: '2026-06-01T00:00:00.000Z',
    });
  });

  it('自己レビューなど直接遷移の拒否をカード内に表示する', async () => {
    const transitionTask = vi.fn().mockRejectedValue(new Error('自己レビューはできません'));
    render(
      <Card task={task({ status: 'in-review' })} transitionTask={transitionTask} />,
    );

    fireEvent.click(screen.getByRole('button', { name: '完了' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('自己レビューはできません');
  });

  it('直接遷移エラーは別のダイアログ操作を始めると消える', async () => {
    const transitionTask = vi.fn().mockRejectedValue(new Error('レビュー依頼に失敗'));
    render(
      <Card task={task({ status: 'in-progress' })} transitionTask={transitionTask} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'レビュー依頼' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('レビュー依頼に失敗');

    fireEvent.click(screen.getByRole('button', { name: '引き継ぎ' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

  it('owner=cowork の担当ドットは COWORK（ADR-0006）', () => {
    render(<Card task={task({ owner: 'cowork' })} />);
    expect(screen.getByRole('img', { name: '担当: COWORK' })).toBeInTheDocument();
  });

  it('owner=claude-code の担当ドットは CLAUDE-CODE', () => {
    render(<Card task={task({ owner: 'claude-code' })} />);
    expect(screen.getByRole('img', { name: '担当: CLAUDE-CODE' })).toBeInTheDocument();
  });

  it('owner=human の担当ドットは HUMAN', () => {
    render(<Card task={task({ owner: 'human' })} />);
    expect(screen.getByRole('img', { name: '担当: HUMAN' })).toBeInTheDocument();
  });

  it('project / milestone があればカードに表示する（ADR-0004）', () => {
    render(<Card task={task({ project: 'ニュースレター', milestone: '6月号' })} />);
    expect(screen.getByText('ニュースレター')).toBeInTheDocument();
    expect(screen.getByText('6月号')).toBeInTheDocument();
  });

  it('project / milestone が null のときはそのラベルを表示しない', () => {
    render(<Card task={task({ project: null, milestone: null })} />);
    expect(screen.queryByText('プロジェクト')).not.toBeInTheDocument();
    expect(screen.queryByText('マイルストーン')).not.toBeInTheDocument();
  });

  it('department があれば部署チップを部署別の色（data-department）で表示する（ADR-0006）', () => {
    render(<Card task={task({ owner: 'cowork', department: 'engineering' })} />);
    const chip = screen.getByText('engineering');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveAttribute('data-department', 'engineering');
  });

  it('department が null のときは部署チップを表示しない', () => {
    render(<Card task={task({ owner: 'human', department: null })} />);
    expect(screen.queryByText('engineering')).not.toBeInTheDocument();
  });

  it('role があればロールチップを常時表示する（ADR-0006）', () => {
    render(<Card task={task({ owner: 'cowork', department: 'engineering', role: 'code-review' })} />);
    expect(screen.getByText('code-review')).toBeInTheDocument();
  });

  it('role が null のときはロールチップを表示しない', () => {
    render(<Card task={task({ owner: 'cowork', department: 'engineering', role: null })} />);
    expect(screen.queryByText('code-review')).not.toBeInTheDocument();
  });
});
