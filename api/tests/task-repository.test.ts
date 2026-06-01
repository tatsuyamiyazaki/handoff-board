import { describe, it, expect } from 'vitest';
import type { Task } from '@handoff/shared';
import { InMemoryTaskRepository } from '../src/repository/in-memory-task-repository.js';

const sampleTask = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'サンプル',
  status: 'needs-ai',
  owner: 'ai-batch',
  priority: 'P2',
  action_type: 'other',
  handoff_note: 'お願いします',
  blocked_reason: null,
  tags: [],
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
  activity: [],
  ...over,
});

describe('InMemoryTaskRepository.findAll', () => {
  it('空のボードでは空配列を返す', async () => {
    const repo = new InMemoryTaskRepository();
    expect(await repo.findAll()).toEqual([]);
  });

  it('投入された全タスクを返す', async () => {
    const repo = new InMemoryTaskRepository([
      sampleTask({ id: 'a' }),
      sampleTask({ id: 'b', status: 'done' }),
    ]);
    const result = await repo.findAll();
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id).sort()).toEqual(['a', 'b']);
  });
});
