// テスト専用の Task フィクスチャ工場。ランタイム API（src/index.ts）には載せない。
// スキーマ追加時にこの1箇所だけ直せば全テストの既定値が揃うよう、全必須フィールドを埋める。

import type { Task } from './task.js';

/** テスト用の Task フィクスチャ。全必須フィールドを妥当な既定値で埋め、部分上書きで変形する。 */
export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'サンプルタスク',
    status: 'needs-ai',
    owner: 'human',
    priority: 'P2',
    action_type: 'other',
    handoff_note: 'メモ',
    blocked_reason: null,
    tags: [],
    department: null,
    role: null,
    project: null,
    milestone: null,
    created_by: 'creator@example.com',
    created_by_type: 'human',
    review_cycles: 0,
    review_cycle_limit: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    activity: [
      {
        timestamp: '2026-06-01T00:00:00.000Z',
        actor: 'creator@example.com',
        action: 'created',
      },
    ],
    ...overrides,
  };
}
