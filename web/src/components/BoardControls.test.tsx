import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { Task } from '@handoff/shared';
import { BoardControls } from './BoardControls';
import { ALL, type BoardFilter } from '../lib/board-view';

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'サンプル',
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
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  activity: [],
  ...over,
});

const allFilter: BoardFilter = { owner: ALL, department: ALL, project: ALL, milestone: ALL };

describe('BoardControls', () => {
  it('サマリに人間アサイン・進行中・ブロックの件数を表示する', () => {
    render(
      <BoardControls
        tasks={[
          task({ id: '1', owner: 'human', status: 'needs-human' }),
          task({ id: '2', owner: 'cowork', status: 'in-progress' }),
          task({ id: '3', owner: 'cowork', status: 'blocked' }),
        ]}
        filter={allFilter}
        onFilterChange={() => {}}
      />,
    );

    expect(within(screen.getByLabelText('人間アサイン')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByLabelText('進行中')).getByText('1')).toBeInTheDocument();
    expect(within(screen.getByLabelText('ブロック')).getByText('1')).toBeInTheDocument();
  });

  it('オーナーを選ぶと onFilterChange に反映する', () => {
    const onFilterChange = vi.fn();
    render(
      <BoardControls tasks={[task()]} filter={allFilter} onFilterChange={onFilterChange} />,
    );

    fireEvent.change(screen.getByLabelText('オーナー'), { target: { value: 'human' } });

    expect(onFilterChange).toHaveBeenCalledWith({ ...allFilter, owner: 'human' });
  });

  it('プロジェクトの選択肢をタスクから重複なく作り、選ぶと反映する', () => {
    const onFilterChange = vi.fn();
    render(
      <BoardControls
        tasks={[
          task({ id: '1', project: 'PJ-A' }),
          task({ id: '2', project: 'PJ-B' }),
          task({ id: '3', project: 'PJ-A' }),
        ]}
        filter={allFilter}
        onFilterChange={onFilterChange}
      />,
    );

    const select = screen.getByLabelText('プロジェクト');
    // すべて + PJ-A + PJ-B の3択
    expect(within(select).getAllByRole('option')).toHaveLength(3);
    fireEvent.change(select, { target: { value: 'PJ-B' } });

    expect(onFilterChange).toHaveBeenCalledWith({ ...allFilter, project: 'PJ-B' });
  });

  it('マイルストーンを選ぶと反映する', () => {
    const onFilterChange = vi.fn();
    render(
      <BoardControls
        tasks={[task({ id: '1', milestone: 'v2' })]}
        filter={allFilter}
        onFilterChange={onFilterChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('マイルストーン'), { target: { value: 'v2' } });

    expect(onFilterChange).toHaveBeenCalledWith({ ...allFilter, milestone: 'v2' });
  });
});
