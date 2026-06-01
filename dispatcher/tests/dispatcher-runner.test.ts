import { describe, it, expect, vi } from 'vitest';
import type { Task } from '@handoff/shared';
import { runOnce, type DispatcherClient } from '../src/dispatcher-runner.js';

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'サンプル',
  status: 'needs-ai',
  owner: 'ai-batch',
  priority: 'P2',
  action_type: 'other',
  handoff_note: 'お願いします',
  blocked_reason: null,
  tags: [],
  created_by: 'creator@example.com',
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-04T00:00:00.000Z',
  activity: [],
  ...over,
});

/** 呼び出しを記録する fake REST クライアント（Firestore 直アクセスがないことの担保）。 */
function fakeClient(board: Task[]): DispatcherClient & {
  blockCalls: { id: string; reason: string }[];
} {
  const blockCalls: { id: string; reason: string }[] = [];
  return {
    blockCalls,
    async fetchBoard() {
      return board;
    },
    async blockTask(id, reason, _updatedAt) {
      blockCalls.push({ id, reason });
      return task({ id, status: 'blocked', blocked_reason: reason });
    },
  };
}

const now = () => '2026-06-04T00:00:00.000Z';

describe('runOnce: ディスパッチャー1回実行', () => {
  it('対象1件を選定して processTask を呼ぶ', async () => {
    const client = fakeClient([task({ id: 'a' })]);
    const processTask = vi.fn().mockResolvedValue(undefined);

    const result = await runOnce({ client, processTask, now });

    expect(processTask).toHaveBeenCalledTimes(1);
    expect(processTask.mock.calls[0][0].id).toBe('a');
    expect(result.processed).toBe('a');
  });

  it('対象0件のときは processTask を呼ばず安全に何もしない', async () => {
    const client = fakeClient([task({ id: 'h', owner: 'human' })]);
    const processTask = vi.fn();

    const result = await runOnce({ client, processTask, now });

    expect(processTask).not.toHaveBeenCalled();
    expect(result.processed).toBeNull();
  });

  it('processTask 失敗時は対象を理由付きで blockTask し、失敗を握りつぶさず記録する', async () => {
    const client = fakeClient([task({ id: 'a' })]);
    const processTask = vi.fn().mockRejectedValue(new Error('LLM タイムアウト'));

    const result = await runOnce({ client, processTask, now });

    expect(client.blockCalls).toHaveLength(1);
    expect(client.blockCalls[0].id).toBe('a');
    expect(client.blockCalls[0].reason).toContain('LLM タイムアウト');
    expect(result.failed?.id).toBe('a');
  });

  it('72時間 status 無変更のタスクを blockTask で blocked にする（掃引）', async () => {
    const client = fakeClient([
      task({ id: 'stale', status: 'needs-human', updated_at: '2026-05-31T00:00:00.000Z' }),
    ]);
    const processTask = vi.fn();

    const result = await runOnce({ client, processTask, now });

    expect(client.blockCalls.map((c) => c.id)).toContain('stale');
    expect(result.swept).toContain('stale');
  });
});
