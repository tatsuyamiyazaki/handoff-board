import { describe, it, expect } from 'vitest';
import { validateEditTask, applyEdit, ValidationError, type Task } from '@handoff/shared';
import { makeTask } from '@handoff/shared/testing';

const baseTask = (over: Partial<Task> = {}): Task =>
  makeTask({
    title: '元タイトル',
    status: 'in-progress',
    owner: 'cowork',
    handoff_note: '元メモ',
    tags: ['old'],
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
      session: null,
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

describe('review_cycle_limit の編集（ADR-0007）', () => {
  const editDeps = { now: () => '2026-06-01T09:00:00.000Z', actor: 'editor@example.com' };

  it('未指定なら変更しない（undefined）', () => {
    const normalized = validateEditTask(valid);
    expect(normalized.review_cycle_limit).toBeUndefined();

    const edited = applyEdit(
      baseTask({ review_cycle_limit: 3 }),
      normalized,
      editDeps,
    );
    expect(edited.review_cycle_limit).toBe(3);
  });

  it('正の整数と null（既定値に戻す）を受理して適用する', () => {
    const withLimit = validateEditTask({ ...valid, review_cycle_limit: 8 });
    const edited = applyEdit(baseTask({ review_cycles: 4 }), withLimit, editDeps);
    expect(edited.review_cycle_limit).toBe(8);
    expect(edited.review_cycles).toBe(4);

    const cleared = validateEditTask({ ...valid, review_cycle_limit: null });
    expect(
      applyEdit(baseTask({ review_cycle_limit: 8 }), cleared, editDeps).review_cycle_limit,
    ).toBeNull();
  });

  it.each([0, -1, 2.5, Number.MAX_SAFE_INTEGER + 1, 'abc'])('不正値 %s は 422', (value) => {
    expect(() => validateEditTask({ ...valid, review_cycle_limit: value })).toThrow(
      ValidationError,
    );
  });
});

describe('applyEdit: レビュー中の owner 変更禁止（ADR-0007 補強）', () => {
  const editDeps = { now: () => '2026-06-01T09:00:00.000Z', actor: 'editor@example.com' };
  /** 実装者 dev が提出済みの in-review タスク。 */
  const inReviewTask = (over: Partial<Task> = {}): Task =>
    baseTask({
      status: 'in-review',
      owner: 'claude-code',
      activity: [
        {
          timestamp: '2026-06-01T00:00:00.000Z',
          actor: 'claude-code:dev',
          action: 'in-progress → in-review',
          from: 'in-progress',
          to: 'in-review',
        },
      ],
      ...over,
    });

  it('in-review 中に owner を変える編集は 422（ラバースタンプ迂回の遮断）', () => {
    const normalized = validateEditTask({ ...valid, owner: 'human' });
    expect(() => applyEdit(inReviewTask(), normalized, editDeps)).toThrow(ValidationError);
  });

  it('in-review 中でも owner を変えない編集は通る', () => {
    const normalized = validateEditTask({ ...valid, owner: 'claude-code' });
    const next = applyEdit(inReviewTask(), normalized, editDeps);
    expect(next.title).toBe('新タイトル');
    expect(next.owner).toBe('claude-code');
  });

  it('レビュー中断中の blocked でも owner 変更は 422', () => {
    const task = inReviewTask({
      status: 'blocked',
      blocked_reason: '外部要因',
      activity: [
        {
          timestamp: '2026-06-01T00:00:00.000Z',
          actor: 'claude-code:dev',
          action: 'in-progress → in-review',
          from: 'in-progress',
          to: 'in-review',
        },
        {
          timestamp: '2026-06-01T00:00:00.000Z',
          actor: 'claude-code:reviewer',
          action: 'in-review → blocked',
          from: 'in-review',
          to: 'blocked',
        },
      ],
    });
    const normalized = validateEditTask({ ...valid, owner: 'human' });
    expect(() => applyEdit(task, normalized, editDeps)).toThrow(ValidationError);
  });

  it('レビュー外（in-progress）の owner 変更は従来どおり通る', () => {
    const normalized = validateEditTask({ ...valid, owner: 'human' });
    const next = applyEdit(baseTask(), normalized, editDeps);
    expect(next.owner).toBe('human');
  });
});
