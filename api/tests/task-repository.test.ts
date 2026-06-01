import { describe, it, expect } from 'vitest';
import type { Task } from '@handoff/shared';
import { InMemoryTaskRepository } from '../src/repository/in-memory-task-repository.js';
import { ConflictError } from '../src/repository/task-repository.js';

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
  created_by: 'creator@example.com',
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

  it('createdBy 指定時は作成者一致のタスクのみ返す', async () => {
    const repo = new InMemoryTaskRepository([
      sampleTask({ id: 'mine', created_by: 'me@example.com' }),
      sampleTask({ id: 'other', created_by: 'other@example.com' }),
      sampleTask({ id: 'legacy', created_by: null }),
    ]);
    const result = await repo.findAll({ createdBy: 'me@example.com' });
    expect(result.map((t) => t.id)).toEqual(['mine']);
  });
});

describe('InMemoryTaskRepository.findById', () => {
  it('id 一致のタスクを返す', async () => {
    const repo = new InMemoryTaskRepository([sampleTask({ id: 'a' })]);
    const found = await repo.findById('a');
    expect(found?.id).toBe('a');
  });

  it('存在しない id では null を返す', async () => {
    const repo = new InMemoryTaskRepository([sampleTask({ id: 'a' })]);
    expect(await repo.findById('zzz')).toBeNull();
  });
});

describe('InMemoryTaskRepository.update（楽観的並行制御）', () => {
  it('expectedUpdatedAt が現在値と一致すれば更新し、新タスクを返す', async () => {
    const repo = new InMemoryTaskRepository([
      sampleTask({ id: 'a', updated_at: '2026-06-01T00:00:00Z' }),
    ]);
    const next = sampleTask({
      id: 'a',
      status: 'in-progress',
      updated_at: '2026-06-01T09:00:00Z',
    });

    const saved = await repo.update(next, '2026-06-01T00:00:00Z');

    expect(saved.status).toBe('in-progress');
    expect((await repo.findById('a'))?.status).toBe('in-progress');
  });

  it('expectedUpdatedAt が古い（不一致）なら ConflictError・保存内容は不変', async () => {
    const repo = new InMemoryTaskRepository([
      sampleTask({ id: 'a', updated_at: '2026-06-01T05:00:00Z' }),
    ]);
    const next = sampleTask({ id: 'a', status: 'in-progress' });

    await expect(repo.update(next, '2026-06-01T00:00:00Z')).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect((await repo.findById('a'))?.status).toBe('needs-ai');
  });

  it('存在しない id の update は ConflictError', async () => {
    const repo = new InMemoryTaskRepository([]);
    await expect(
      repo.update(sampleTask({ id: 'ghost' }), '2026-06-01T00:00:00Z'),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('InMemoryTaskRepository.complete（board → archive 移動）', () => {
  it('complete でタスクが board から消え、archive に現れる', async () => {
    const repo = new InMemoryTaskRepository([sampleTask({ id: 'a', status: 'done' })]);

    const archived = await repo.complete(sampleTask({ id: 'a', status: 'done' }));

    expect(archived.id).toBe('a');
    expect((await repo.findAll()).map((t) => t.id)).not.toContain('a');
    expect(await repo.findById('a')).toBeNull();
    expect((await repo.findArchivedById('a'))?.id).toBe('a');
  });

  it('findArchivedById は未アーカイブの id では null', async () => {
    const repo = new InMemoryTaskRepository([sampleTask({ id: 'a', status: 'done' })]);
    expect(await repo.findArchivedById('a')).toBeNull();
  });
});

describe('InMemoryTaskRepository.deleteById', () => {
  it('対象を board から削除し、削除したタスクを返す', async () => {
    const repo = new InMemoryTaskRepository([sampleTask({ id: 'a' }), sampleTask({ id: 'b' })]);

    const deleted = await repo.deleteById('a');

    expect(deleted?.id).toBe('a');
    expect((await repo.findAll()).map((t) => t.id)).toEqual(['b']);
    expect(await repo.findById('a')).toBeNull();
  });

  it('存在しない id は null を返す', async () => {
    const repo = new InMemoryTaskRepository([]);
    expect(await repo.deleteById('ghost')).toBeNull();
  });
});
