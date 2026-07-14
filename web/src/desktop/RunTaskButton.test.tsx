import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HandoffDesktopBridge, Task } from '@handoff/shared';
import { RunTaskButton } from './RunTaskButton';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'AI にやってほしい仕事',
    status: 'needs-ai',
    owner: 'claude-code',
    department: null,
    role: null,
    priority: 'P2',
    action_type: 'other',
    tags: [],
    handoff_note: '',
    blocked_reason: null,
    project: 'handoff',
    milestone: null,
    created_by: 'me@example.com',
    created_at: '2026-07-14T00:00:00.000Z',
    updated_at: '2026-07-14T00:00:00.000Z',
    activity: [],
    ...overrides,
  } as Task;
}

function makeBridge(overrides: Partial<HandoffDesktopBridge> = {}): HandoffDesktopBridge {
  return {
    runTask: vi.fn().mockResolvedValue({ runId: 'run-1' }),
    cancelRun: vi.fn(),
    listRuns: vi.fn().mockResolvedValue([]),
    onRunEvent: vi.fn().mockReturnValue(() => {}),
    getSettings: vi.fn().mockResolvedValue({
      apiBaseUrl: '',
      cliDefinitions: [
        {
          id: 'claude-code',
          name: 'Claude Code',
          command: 'claude',
          argsTemplate: ['-p', '{prompt}'],
          defaultForOwners: ['claude-code'],
        },
        {
          id: 'codex',
          name: 'Codex CLI',
          command: 'codex',
          argsTemplate: ['exec', '{prompt}'],
          defaultForOwners: ['codex'],
        },
      ],
      projectFolderMap: { handoff: 'C:/dev/handoff' },
      promptTemplate: 'do {taskId}',
    }),
    setSettings: vi.fn().mockResolvedValue({}),
    pickFolder: vi.fn().mockResolvedValue('C:/picked'),
    signIn: vi.fn(),
    ...overrides,
  } as HandoffDesktopBridge;
}

describe('RunTaskButton', () => {
  it('ブリッジが無ければ何も描画しない', () => {
    const { container } = render(<RunTaskButton task={makeTask()} bridge={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('human オーナーのタスクには表示しない', () => {
    const { container } = render(
      <RunTaskButton task={makeTask({ owner: 'human' })} bridge={makeBridge()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('ダイアログで owner に対応する CLI が既定選択され、実行できる', async () => {
    const user = userEvent.setup();
    const bridge = makeBridge();
    render(<RunTaskButton task={makeTask()} bridge={bridge} />);

    await user.click(screen.getByRole('button', { name: 'AI実行' }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'CLI' })).toHaveValue('claude-code'),
    );
    expect(screen.getByText('C:/dev/handoff')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '実行' }));
    await waitFor(() =>
      expect(bridge.runTask).toHaveBeenCalledWith({
        taskId: 'task-1',
        taskTitle: 'AI にやってほしい仕事',
        cliId: 'claude-code',
        cwd: 'C:/dev/handoff',
      }),
    );
  });

  it('未マッピングの project はフォルダ選択で解決し、マッピングを保存する', async () => {
    const user = userEvent.setup();
    const bridge = makeBridge();
    render(<RunTaskButton task={makeTask({ project: 'newproj' })} bridge={bridge} />);

    await user.click(screen.getByRole('button', { name: 'AI実行' }));
    await waitFor(() => screen.getByRole('button', { name: 'フォルダを選択' }));
    expect(screen.getByRole('button', { name: '実行' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'フォルダを選択' }));
    await waitFor(() =>
      expect(bridge.setSettings).toHaveBeenCalledWith({
        projectFolderMap: { handoff: 'C:/dev/handoff', newproj: 'C:/picked' },
      }),
    );
    expect(screen.getByRole('button', { name: '実行' })).toBeEnabled();
  });

  it('runTask の失敗はダイアログ内にエラー表示する', async () => {
    const user = userEvent.setup();
    const bridge = makeBridge({
      runTask: vi.fn().mockRejectedValue(new Error('コマンドが見つかりません')),
    });
    render(<RunTaskButton task={makeTask()} bridge={bridge} />);
    await user.click(screen.getByRole('button', { name: 'AI実行' }));
    await waitFor(() => screen.getByRole('button', { name: '実行' }));
    await user.click(screen.getByRole('button', { name: '実行' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('コマンドが見つかりません');
  });
});
