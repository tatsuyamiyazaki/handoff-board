import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HandoffDesktopBridge, RunEvent } from '@handoff/shared';
import { RunPanel } from './RunPanel';
import { BoundedRunLogBuffer } from './useRunEvents';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((fulfill, rejectPromise) => {
    resolve = fulfill;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makeBridge(overrides: Partial<HandoffDesktopBridge> = {}): {
  bridge: HandoffDesktopBridge;
  emit: (ev: RunEvent) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
} {
  let handler: ((ev: RunEvent) => void) | null = null;
  const unsubscribe = vi.fn(() => {
    handler = null;
  });
  const bridge = {
    runTask: vi.fn(),
    cancelRun: vi.fn().mockResolvedValue(undefined),
    listRuns: vi.fn().mockResolvedValue([]),
    getRunLog: vi.fn().mockResolvedValue({ log: '', lastSequence: 0 }),
    onRunEvent: vi.fn((cb: (ev: RunEvent) => void) => {
      handler = cb;
      return unsubscribe;
    }),
    getSettings: vi.fn(),
    setSettings: vi.fn(),
    pickFolder: vi.fn(),
    signIn: vi.fn(),
    ...overrides,
  } as unknown as HandoffDesktopBridge;
  return { bridge, emit: (ev) => handler?.(ev), unsubscribe };
}

const RUNNING = {
  runId: 'run-1',
  taskId: 't1',
  taskTitle: 'タスクA',
  cliName: 'Claude Code',
  status: 'running',
  exitCode: null,
} as const;

describe('BoundedRunLogBuffer', () => {
  it('実行ごとに文字数を制限し、途中で切った chunk の sequence を保持する', () => {
    const buffer = new BoundedRunLogBuffer(5);

    buffer.append('run-1', { chunk: 'abcd', sequence: 1 });
    buffer.append('run-2', { chunk: '12345', sequence: 1 });
    buffer.append('run-1', { chunk: 'efgh', sequence: 2 });

    expect(buffer.get('run-1')).toEqual([
      { chunk: 'd', sequence: 1 },
      { chunk: 'efgh', sequence: 2 },
    ]);
    expect(buffer.get('run-2')).toEqual([{ chunk: '12345', sequence: 1 }]);

    buffer.clear();
    expect([...buffer.entries()]).toEqual([]);
  });
});

describe('RunPanel', () => {
  it('ブリッジが無ければ何も描画しない', () => {
    const { container } = render(<RunPanel bridge={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('status イベントで実行が一覧に現れ、stdout がログに追記される', async () => {
    const { bridge, emit } = makeBridge();
    render(<RunPanel bridge={bridge} />);
    await waitFor(() => expect(bridge.listRuns).toHaveBeenCalled());

    act(() => {
      emit({ runId: 'run-1', type: 'status', run: { ...RUNNING } });
      emit({ runId: 'run-1', type: 'stdout', chunk: 'こんにちは\n', sequence: 1 });
    });

    expect(screen.getByText('タスクA')).toBeInTheDocument();
    expect(screen.getByText(/running/)).toBeInTheDocument();
    expect(screen.getByText(/こんにちは/)).toBeInTheDocument();
  });

  it('実行中はキャンセルボタンが出て cancelRun を呼ぶ', async () => {
    const user = userEvent.setup();
    const { bridge, emit } = makeBridge();
    render(<RunPanel bridge={bridge} />);
    await waitFor(() => expect(bridge.listRuns).toHaveBeenCalled());

    act(() => {
      emit({ runId: 'run-1', type: 'status', run: { ...RUNNING } });
    });
    await user.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(bridge.cancelRun).toHaveBeenCalledWith('run-1');

    act(() => {
      emit({
        runId: 'run-1',
        type: 'status',
        run: { ...RUNNING, status: 'cancelled' },
      });
    });
    expect(screen.queryByRole('button', { name: 'キャンセル' })).not.toBeInTheDocument();
  });
  it('保持済みログを初期一覧と一緒に復元する', async () => {
    const user = userEvent.setup();
    const finished = { ...RUNNING, status: 'failed' as const, exitCode: 1 };
    const { bridge } = makeBridge({
      listRuns: vi.fn().mockResolvedValue([finished]),
      getRunLog: vi.fn().mockResolvedValue({ log: 'previous error\n', lastSequence: 0 }),
    });
    render(<RunPanel bridge={bridge} />);
    expect(await screen.findByText('タスクA')).toBeInTheDocument();
    await user.click(screen.getByText('タスクA'));
    expect(screen.getByText(/previous error/)).toBeInTheDocument();
  });

  it('初期ログ取得中のイベントを sequence で snapshot と突き合わせる', async () => {
    const snapshot = deferred<{ log: string; lastSequence: number }>();
    const { bridge, emit } = makeBridge({
      listRuns: vi.fn().mockResolvedValue([RUNNING]),
      getRunLog: vi.fn().mockReturnValue(snapshot.promise),
    });
    render(<RunPanel bridge={bridge} />);
    await waitFor(() => expect(bridge.getRunLog).toHaveBeenCalledWith('run-1'));

    act(() => {
      emit({ runId: 'run-1', type: 'stdout', chunk: 'already in snapshot\n', sequence: 1 });
      emit({ runId: 'run-1', type: 'stderr', chunk: 'new live chunk\n', sequence: 2 });
    });
    await act(async () => {
      snapshot.resolve({ log: 'snapshot log\n', lastSequence: 1 });
      await snapshot.promise;
    });

    await waitFor(() => {
      expect(screen.getByText(/snapshot log/).textContent).toBe('snapshot log\nnew live chunk\n');
    });
  });

  it('初期一覧にない実行の buffered log を初期化後も保持する', async () => {
    const snapshot = deferred<{ log: string; lastSequence: number }>();
    const historical = { ...RUNNING, runId: 'run-old', status: 'succeeded' as const, exitCode: 0 };
    const live = { ...RUNNING, runId: 'run-live', taskId: 't-live', taskTitle: 'ライブ実行' };
    const { bridge, emit } = makeBridge({
      listRuns: vi.fn().mockResolvedValue([historical]),
      getRunLog: vi.fn().mockReturnValue(snapshot.promise),
    });
    render(<RunPanel bridge={bridge} />);
    await waitFor(() => expect(bridge.getRunLog).toHaveBeenCalledWith('run-old'));

    act(() => {
      emit({ runId: 'run-live', type: 'status', run: live });
      emit({ runId: 'run-live', type: 'stdout', chunk: 'buffer only\n', sequence: 1 });
    });
    await act(async () => {
      snapshot.resolve({ log: 'historical\n', lastSequence: 1 });
      await snapshot.promise;
    });

    expect(await screen.findByText('ライブ実行')).toBeInTheDocument();
    expect(screen.getByText('buffer only')).toBeInTheDocument();
  });

  it('snapshot から復元したログもクライアント上限に収める', async () => {
    const { bridge } = makeBridge({
      listRuns: vi.fn().mockResolvedValue([RUNNING]),
      getRunLog: vi.fn().mockResolvedValue({ log: `a${'x'.repeat(200_000)}`, lastSequence: 1 }),
    });
    render(<RunPanel bridge={bridge} />);

    expect(await screen.findByText('タスクA')).toBeInTheDocument();
    await waitFor(() => {
      const log = document.querySelector('.run-panel__log');
      expect(log?.textContent).toHaveLength(200_000);
      expect(log?.textContent).not.toContain('a');
    });
  });

  it('一部の snapshot 取得が失敗しても成功分と各 buffered log を復元する', async () => {
    const successfulSnapshot = deferred<{ log: string; lastSequence: number }>();
    const failedSnapshot = deferred<{ log: string; lastSequence: number }>();
    const successfulRun = { ...RUNNING, runId: 'run-success', taskTitle: '成功実行' };
    const failedRun = { ...RUNNING, runId: 'run-failed', taskTitle: '失敗実行' };
    const { bridge, emit } = makeBridge({
      listRuns: vi.fn().mockResolvedValue([successfulRun, failedRun]),
      getRunLog: vi.fn((runId: string) =>
        runId === 'run-success' ? successfulSnapshot.promise : failedSnapshot.promise,
      ),
    });
    render(<RunPanel bridge={bridge} />);
    await waitFor(() => expect(bridge.getRunLog).toHaveBeenCalledTimes(2));

    act(() => {
      emit({ runId: 'run-success', type: 'stdout', chunk: 'already saved\n', sequence: 1 });
      emit({ runId: 'run-success', type: 'stdout', chunk: 'success live\n', sequence: 2 });
      emit({ runId: 'run-failed', type: 'stderr', chunk: 'failed live\n', sequence: 1 });
    });
    await act(async () => {
      successfulSnapshot.resolve({ log: 'successful snapshot\n', lastSequence: 1 });
      failedSnapshot.reject(new Error('snapshot unavailable'));
      await Promise.allSettled([successfulSnapshot.promise, failedSnapshot.promise]);
    });

    await waitFor(() => {
      const successfulLog = screen.getByText('成功実行').closest('li')?.querySelector('pre');
      const failedLog = screen.getByText('失敗実行').closest('li')?.querySelector('pre');
      expect(successfulLog?.textContent).toBe('successful snapshot\nsuccess live\n');
      expect(failedLog?.textContent).toBe('failed live\n');
    });
  });

  it('初期化中に unmount すると buffer と購読を破棄し、遅い snapshot を無視する', async () => {
    const snapshot = deferred<{ log: string; lastSequence: number }>();
    const clearSpy = vi.spyOn(BoundedRunLogBuffer.prototype, 'clear');
    const { bridge, emit, unsubscribe } = makeBridge({
      listRuns: vi.fn().mockResolvedValue([RUNNING]),
      getRunLog: vi.fn().mockReturnValue(snapshot.promise),
    });
    const { unmount } = render(<RunPanel bridge={bridge} />);
    await waitFor(() => expect(bridge.getRunLog).toHaveBeenCalledWith('run-1'));
    act(() => {
      emit({ runId: 'run-1', type: 'stdout', chunk: 'pending live\n', sequence: 1 });
    });

    unmount();
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);

    await act(async () => {
      snapshot.resolve({ log: 'late snapshot\n', lastSequence: 1 });
      await snapshot.promise;
    });
    expect(screen.queryByLabelText('CLI 実行ログ')).not.toBeInTheDocument();
    clearSpy.mockRestore();
  });
});
