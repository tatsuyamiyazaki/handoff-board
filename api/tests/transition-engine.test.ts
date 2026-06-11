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
  department: null,
  role: null,
  project: null,
  milestone: null,
  tags: [],
  created_by: 'creator@example.com',
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

describe('applyTransition: ブロック（→ blocked）は blocked_reason 必須', () => {
  it('in-progress → blocked で blocked_reason を反映し activity に記録する', () => {
    const task = baseTask({ status: 'in-progress' });

    const next = applyTransition(task, { to: 'blocked', blocked_reason: 'API キー待ち' }, deps);

    expect(next.status).toBe('blocked');
    expect(next.blocked_reason).toBe('API キー待ち');
    expect(next.updated_at).toBe('2026-06-01T09:00:00.000Z');
    expect(next.activity.at(-1)).toMatchObject({
      actor: 'alice@example.com',
      action: 'in-progress → blocked',
    });
  });

  it('needs-ai → blocked は許可される', () => {
    const next = applyTransition(
      baseTask({ status: 'needs-ai' }),
      { to: 'blocked', blocked_reason: '依存待ち' },
      deps,
    );
    expect(next.status).toBe('blocked');
  });

  it('→ blocked で blocked_reason 欠落は ValidationError(422)', () => {
    const task = baseTask({ status: 'in-progress' });

    expect(() => applyTransition(task, { to: 'blocked' }, deps)).toThrowError(ValidationError);
    try {
      applyTransition(task, { to: 'blocked' }, deps);
    } catch (e) {
      expect((e as ValidationError).status).toBe(422);
    }
  });

  it('→ blocked で空白のみの blocked_reason も 422', () => {
    expect(() =>
      applyTransition(baseTask({ status: 'in-progress' }), { to: 'blocked', blocked_reason: '  ' }, deps),
    ).toThrowError(ValidationError);
  });
});

describe('applyTransition: 解除（blocked → needs-*）は handoff_note 必須・blocked_reason リセット', () => {
  it('blocked → needs-human で blocked_reason を null にリセットし handoff_note を反映する', () => {
    const task = baseTask({ status: 'blocked', blocked_reason: 'API キー待ち' });

    const next = applyTransition(
      task,
      { to: 'needs-human', handoff_note: 'キー入手したので確認お願いします' },
      deps,
    );

    expect(next.status).toBe('needs-human');
    expect(next.blocked_reason).toBeNull();
    expect(next.handoff_note).toBe('キー入手したので確認お願いします');
    expect(next.activity.at(-1)).toMatchObject({ action: 'blocked → needs-human' });
  });

  it('blocked → needs-ai で handoff_note 欠落は ValidationError(422)', () => {
    const task = baseTask({ status: 'blocked', blocked_reason: '依存待ち' });

    expect(() => applyTransition(task, { to: 'needs-ai' }, deps)).toThrowError(ValidationError);
  });

  it('blocked → in-progress / done は禁止（422）', () => {
    expect(() =>
      applyTransition(baseTask({ status: 'blocked', blocked_reason: 'x' }), { to: 'in-progress' }, deps),
    ).toThrowError(ValidationError);
    expect(() =>
      applyTransition(baseTask({ status: 'blocked', blocked_reason: 'x' }), { to: 'done' }, deps),
    ).toThrowError(ValidationError);
  });
});

describe('allowedTransitions: UI がボタンを描画するための許可先一覧', () => {
  it('in-progress からは needs-ai / needs-human / done / blocked', () => {
    expect(allowedTransitions('in-progress')).toEqual([
      'needs-ai',
      'needs-human',
      'done',
      'blocked',
    ]);
  });

  it('needs-ai からは in-progress / blocked', () => {
    expect(allowedTransitions('needs-ai')).toEqual(['in-progress', 'blocked']);
  });

  it('done は終端で空配列', () => {
    expect(allowedTransitions('done')).toEqual([]);
  });

  it('in-progress からは blocked も含む', () => {
    expect(allowedTransitions('in-progress')).toContain('blocked');
  });

  it('blocked からは needs-ai / needs-human のみ', () => {
    expect(allowedTransitions('blocked')).toEqual(['needs-ai', 'needs-human']);
  });
});
