import { describe, it, expect } from 'vitest';
import { validateEditTask, applyEdit, ValidationError, type Task } from '@handoff/shared';

const baseTask = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: '元タイトル',
  status: 'in-progress',
  owner: 'cowork',
  priority: 'P2',
  action_type: 'other',
  handoff_note: '元メモ',
  blocked_reason: null,
  tags: ['old'],
  department: null,
  role: null,
  project: null,
  milestone: null,
  created_by: 'creator@example.com',
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
  activity: [{ timestamp: '2026-06-01T00:00:00.000Z', actor: 'creator@example.com', action: 'created' }],
  ...over,
});

const valid = {
  title: '新タイトル',
  owner: 'human',
  priority: 'P1',
  action_type: 'review',
  handoff_note: '新メモ',
  tags: ['a', 'b'],
};

describe('validateEditTask', () => {
  it('有効入力を正規化して返す', () => {
    expect(validateEditTask(valid)).toMatchObject(valid);
  });

  it('priority/action_type/tags 省略時は既定値（P2/other/[]）', () => {
    const result = validateEditTask({ title: 't', owner: 'human', handoff_note: 'n' });
    expect(result.priority).toBe('P2');
    expect(result.action_type).toBe('other');
    expect(result.tags).toEqual([]);
  });

  it('title 空は 422', () => {
    const err = (() => {
      try {
        validateEditTask({ ...valid, title: '  ' });
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).status).toBe(422);
  });

  it('不正な priority は 422', () => {
    expect(() => validateEditTask({ ...valid, priority: 'P9' })).toThrow(ValidationError);
  });
});

describe('applyEdit', () => {
  const deps = { now: () => '2026-06-01T09:00:00.000Z', actor: 'editor@example.com' };

  it('編集対象フィールドを更新し、updated_at と edited の activity を付与する', () => {
    const normalized = validateEditTask(valid);
    const edited = applyEdit(baseTask(), normalized, deps);
    expect(edited.title).toBe('新タイトル');
    expect(edited.owner).toBe('human');
    expect(edited.priority).toBe('P1');
    expect(edited.action_type).toBe('review');
    expect(edited.handoff_note).toBe('新メモ');
    expect(edited.tags).toEqual(['a', 'b']);
    expect(edited.updated_at).toBe('2026-06-01T09:00:00.000Z');
    expect(edited.activity.at(-1)).toEqual({
      timestamp: '2026-06-01T09:00:00.000Z',
      actor: 'editor@example.com',
      action: 'edited',
    });
  });

  it('project/milestone を更新する', () => {
    const normalized = validateEditTask({
      ...valid,
      owner: 'cowork',
      project: 'AIRFLOW',
      milestone: 'v3',
    });
    const edited = applyEdit(baseTask(), normalized, deps);
    expect(edited.project).toBe('AIRFLOW');
    expect(edited.milestone).toBe('v3');
  });

  it('status / created_at / created_by / id は変更しない', () => {
    const before = baseTask();
    const edited = applyEdit(before, validateEditTask(valid), deps);
    expect(edited.status).toBe(before.status);
    expect(edited.created_at).toBe(before.created_at);
    expect(edited.created_by).toBe(before.created_by);
    expect(edited.id).toBe(before.id);
  });
});
