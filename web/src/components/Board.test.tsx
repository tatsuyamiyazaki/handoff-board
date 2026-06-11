import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { Task } from '@handoff/shared';
import { Board } from './Board';

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

const LANE_LABELS = ['To Do', 'In Progress', 'Blocked', 'Done'];

describe('Board', () => {
  it('4つのレーン（To Do / In Progress / Blocked / Done）を表示する', () => {
    render(<Board tasks={[]} />);
    for (const label of LANE_LABELS) {
      expect(screen.getByRole('region', { name: label })).toBeInTheDocument();
    }
  });

  it('needs-ai と needs-human を To Do レーンに統合して表示する', () => {
    render(
      <Board
        tasks={[
          task({ id: 'a', title: 'AIタスク', status: 'needs-ai' }),
          task({ id: 'h', title: '人間タスク', status: 'needs-human' }),
        ]}
      />,
    );
    const todo = screen.getByRole('region', { name: 'To Do' });
    expect(within(todo).getByText('AIタスク')).toBeInTheDocument();
    expect(within(todo).getByText('人間タスク')).toBeInTheDocument();
  });

  it('in-progress / blocked / done をそれぞれのレーンに表示する', () => {
    render(
      <Board
        tasks={[
          task({ id: '1', title: '進行', status: 'in-progress' }),
          task({ id: '2', title: '停止', status: 'blocked' }),
          task({ id: '3', title: '済', status: 'done' }),
        ]}
      />,
    );
    expect(
      within(screen.getByRole('region', { name: 'In Progress' })).getByText('進行'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Blocked' })).getByText('停止'),
    ).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Done' })).getByText('済')).toBeInTheDocument();
  });

  it('タスクは属さないレーンには現れない', () => {
    render(<Board tasks={[task({ id: 'x', title: '進行', status: 'in-progress' })]} />);
    const doneLane = screen.getByRole('region', { name: 'Done' });
    expect(within(doneLane).queryByText('進行')).not.toBeInTheDocument();
  });

  it('To Do の件数は needs-ai と needs-human の合計', () => {
    render(
      <Board
        tasks={[
          task({ id: '1', status: 'needs-ai' }),
          task({ id: '2', status: 'needs-human' }),
          task({ id: '3', status: 'needs-ai' }),
          task({ id: '4', status: 'in-progress' }),
        ]}
      />,
    );
    const todo = screen.getByRole('region', { name: 'To Do' });
    expect(within(todo).getByText('3')).toBeInTheDocument();
  });
});
