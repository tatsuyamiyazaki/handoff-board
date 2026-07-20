import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Task } from '@handoff/shared';
import { useBoard, BOARD_POLL_INTERVAL_MS } from './useBoard';

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'サンプル',
  status: 'needs-ai',
  owner: 'cowork',
  priority: 'P2',
  action_type: 'other',
  handoff_note: 'お願いします',
  blocked_reason: null,
  department: null,
  role: null,
  project: null,
  milestone: null,
  tags: [],
  created_by: 'creator@example.com',
  created_by_type: 'human',
  review_cycles: 0,
  review_cycle_limit: null,
  created_at: '2026-06-01T00:00:00.000Z',
  updated_at: '2026-06-01T00:00:00.000Z',
  activity: [],
  ...over,
});

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useBoard', () => {
  it('ポーリング間隔は 10〜15 秒の範囲', () => {
    expect(BOARD_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(10_000);
    expect(BOARD_POLL_INTERVAL_MS).toBeLessThanOrEqual(15_000);
  });

  it('初期取得でボードを返す', async () => {
    const queryFn = vi.fn().mockResolvedValue([task({ id: 'a' })]);
    const { result } = renderHook(() => useBoard({ queryFn }), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data?.[0].id).toBe('a');
  });

  it('指定間隔で再取得し、他クライアントの変更を反映する', async () => {
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce([task({ id: 'a' })])
      .mockResolvedValue([task({ id: 'a' }), task({ id: 'b' })]);
    const { result } = renderHook(() => useBoard({ queryFn, refetchInterval: 20 }), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(result.current.data?.map((t) => t.id).sort()).toEqual(['a', 'b']);
  });
});
