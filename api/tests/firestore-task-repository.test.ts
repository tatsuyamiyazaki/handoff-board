import { describe, expect, it } from 'vitest';
import type { Task } from '@handoff/shared';
import { toTask } from '../src/repository/firestore-task-repository.js';

const storedTask: Omit<Task, 'id'> = {
  title: '保存済みタスク',
  status: 'in-review',
  owner: 'claude-code',
  priority: 'P2',
  action_type: 'review',
  handoff_note: 'レビューしてください',
  blocked_reason: null,
  tags: [],
  department: 'engineering',
  role: 'code-review',
  project: null,
  milestone: null,
  created_by: 'claude-code:dev',
  created_by_type: 'machine',
  created_at: '2026-07-19T00:00:00Z',
  updated_at: '2026-07-19T01:00:00Z',
  review_cycles: 2,
  review_cycle_limit: 5,
  activity: [],
};

describe('Firestore Task hydration（ADR-0007）', () => {
  it('旧データで review fields が欠落していれば 0 / null を補完する', () => {
    const {
      review_cycles: _reviewCycles,
      review_cycle_limit: _reviewCycleLimit,
      ...legacy
    } = storedTask;

    expect(toTask('legacy', legacy)).toMatchObject({
      id: 'legacy',
      review_cycles: 0,
      review_cycle_limit: null,
    });
  });

  it('保存済みの非既定 review fields は既定値より優先する', () => {
    expect(toTask('stored', storedTask)).toMatchObject({
      id: 'stored',
      review_cycles: 2,
      review_cycle_limit: 5,
    });
  });
});

// Firestore エミュレータ（JVM 必須）が現環境に無いため skip。
// Java + firebase CLI 導入後にエミュレータ起動し、findAll が board コレクションの
// 全ドキュメントを Task として返すことを検証する。配線自体は src で実装済み。
describe.skip('FirestoreTaskRepository.findAll（要 Firestore エミュレータ）', () => {
  it('board コレクションの全ドキュメントを Task 配列で返す', () => {
    // emulator 導入後に実装
  });
});
