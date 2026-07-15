import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DesktopSettings, HandoffDesktopBridge } from '@handoff/shared';
import { DesktopSettingsDialog } from './DesktopSettingsDialog';

const SETTINGS: DesktopSettings = {
  apiBaseUrl: 'https://api.example.com',
  cliDefinitions: [
    {
      id: 'claude-code',
      name: 'Claude Code',
      command: 'claude',
      argsTemplate: ['-p', '{prompt}'],
      defaultForOwners: ['claude-code'],
    },
  ],
  projectFolderMap: { handoff: 'C:/dev/handoff' },
  promptTemplate: 'do {taskId}',
};

function makeBridge(overrides: Partial<HandoffDesktopBridge> = {}): HandoffDesktopBridge {
  return {
    runTask: vi.fn(),
    cancelRun: vi.fn(),
    listRuns: vi.fn(),
    getRunLog: vi.fn().mockResolvedValue({ log: '', lastSequence: 0 }),
    onRunEvent: vi.fn(),
    getSettings: vi.fn().mockResolvedValue(SETTINGS),
    setSettings: vi.fn().mockImplementation((patch: Partial<DesktopSettings>) =>
      Promise.resolve({ ...SETTINGS, ...patch }),
    ),
    pickFolder: vi.fn().mockResolvedValue('C:/other'),
    signIn: vi.fn(),
    ...overrides,
  } as HandoffDesktopBridge;
}

describe('DesktopSettingsDialog', () => {
  it('現在の設定値を表示する', async () => {
    render(<DesktopSettingsDialog bridge={makeBridge()} onClose={() => {}} />);
    expect(await screen.findByLabelText('API ベース URL')).toHaveValue(
      'https://api.example.com',
    );
    expect(screen.getByLabelText('プロンプトテンプレート')).toHaveValue('do {taskId}');
    expect(screen.getByDisplayValue('Claude Code')).toBeInTheDocument();
    expect(screen.getByText('C:/dev/handoff')).toBeInTheDocument();
  });

  it('編集して保存すると setSettings にパッチが渡り、閉じる', async () => {
    const user = userEvent.setup();
    const bridge = makeBridge();
    const onClose = vi.fn();
    render(<DesktopSettingsDialog bridge={bridge} onClose={onClose} />);

    const urlInput = await screen.findByLabelText('API ベース URL');
    await user.clear(urlInput);
    await user.type(urlInput, 'https://next.example.com');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(bridge.setSettings).toHaveBeenCalledWith(
        expect.objectContaining({ apiBaseUrl: 'https://next.example.com' }),
      ),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('CLI 定義を追加できる（args はスペース区切り入力）', async () => {
    const user = userEvent.setup();
    const bridge = makeBridge();
    render(<DesktopSettingsDialog bridge={bridge} onClose={() => {}} />);
    await screen.findByLabelText('API ベース URL');

    await user.click(screen.getByRole('button', { name: 'CLI を追加' }));
    const rows = screen.getAllByRole('group', { name: /CLI 定義/ });
    const newRow = rows[rows.length - 1];
    await user.type(within(newRow).getByLabelText('ID'), 'codex');
    await user.type(within(newRow).getByLabelText('名前'), 'Codex CLI');
    await user.type(within(newRow).getByLabelText('コマンド'), 'codex');
    await user.type(within(newRow).getByLabelText('引数'), 'exec {{prompt}');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() =>
      expect(bridge.setSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          cliDefinitions: expect.arrayContaining([
            expect.objectContaining({ id: 'codex', argsTemplate: ['exec', '{prompt}'] }),
          ]),
        }),
      ),
    );
  });

  it('保存失敗（検証エラー）はダイアログ内に表示する', async () => {
    const user = userEvent.setup();
    const bridge = makeBridge({
      setSettings: vi.fn().mockRejectedValue(new Error('apiBaseUrl は http(s) の URL が必要です')),
    });
    render(<DesktopSettingsDialog bridge={bridge} onClose={() => {}} />);
    await screen.findByLabelText('API ベース URL');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('apiBaseUrl');
  });
});

