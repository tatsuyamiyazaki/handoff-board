import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { Task } from '@handoff/shared';
import { Board } from './Board';

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'サンプル',
  status: 'needs-ai',
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
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  activity: [],
  ...over,
});

const LANES = ['needs-ai', 'needs-human', 'in-progress', 'done', 'blocked'];

describe('Board', () => {
  it('5つの status レーンをすべて表示する', () => {
    render(<Board tasks={[]} />);
    for (const status of LANES) {
      expect(screen.getByRole('region', { name: status })).toBeInTheDocument();
    }
  });

  it('タスクをその status のレーンにカードとして表示する', () => {
    render(<Board tasks={[task({ id: 'x', title: '競合調査', status: 'in-progress' })]} />);
    const lane = screen.getByRole('region', { name: 'in-progress' });
    expect(within(lane).getByText('競合調査')).toBeInTheDocument();
  });

  it('タスクは別レーンには現れない', () => {
    render(<Board tasks={[task({ id: 'x', title: '競合調査', status: 'in-progress' })]} />);
    const doneLane = screen.getByRole('region', { name: 'done' });
    expect(within(doneLane).queryByText('競合調査')).not.toBeInTheDocument();
  });

  it('各レーンの先頭にそのレーンの件数を表示する', () => {
    render(
      <Board
        tasks={[
          task({ id: '1', status: 'needs-ai' }),
          task({ id: '2', status: 'needs-ai' }),
          task({ id: '3', status: 'in-progress' }),
        ]}
      />,
    );
    const needsAi = screen.getByRole('region', { name: 'needs-ai' });
    const inProgress = screen.getByRole('region', { name: 'in-progress' });
    const done = screen.getByRole('region', { name: 'done' });
    expect(within(needsAi).getByText('2')).toBeInTheDocument();
    expect(within(inProgress).getByText('1')).toBeInTheDocument();
    expect(within(done).getByText('0')).toBeInTheDocument();
  });
});
