import { describe, it, expect } from 'vitest';
import {
  applyTransition,
  allowedTransitions,
  ValidationError,
  type Task,
} from '@handoff/shared';

const baseTask = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'サンプル',
  status: 'needs-ai',
  owner: 'human',
  priority: 'P2',
  action_type: 'other',
  handoff_note: '最初のメモ',
  blocked_reason: null,
  tags: [],
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
  activity: [{ timestamp: '2026-06-01T00:00:00.000Z', actor: 'human', action: 'created' }],
  ...over,
});

const deps = { now: () => '2026-06-01T09:00:00.000Z', actor: 'alice@example.com' };

describe('applyTransition: 着手（needs-ai → in-progress）', () => {
  it('status を in-progress に変え、updated_at を更新し、activity を追加する', () => {
    const task = baseTask({ status: 'needs-ai' });

    const next = applyTransition(task, { to: 'in-progress' }, deps);

    expect(next.status).toBe('in-progress');
    expect(next.updated_at).toBe('2026-06-01T09:00:00.000Z');
    expect(next.activity).toHaveLength(2);
    expect(next.activity[1]).toMatchObject({
      actor: 'alice@example.com',
      action: 'needs-ai → in-progress',
    });
  });
});

describe('applyTransition: 不正な辺はグラフ外として拒否（422）', () => {
  it('needs-ai → done（in-progress を飛ばす）は ValidationError(422)', () => {
    const task = baseTask({ status: 'needs-ai' });

    expect(() => applyTransition(task, { to: 'done' }, deps)).toThrowError(ValidationError);
    try {
      applyTransition(task, { to: 'done' }, deps);
    } catch (e) {
      expect((e as ValidationError).status).toBe(422);
    }
  });

  it('done → 任意（done は終端）は ValidationError(422)', () => {
    const task = baseTask({ status: 'done' });

    expect(() => applyTransition(task, { to: 'in-progress' }, deps)).toThrowError(
      ValidationError,
    );
  });
});

describe('applyTransition: 引き継ぎ遷移は handoff_note 必須', () => {
  it('in-progress → needs-ai で handoff_note 欠落は ValidationError(422)', () => {
    const task = baseTask({ status: 'in-progress' });

    expect(() => applyTransition(task, { to: 'needs-ai' }, deps)).toThrowError(
      ValidationError,
    );
  });

  it('in-progress → needs-human で空白のみの handoff_note も 422', () => {
    const task = baseTask({ status: 'in-progress' });

    expect(() =>
      applyTransition(task, { to: 'needs-human', handoff_note: '   ' }, deps),
    ).toThrowError(ValidationError);
  });

  it('handoff_note 付きの引き継ぎは成功し、note を反映・owner は不変', () => {
    const task = baseTask({ status: 'in-progress', owner: 'human', handoff_note: '旧メモ' });

    const next = applyTransition(
      task,
      { to: 'needs-ai', handoff_note: 'AIに調査を依頼' },
      deps,
    );

    expect(next.status).toBe('needs-ai');
    expect(next.handoff_note).toBe('AIに調査を依頼');
    expect(next.owner).toBe('human');
  });

  it('引き継ぎでない遷移（着手）は handoff_note を変更しない', () => {
    const task = baseTask({ status: 'needs-ai', handoff_note: '元のメモ' });

    const next = applyTransition(task, { to: 'in-progress' }, deps);

    expect(next.handoff_note).toBe('元のメモ');
  });
});

describe('applyTransition: グラフ網羅（#04 スコープ＝ blocked を除く）', () => {
  // [from, to, handoff_note?]
  const allowed: [Task['status'], Task['status'], string?][] = [
    ['needs-ai', 'in-progress'],
    ['needs-human', 'in-progress'],
    ['in-progress', 'needs-ai', 'メモ'],
    ['in-progress', 'needs-human', 'メモ'],
    ['in-progress', 'done'],
  ];
  it.each(allowed)('許可: %s → %s は成功', (from, to, note) => {
    const next = applyTransition(baseTask({ status: from }), { to, handoff_note: note }, deps);
    expect(next.status).toBe(to);
  });

  const forbidden: [Task['status'], Task['status']][] = [
    ['needs-ai', 'needs-human'],
    ['needs-ai', 'done'],
    ['needs-human', 'needs-ai'],
    ['needs-human', 'done'],
    ['in-progress', 'in-progress'],
    ['done', 'in-progress'],
    ['done', 'needs-ai'],
  ];
  it.each(forbidden)('禁止: %s → %s は 422', (from, to) => {
    expect(() =>
      applyTransition(baseTask({ status: from }), { to, handoff_note: 'x' }, deps),
    ).toThrowError(ValidationError);
  });
});

describe('allowedTransitions: UI がボタンを描画するための許可先一覧', () => {
  it('in-progress からは needs-ai / needs-human / done', () => {
    expect(allowedTransitions('in-progress')).toEqual(['needs-ai', 'needs-human', 'done']);
  });

  it('needs-ai からは in-progress のみ', () => {
    expect(allowedTransitions('needs-ai')).toEqual(['in-progress']);
  });

  it('done は終端で空配列', () => {
    expect(allowedTransitions('done')).toEqual([]);
  });
});
