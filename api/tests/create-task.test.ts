import { describe, it, test, expect } from 'vitest';
import { validateCreateTask, buildTask, ValidationError } from '@handoff/shared';

const valid = {
  title: '記事を書く',
  owner: 'cowork',
  handoff_note: '下書きお願いします',
  status: 'needs-ai',
};

function caught(fn: () => unknown): ValidationError {
  try {
    fn();
  } catch (e) {
    return e as ValidationError;
  }
  throw new Error('expected validateCreateTask to throw, but it did not');
}

describe('validateCreateTask（必須・制約）', () => {
  it('有効入力を正規化して返す', () => {
    const result = validateCreateTask(valid);
    expect(result).toMatchObject({
      title: '記事を書く',
      owner: 'cowork',
      handoff_note: '下書きお願いします',
      status: 'needs-ai',
    });
  });

  it.each(['title', 'owner', 'handoff_note'])('必須項目 %s の欠落は ValidationError(422)', (field) => {
    const { [field]: _omit, ...rest } = valid as Record<string, unknown>;
    const err = caught(() => validateCreateTask(rest));
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.status).toBe(422);
  });

  it('空白のみの title は欠落扱いで 422', () => {
    const err = caught(() => validateCreateTask({ ...valid, title: '   ' }));
    expect(err.status).toBe(422);
  });

  it.each(['in-progress', 'done', 'blocked'])('初期 status %s は 422', (status) => {
    const err = caught(() => validateCreateTask({ ...valid, status }));
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.status).toBe(422);
  });

  it('status 欠落は 422', () => {
    const { status: _s, ...rest } = valid;
    const err = caught(() => validateCreateTask(rest));
    expect(err.status).toBe(422);
  });

  it('未知の owner は 422', () => {
    const err = caught(() => validateCreateTask({ ...valid, owner: 'robot' }));
    expect(err.status).toBe(422);
  });
});

describe('validateCreateTask（既定値）', () => {
  it('priority/action_type/tags 省略時は P2 / other / [] を適用', () => {
    const result = validateCreateTask(valid);
    expect(result.priority).toBe('P2');
    expect(result.action_type).toBe('other');
    expect(result.tags).toEqual([]);
  });

  it('指定された priority/action_type/tags は尊重する', () => {
    const result = validateCreateTask({
      ...valid,
      priority: 'P0',
      action_type: 'research',
      tags: ['urgent'],
    });
    expect(result.priority).toBe('P0');
    expect(result.action_type).toBe('research');
    expect(result.tags).toEqual(['urgent']);
  });

  it('不正な priority は 422', () => {
    const err = caught(() => validateCreateTask({ ...valid, priority: 'P9' }));
    expect(err.status).toBe(422);
  });

  it('project/milestone 省略時は null を既定値にする', () => {
    const result = validateCreateTask(valid);
    expect(result.project).toBeNull();
    expect(result.milestone).toBeNull();
  });

  it('department 省略時は null を既定値にする', () => {
    expect(validateCreateTask(valid).department).toBeNull();
  });
});

describe('validateCreateTask（AI部署 / ADR-0006）', () => {
  it('AI 系 owner では有効な department を受理する', () => {
    expect(validateCreateTask({ ...valid, owner: 'cowork', department: 'engineering' }).department).toBe(
      'engineering',
    );
  });

  it('owner=human で department を指定すると 422', () => {
    const err = caught(() =>
      validateCreateTask({
        ...valid,
        owner: 'human',
        status: 'needs-human',
        department: 'engineering',
      }),
    );
    expect(err.status).toBe(422);
  });

  it('不正な department 値は 422', () => {
    const err = caught(() =>
      validateCreateTask({ ...valid, owner: 'cowork', department: 'marketing' }),
    );
    expect(err.status).toBe(422);
  });

  it('department 省略時の role 既定値は null', () => {
    expect(validateCreateTask({ ...valid, owner: 'cowork' }).role).toBeNull();
  });
});

describe('validateCreateTask（ロール / ADR-0006）', () => {
  it('department に属する role を受理する', () => {
    const result = validateCreateTask({
      ...valid,
      owner: 'cowork',
      department: 'engineering',
      role: 'code-review',
    });
    expect(result.role).toBe('code-review');
  });

  it('department に属さない role は 422', () => {
    const err = caught(() =>
      validateCreateTask({
        ...valid,
        owner: 'cowork',
        department: 'engineering',
        role: 'brand-voice',
      }),
    );
    expect(err.status).toBe(422);
  });

  it('department 未指定で role を指定すると 422', () => {
    const err = caught(() =>
      validateCreateTask({ ...valid, owner: 'cowork', role: 'code-review' }),
    );
    expect(err.status).toBe(422);
  });

  it('owner=human で role を指定すると 422', () => {
    const err = caught(() =>
      validateCreateTask({
        ...valid,
        owner: 'human',
        status: 'needs-human',
        role: 'code-review',
      }),
    );
    expect(err.status).toBe(422);
  });

  it('空文字の project/milestone は null に正規化する', () => {
    const result = validateCreateTask({ ...valid, project: '  ', milestone: '' });
    expect(result.project).toBeNull();
    expect(result.milestone).toBeNull();
  });
});

describe('buildTask', () => {
  test('buildTask は認証種別を created_by_type に刻む', () => {
    const normalized = validateCreateTask({
      title: 'T',
      owner: 'claude-code',
      handoff_note: 'メモ',
      status: 'needs-ai',
    });
    const deps = { id: () => 'id-1', now: () => '2026-07-19T00:00:00Z', actor: 'claude-code:ceo' };

    const machine = buildTask(normalized, { ...deps, actorType: 'machine' });
    expect(machine.created_by_type).toBe('machine');

    const human = buildTask(normalized, { ...deps, actorType: 'human' });
    expect(human.created_by_type).toBe('human');
  });

  it('created_at/updated_at と created の activity を付与する', () => {
    const normalized = validateCreateTask(valid);
    const task = buildTask(normalized, {
      id: () => 'task-1',
      now: () => '2026-06-01T00:00:00.000Z',
      actor: 'cowork',
      actorType: 'machine',
    });
    expect(task.id).toBe('task-1');
    expect(task.created_at).toBe('2026-06-01T00:00:00.000Z');
    expect(task.updated_at).toBe('2026-06-01T00:00:00.000Z');
    expect(task.blocked_reason).toBeNull();
    expect(task.review_cycles).toBe(0);
    expect(task.review_cycle_limit).toBeNull();
    expect(task.activity).toEqual([
      {
        timestamp: '2026-06-01T00:00:00.000Z',
        actor: 'cowork',
        action: 'created',
        session: null,
      },
    ]);
  });

  it('project/milestone を Task に刻む', () => {
    const normalized = validateCreateTask({
      ...valid,
      project: 'AIRFLOW',
      milestone: 'v3',
    });
    const task = buildTask(normalized, {
      id: () => 'task-1',
      now: () => '2026-06-01T00:00:00.000Z',
      actor: 'cowork',
      actorType: 'machine',
    });
    expect(task.project).toBe('AIRFLOW');
    expect(task.milestone).toBe('v3');
  });

  it('created_by に作成者(actor)を記録する', () => {
    const normalized = validateCreateTask(valid);
    const task = buildTask(normalized, {
      id: () => 'task-1',
      now: () => '2026-06-01T00:00:00.000Z',
      actor: 'taro@sunbit.co.jp',
      actorType: 'human',
    });
    expect(task.created_by).toBe('taro@sunbit.co.jp');
  });
});

describe('validateCreateTask: review_cycle_limit は作成時に指定不可（ADR-0007）', () => {
  it('review_cycle_limit を含む作成入力は 422 で拒否する（黙殺しない）', () => {
    expect(() =>
      validateCreateTask({
        title: 'T',
        owner: 'claude-code',
        handoff_note: 'メモ',
        status: 'needs-ai',
        review_cycle_limit: 2,
      }),
    ).toThrow(ValidationError);
  });

  it('null 指定でも作成時は 422（詳細編集経路のみ）', () => {
    expect(() =>
      validateCreateTask({
        title: 'T',
        owner: 'claude-code',
        handoff_note: 'メモ',
        status: 'needs-ai',
        review_cycle_limit: null,
      }),
    ).toThrow(ValidationError);
  });
});
