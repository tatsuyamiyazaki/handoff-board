import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HandoffDesktopBridge, RunEvent } from '@handoff/shared';
import { RunPanel } from './RunPanel';

function makeBridge(): { bridge: HandoffDesktopBridge; emit: (ev: RunEvent) => void } {
  let handler: ((ev: RunEvent) => void) | null = null;
  const bridge = {
    runTask: vi.fn(),
    cancelRun: vi.fn().mockResolvedValue(undefined),
    listRuns: vi.fn().mockResolvedValue([]),
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
      emit({ runId: 'run-1', type: 'stdout', chunk: 'こんにちは\n' });
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
});
