import { describe, it, expect } from 'vitest';
import type { Task } from '@handoff/shared';
import { makeTask } from '@handoff/shared/testing';
import { summarizeBoard, filterTasks, distinctValues, ALL } from './board-view';

const task = (over: Partial<Task> = {}): Task =>
  makeTask({
    title: 'サンプル',
    owner: 'cowork',
    handoff_note: '',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    activity: [],
    ...over,
  });

describe('summarizeBoard', () => {
  it('人間アサイン・in-progress・in-review・blocked の件数を数える', () => {
    const summary = summarizeBoard([
      task({ id: '1', owner: 'human', status: 'needs-human' }),
      task({ id: '2', owner: 'human', status: 'in-progress' }),
      task({ id: '3', owner: 'cowork', status: 'in-progress' }),
      task({ id: '4', owner: 'cowork', status: 'blocked' }),
      task({ id: '5', owner: 'claude-code', status: 'done' }),
      task({ id: '6', owner: 'cowork', status: 'in-review' }),
    ]);

    expect(summary.humanAssigned).toBe(2); // owner=human の2件
    expect(summary.inProgress).toBe(2); // status=in-progress の2件
    expect(summary.inReview).toBe(1); // status=in-review の1件
    expect(summary.blocked).toBe(1); // status=blocked の1件
  });
});

describe('filterTasks', () => {
  const tasks = [
    task({ id: '1', owner: 'human', project: 'PJ-A', milestone: 'v1', department: null }),
    task({ id: '2', owner: 'cowork', project: 'PJ-A', milestone: 'v2', department: 'engineering' }),
    task({ id: '3', owner: 'cowork', project: 'PJ-B', milestone: null, department: 'contents' }),
  ];

  it('既定（すべて ALL）では全件を返す', () => {
    const result = filterTasks(tasks, { owner: ALL, department: ALL, project: ALL, milestone: ALL });
    expect(result.map((t) => t.id)).toEqual(['1', '2', '3']);
  });

  it('owner で絞り込む', () => {
    const result = filterTasks(tasks, { owner: 'cowork', department: ALL, project: ALL, milestone: ALL });
    expect(result.map((t) => t.id)).toEqual(['2', '3']);
  });

  it('department で絞り込む（ADR-0006）', () => {
    const result = filterTasks(tasks, { owner: ALL, department: 'engineering', project: ALL, milestone: ALL });
    expect(result.map((t) => t.id)).toEqual(['2']);
  });

  it('project で絞り込む', () => {
    const result = filterTasks(tasks, { owner: ALL, department: ALL, project: 'PJ-A', milestone: ALL });
    expect(result.map((t) => t.id)).toEqual(['1', '2']);
  });

  it('milestone で絞り込む', () => {
    const result = filterTasks(tasks, { owner: ALL, department: ALL, project: ALL, milestone: 'v2' });
    expect(result.map((t) => t.id)).toEqual(['2']);
  });

  it('複数条件は AND で重ねる', () => {
    const result = filterTasks(tasks, { owner: 'cowork', department: ALL, project: 'PJ-A', milestone: ALL });
    expect(result.map((t) => t.id)).toEqual(['2']);
  });
});

describe('distinctValues', () => {
  const tasks = [
    task({ id: '1', project: 'PJ-A' }),
    task({ id: '2', project: 'PJ-B' }),
    task({ id: '3', project: 'PJ-A' }),
    task({ id: '4', project: null }),
  ];

  it('指定キーの非 null な値を重複なく昇順で返す', () => {
    expect(distinctValues(tasks, 'project')).toEqual(['PJ-A', 'PJ-B']);
  });
});
