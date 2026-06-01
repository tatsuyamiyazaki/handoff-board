import { describe, it, expect } from 'vitest';
import { validateCreateTask, buildTask, ValidationError } from '@handoff/shared';

const valid = {
  title: '記事を書く',
  owner: 'ai-batch',
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
      owner: 'ai-batch',
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

  it('agent/project/milestone 省略時は null を既定値にする', () => {
    const result = validateCreateTask(valid);
    expect(result.agent).toBeNull();
    expect(result.project).toBeNull();
    expect(result.milestone).toBeNull();
  });

  it('空文字の project/milestone は null に正規化する', () => {
    const result = validateCreateTask({ ...valid, project: '  ', milestone: '' });
    expect(result.project).toBeNull();
    expect(result.milestone).toBeNull();
  });
});

describe('validateCreateTask（agent と owner の二軸 / ADR-0004）', () => {
  it('AI 系 owner では有効な agent を受理する', () => {
    const result = validateCreateTask({ ...valid, owner: 'ai-batch', agent: 'codex' });
    expect(result.agent).toBe('codex');
  });

  it('owner=human で agent を指定すると 422', () => {
    const err = caught(() =>
      validateCreateTask({
        ...valid,
        owner: 'human',
        status: 'needs-human',
        agent: 'codex',
      }),
    );
    expect(err.status).toBe(422);
  });

  it('不正な agent 値は 422', () => {
    const err = caught(() => validateCreateTask({ ...valid, owner: 'ai-batch', agent: 'bard' }));
    expect(err.status).toBe(422);
  });
});

describe('buildTask', () => {
  it('created_at/updated_at と created の activity を付与する', () => {
    const normalized = validateCreateTask(valid);
    const task = buildTask(normalized, {
      id: () => 'task-1',
      now: () => '2026-06-01T00:00:00.000Z',
      actor: 'ai-batch',
    });
    expect(task.id).toBe('task-1');
    expect(task.created_at).toBe('2026-06-01T00:00:00.000Z');
    expect(task.updated_at).toBe('2026-06-01T00:00:00.000Z');
    expect(task.blocked_reason).toBeNull();
    expect(task.activity).toEqual([
      { timestamp: '2026-06-01T00:00:00.000Z', actor: 'ai-batch', action: 'created' },
    ]);
  });

  it('agent/project/milestone を Task に刻む', () => {
    const normalized = validateCreateTask({
      ...valid,
      agent: 'codex',
      project: 'AIRFLOW',
      milestone: 'v3',
    });
    const task = buildTask(normalized, {
      id: () => 'task-1',
      now: () => '2026-06-01T00:00:00.000Z',
      actor: 'ai-batch',
    });
    expect(task.agent).toBe('codex');
    expect(task.project).toBe('AIRFLOW');
    expect(task.milestone).toBe('v3');
  });

  it('created_by に作成者(actor)を記録する', () => {
    const normalized = validateCreateTask(valid);
    const task = buildTask(normalized, {
      id: () => 'task-1',
      now: () => '2026-06-01T00:00:00.000Z',
      actor: 'taro@sunbit.co.jp',
    });
    expect(task.created_by).toBe('taro@sunbit.co.jp');
  });
});
