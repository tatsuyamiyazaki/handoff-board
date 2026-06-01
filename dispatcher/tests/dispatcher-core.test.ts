import { describe, it, expect } from 'vitest';
import type { Task } from '@handoff/shared';
import {
  selectNextTask,
  findStaleTasks,
  DISPATCHER_LOCK_TAG,
} from '../src/dispatcher-core.js';

const task = (over: Partial<Task> = {}): Task => ({
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
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
  activity: [],
  ...over,
});

describe('selectNextTask: ディスパッチャーの対象選定', () => {
  it('needs-ai かつ ai-batch のタスクを1件選ぶ', () => {
    const next = selectNextTask([task({ id: 'a' })]);
    expect(next?.id).toBe('a');
  });

  it('needs-ai でない / ai-batch でないタスクは対象外', () => {
    const tasks = [
      task({ id: 'human', owner: 'human' }),
      task({ id: 'wip', status: 'in-progress' }),
      task({ id: 'interactive', owner: 'ai-interactive' }),
    ];
    expect(selectNextTask(tasks)).toBeNull();
  });

  it('dispatcher-lock タグの付いたタスクは除外する', () => {
    const tasks = [task({ id: 'locked', tags: [DISPATCHER_LOCK_TAG] })];
    expect(selectNextTask(tasks)).toBeNull();
  });

  it('priority 順（P0 が先）にソートし先頭1件を返す', () => {
    const tasks = [
      task({ id: 'p2', priority: 'P2' }),
      task({ id: 'p0', priority: 'P0' }),
      task({ id: 'p1', priority: 'P1' }),
    ];
    expect(selectNextTask(tasks)?.id).toBe('p0');
  });

  it('同 priority なら created_at が古いものを優先', () => {
    const tasks = [
      task({ id: 'newer', priority: 'P1', created_at: '2026-06-01T05:00:00.000Z' }),
      task({ id: 'older', priority: 'P1', created_at: '2026-06-01T01:00:00.000Z' }),
    ];
    expect(selectNextTask(tasks)?.id).toBe('older');
  });

  it('対象0件なら null（安全に何もしない）', () => {
    expect(selectNextTask([])).toBeNull();
  });
});

describe('findStaleTasks: 72時間 status 無変更タスクの掃引', () => {
  const now = '2026-06-04T00:00:00.000Z'; // 基準時刻

  it('updated_at が72時間より古い active タスクを返す', () => {
    const tasks = [
      task({ id: 'stale', status: 'needs-ai', updated_at: '2026-05-31T23:00:00.000Z' }), // 73h前
      task({ id: 'fresh', status: 'needs-ai', updated_at: '2026-06-03T23:00:00.000Z' }), // 1h前
    ];
    const stale = findStaleTasks(tasks, now);
    expect(stale.map((t) => t.id)).toEqual(['stale']);
  });

  it('72時間ちょうど未満は対象外（境界）', () => {
    const tasks = [
      task({ id: 'edge', status: 'in-progress', updated_at: '2026-06-01T00:30:00.000Z' }), // 71.5h前
    ];
    expect(findStaleTasks(tasks, now)).toEqual([]);
  });

  it('既に blocked / done のタスクは掃引対象外', () => {
    const old = '2026-05-01T00:00:00.000Z';
    const tasks = [
      task({ id: 'blocked', status: 'blocked', blocked_reason: 'x', updated_at: old }),
      task({ id: 'done', status: 'done', updated_at: old }),
      task({ id: 'needshuman', status: 'needs-human', updated_at: old }),
    ];
    expect(findStaleTasks(tasks, now).map((t) => t.id)).toEqual(['needshuman']);
  });

  it('しきい値は引数で変更できる', () => {
    const tasks = [task({ id: 'a', status: 'needs-ai', updated_at: '2026-06-03T22:00:00.000Z' })]; // 2h前
    expect(findStaleTasks(tasks, now, 1).map((t) => t.id)).toEqual(['a']);
  });
});
