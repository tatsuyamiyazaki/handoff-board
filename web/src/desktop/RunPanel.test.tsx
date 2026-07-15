import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HandoffDesktopBridge, RunEvent } from '@handoff/shared';
import { RunPanel } from './RunPanel';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

function makeBridge(overrides: Partial<HandoffDesktopBridge> = {}): { bridge: HandoffDesktopBridge; emit: (ev: RunEvent) => void } {
  let handler: ((ev: RunEvent) => void) | null = null;
  const bridge = {
    runTask: vi.fn(),
    cancelRun: vi.fn().mockResolvedValue(undefined),
    listRuns: vi.fn().mockResolvedValue([]),
    getRunLog: vi.fn().mockResolvedValue({ log: '', lastSequence: 0 }),
    onRunEvent: vi.fn((cb: (ev: RunEvent) => void) => {
      handler = cb;
      return () => {
        handler = null;
      };
    }),
    getSettings: vi.fn(),
    setSettings: vi.fn(),
    pickFolder: vi.fn(),
    signIn: vi.fn(),
    ...overrides,
  } as unknown as HandoffDesktopBridge;
  return { bridge, emit: (ev) => handler?.(ev) };
}

const RUNNING = {
  runId: 'run-1',
  taskId: 't1',
  taskTitle: 'タスクA',
  cliName: 'Claude Code',
  status: 'running',
  exitCode: null,
} as const;

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
});
