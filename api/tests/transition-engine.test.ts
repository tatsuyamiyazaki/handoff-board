import { describe, it, expect } from 'vitest';
import {
  applyTransition,
  allowedTransitions,
  canRecoverToReview,
  isHandoff,
  ValidationError,
  type Task,
  type TransitionDeps,
} from '@handoff/shared';
import { makeTask } from '@handoff/shared/testing';

const baseTask = (over: Partial<Task> = {}): Task =>
  makeTask({
    title: 'サンプル',
    owner: 'human',
    handoff_note: '最初のメモ',
    activity: [{ timestamp: '2026-06-01T00:00:00.000Z', actor: 'human', action: 'created' }],
    ...over,
  });

const deps: TransitionDeps = {
  now: () => '2026-06-01T09:00:00.000Z',
  actor: 'alice@example.com',
  actorType: 'human',
  reviewCycleLimit: 5,
};

const T = '2026-07-19T00:00:00Z';
function policyDeps(over: Partial<TransitionDeps> = {}): TransitionDeps {
  return {
    now: () => T,
    actor: 'claude-code:reviewer',
    actorType: 'machine',
    reviewCycleLimit: 5,
    ...over,
  };
}

function inReviewTask(over: Partial<Task> = {}): Task {
  return baseTask({
    status: 'in-review',
    owner: 'claude-code',
    review_cycles: 0,
    review_cycle_limit: null,
    activity: [
      { timestamp: T, actor: 'human@example.com', action: 'created' },
      {
        timestamp: T,
        actor: 'claude-code:dev',
        action: 'in-progress → in-review',
        from: 'in-progress',
        to: 'in-review',
      },
    ],
    ...over,
  });
}

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
    ['in-progress', 'in-review'],
    ['in-review', 'done'],
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
    ['in-progress', 'done'],
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
  it('in-progress からは needs-ai / needs-human / in-review / blocked', () => {
    expect(allowedTransitions('in-progress')).toEqual([
      'needs-ai',
      'needs-human',
      'in-review',
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

  it('blocked からは needs-ai / needs-human / in-review', () => {
    expect(allowedTransitions('blocked')).toEqual(['needs-ai', 'needs-human', 'in-review']);
  });
});

describe('in-review 遷移グラフ（ADR-0007）', () => {
  it('in-progress → done は許可されない（done の唯一の入口は in-review）', () => {
    expect(allowedTransitions('in-progress')).toEqual(
      expect.arrayContaining(['needs-ai', 'needs-human', 'in-review', 'blocked']),
    );
    expect(allowedTransitions('in-progress')).not.toContain('done');
  });

  it('in-review からは done / needs-ai / needs-human / blocked へ遷移できる', () => {
    expect(allowedTransitions('in-review').sort()).toEqual(
      ['blocked', 'done', 'needs-ai', 'needs-human'].sort(),
    );
  });

  it('blocked → in-review（レビュー中断からの復帰）が許可される', () => {
    expect(allowedTransitions('blocked')).toContain('in-review');
  });

  it('in-review → needs-ai / needs-human は handoff_note 必須', () => {
    expect(isHandoff('in-review', 'needs-ai')).toBe(true);
    expect(isHandoff('in-review', 'needs-human')).toBe(true);
    expect(isHandoff('in-progress', 'in-review')).toBe(false);
  });

  it('遷移の activity エントリに構造化 from/to が記録される', () => {
    const task = baseTask({
      status: 'in-progress',
      review_cycles: 2,
      review_cycle_limit: 5,
    });
    const next = applyTransition(task, { to: 'in-review' }, deps);
    const last = next.activity.at(-1)!;
    expect(last.from).toBe('in-progress');
    expect(last.to).toBe('in-review');
    expect(next.review_cycles).toBe(2);
    expect(next.review_cycle_limit).toBe(5);
  });
});

describe('差し戻し往復上限（ADR-0007）', () => {
  it('in-review → needs-ai で review_cycles がインクリメントされる', () => {
    const next = applyTransition(
      inReviewTask(),
      { to: 'needs-ai', handoff_note: '指摘' },
      policyDeps(),
    );
    expect(next.review_cycles).toBe(1);
  });

  it('遷移前の値で review_cycles >= limit なら 422（limit=5 なら6回目を拒否）', () => {
    expect(() =>
      applyTransition(
        inReviewTask({ review_cycles: 5 }),
        { to: 'needs-ai', handoff_note: '指摘' },
        policyDeps(),
      ),
    ).toThrow(ValidationError);

    const accepted = applyTransition(
      inReviewTask({ review_cycles: 4 }),
      { to: 'needs-ai', handoff_note: '指摘' },
      policyDeps(),
    );
    expect(accepted.review_cycles).toBe(5);
  });

  it('review_cycle_limit（タスク単位）がグローバル既定より優先される', () => {
    expect(() =>
      applyTransition(
        inReviewTask({ review_cycles: 2, review_cycle_limit: 2 }),
        { to: 'needs-ai', handoff_note: '指摘' },
        policyDeps(),
      ),
    ).toThrow(ValidationError);
  });

  it('上限到達後もエスカレーション（→ needs-human）は通る', () => {
    const next = applyTransition(
      inReviewTask({ review_cycles: 5 }),
      { to: 'needs-human', handoff_note: '5往復未解決' },
      policyDeps(),
    );
    expect(next.status).toBe('needs-human');
    expect(next.review_cycles).toBe(5);
  });
});

describe('リセット規定（ADR-0007）', () => {
  it('人間 actor が in-review 以外から needs-ai に入れるとリセットされる', () => {
    const next = applyTransition(
      baseTask({ status: 'in-progress', review_cycles: 3 }),
      { to: 'needs-ai', handoff_note: '再投入' },
      policyDeps({ actor: 'human@example.com', actorType: 'human' }),
    );
    expect(next.review_cycles).toBe(0);
  });

  it('機械系 actor による in-review 以外からの needs-ai handoff はカウンタを変えない', () => {
    const next = applyTransition(
      baseTask({ status: 'in-progress', review_cycles: 3 }),
      { to: 'needs-ai', handoff_note: '引き継ぎ' },
      policyDeps(),
    );
    expect(next.review_cycles).toBe(3);
  });

  it('人間レビュアーの差し戻し（in-review → needs-ai）はリセットでなくインクリメント', () => {
    const next = applyTransition(
      inReviewTask({ review_cycles: 2 }),
      { to: 'needs-ai', handoff_note: '指摘' },
      policyDeps({ actor: 'human@example.com', actorType: 'human' }),
    );
    expect(next.review_cycles).toBe(3);
  });
});

describe('自己レビュー排除（ADR-0007）', () => {
  it('直近の in-progress → in-review と同一 actor は done にできない（完全一致判定）', () => {
    expect(() =>
      applyTransition(
        inReviewTask(),
        { to: 'done' },
        policyDeps({ actor: 'claude-code:dev' }),
      ),
    ).toThrow(ValidationError);
  });

  it('別 actor（同 owner の別機能トークン）は done にできる', () => {
    const next = applyTransition(inReviewTask(), { to: 'done' }, policyDeps());
    expect(next.status).toBe('done');
  });

  it('同一 actor でも needs-human へのエスカレーションは許可される', () => {
    const next = applyTransition(
      inReviewTask(),
      { to: 'needs-human', handoff_note: '手に負えない' },
      policyDeps({ actor: 'claude-code:dev' }),
    );
    expect(next.status).toBe('needs-human');
  });

  it('owner=human × 人間 actor は自分で done にできる（人間例外）', () => {
    const task = inReviewTask({
      owner: 'human',
      activity: [
        {
          timestamp: T,
          actor: 'me@example.com',
          action: 'in-progress → in-review',
          from: 'in-progress',
          to: 'in-review',
        },
      ],
    });
    const next = applyTransition(
      task,
      { to: 'done' },
      policyDeps({ actor: 'me@example.com', actorType: 'human' }),
    );
    expect(next.status).toBe('done');
  });

  it('owner が AI のタスクは人間でも自己レビューを通せない', () => {
    const task = inReviewTask({
      owner: 'claude-code',
      activity: [
        {
          timestamp: T,
          actor: 'me@example.com',
          action: 'in-progress → in-review',
          from: 'in-progress',
          to: 'in-review',
        },
      ],
    });
    expect(() =>
      applyTransition(
        task,
        { to: 'done' },
        policyDeps({ actor: 'me@example.com', actorType: 'human' }),
      ),
    ).toThrow(ValidationError);
  });

  it('構造化 from/to を持つエントリが無い旧データは判定不能として通す', () => {
    const task = inReviewTask({
      activity: [{ timestamp: T, actor: 'claude-code:dev', action: 'in-progress → in-review' }],
    });
    const next = applyTransition(
      task,
      { to: 'done' },
      policyDeps({ actor: 'claude-code:dev' }),
    );
    expect(next.status).toBe('done');
  });

  it('blocked 迂回後も直近の in-progress → in-review エントリで判定される', () => {
    const task = inReviewTask({
      activity: [
        {
          timestamp: T,
          actor: 'claude-code:dev',
          action: 'in-progress → in-review',
          from: 'in-progress',
          to: 'in-review',
        },
        {
          timestamp: T,
          actor: 'claude-code:dev',
          action: 'in-review → blocked',
          from: 'in-review',
          to: 'blocked',
        },
        {
          timestamp: T,
          actor: 'human@example.com',
          action: 'blocked → in-review',
          from: 'blocked',
          to: 'in-review',
        },
      ],
    });
    expect(() =>
      applyTransition(
        task,
        { to: 'done' },
        policyDeps({ actor: 'claude-code:dev' }),
      ),
    ).toThrow(ValidationError);
  });
});

describe('blocked → in-review の復帰条件（ADR-0007）', () => {
  it('作業状態から blocked へ入ったタスクは in-review に迂回できない', () => {
    const blocked = applyTransition(
      baseTask({ status: 'needs-ai' }),
      { to: 'blocked', blocked_reason: '実装前の依存待ち' },
      policyDeps({ actor: 'claude-code:dev' }),
    );

    expect(() =>
      applyTransition(blocked, { to: 'in-review' }, policyDeps({ actor: 'claude-code:dev' })),
    ).toThrow(ValidationError);
  });

  it('in-review から blocked へ中断したタスクは in-review に復帰できる', () => {
    const blocked = applyTransition(
      inReviewTask(),
      { to: 'blocked', blocked_reason: 'レビュー環境の復旧待ち' },
      policyDeps(),
    );
    const recovered = applyTransition(blocked, { to: 'in-review' }, policyDeps());

    expect(recovered.status).toBe('in-review');
  });
});

/** 実装者 dev が提出後、レビュー中断で blocked になったタスク。 */
function reviewInterruptedTask(over: Partial<Task> = {}): Task {
  return inReviewTask({
    status: 'blocked',
    blocked_reason: '外部要因',
    activity: [
      { timestamp: T, actor: 'human@example.com', action: 'created' },
      {
        timestamp: T,
        actor: 'claude-code:dev',
        action: 'in-progress → in-review',
        from: 'in-progress',
        to: 'in-review',
      },
      {
        timestamp: T,
        actor: 'claude-code:reviewer',
        action: 'in-review → blocked',
        from: 'in-review',
        to: 'blocked',
      },
    ],
    ...over,
  });
}

describe('blocked 迂回の差し戻し（レビュー中断中の blocked → needs-ai、ADR-0007 補強）', () => {
  it('レビュー中断中の blocked → needs-ai は差し戻しとして review_cycles をインクリメントする', () => {
    const next = applyTransition(
      reviewInterruptedTask(),
      { to: 'needs-ai', handoff_note: '指摘' },
      policyDeps(),
    );
    expect(next.review_cycles).toBe(1);
  });

  it('上限到達後は blocked 迂回でも 422 になる（上限バイパスの遮断）', () => {
    const task = reviewInterruptedTask({ review_cycles: 5 });
    expect(() =>
      applyTransition(task, { to: 'needs-ai', handoff_note: '指摘' }, policyDeps()),
    ).toThrow(ValidationError);
  });

  it('上限到達後もエスカレーション（blocked → needs-human）は通る', () => {
    const next = applyTransition(
      reviewInterruptedTask({ review_cycles: 5 }),
      { to: 'needs-human', handoff_note: '5往復未解決' },
      policyDeps(),
    );
    expect(next.status).toBe('needs-human');
    expect(next.review_cycles).toBe(5);
  });

  it('提出者と同一 actor は blocked 迂回でも差し戻せない（自己レビュー排除）', () => {
    expect(() =>
      applyTransition(
        reviewInterruptedTask(),
        { to: 'needs-ai', handoff_note: '自分で差し戻し' },
        policyDeps({ actor: 'claude-code:dev' }),
      ),
    ).toThrow(ValidationError);
  });

  it('人間のレビュー由来差し戻しは blocked 迂回でもリセットでなくインクリメント', () => {
    const next = applyTransition(
      reviewInterruptedTask({ review_cycles: 2 }),
      { to: 'needs-ai', handoff_note: '指摘' },
      policyDeps({ actor: 'human@example.com', actorType: 'human' }),
    );
    expect(next.review_cycles).toBe(3);
  });

  it('レビュー由来でない blocked → needs-ai は従来どおり（機械は不変・人間はリセット）', () => {
    const task = baseTask({
      status: 'blocked',
      blocked_reason: '依存待ち',
      review_cycles: 3,
      activity: [
        {
          timestamp: T,
          actor: 'claude-code:dev',
          action: 'in-progress → blocked',
          from: 'in-progress',
          to: 'blocked',
        },
      ],
    });
    const machine = applyTransition(
      task,
      { to: 'needs-ai', handoff_note: '引き継ぎ' },
      policyDeps(),
    );
    expect(machine.review_cycles).toBe(3);
    const human = applyTransition(
      task,
      { to: 'needs-ai', handoff_note: '再投入' },
      policyDeps({ actor: 'human@example.com', actorType: 'human' }),
    );
    expect(human.review_cycles).toBe(0);
  });
});

describe('canRecoverToReview: 非遷移エントリ（from/to=null）を遷移と誤認しない', () => {
  it('from/to が null のエントリが後続しても in-review へ復帰できる', () => {
    const base = reviewInterruptedTask();
    const task = reviewInterruptedTask({
      activity: [
        ...base.activity,
        { timestamp: T, actor: 'human@example.com', action: 'edited', from: null, to: null },
      ],
    });
    expect(canRecoverToReview(task)).toBe(true);
    const next = applyTransition(task, { to: 'in-review' }, policyDeps());
    expect(next.status).toBe('in-review');
  });
});
