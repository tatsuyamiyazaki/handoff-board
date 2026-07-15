import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DesktopSettings, HandoffDesktopBridge } from '@handoff/shared';
import {
  BootstrapErrorBanner,
  DesktopRoot,
  bootstrapDesktop,
} from './bootstrap';

const SETTINGS: DesktopSettings = {
  apiBaseUrl: 'https://api.example.com',
  cliDefinitions: [],
  projectFolderMap: {},
  promptTemplate: '{title}',
};

type SettingsBridge = Pick<HandoffDesktopBridge, 'getSettings'>;

describe('bootstrapDesktop', () => {
  it('デスクトップ設定の API ベース URL を注入してエラーなしで完了する', async () => {
    const bridge: SettingsBridge = {
      getSettings: vi.fn().mockResolvedValue(SETTINGS),
    };
    const setApiBase = vi.fn();

    const error = await bootstrapDesktop({ bridge, setApiBase });

    expect(setApiBase).toHaveBeenCalledWith('https://api.example.com');
    expect(error).toBeNull();
  });

  it('設定取得に失敗しても例外を投げず、日本語のエラーを返す', async () => {
    const cause = new Error('IPC channel closed');
    const bridge: SettingsBridge = {
      getSettings: vi.fn().mockRejectedValue(cause),
    };
    const logError = vi.fn();

    await expect(
      bootstrapDesktop({ bridge, setApiBase: vi.fn(), logError }),
    ).resolves.toBe(
      'デスクトップアプリの初期化に失敗しました。一部の機能を利用できない可能性があります。',
    );
    expect(logError).toHaveBeenCalledWith('Desktop bootstrap failed', cause);
  });

  it('ブリッジがなければ API ベース URL を変更せず、エラーなしで完了する', async () => {
    const setApiBase = vi.fn();

    const error = await bootstrapDesktop({ bridge: null, setApiBase });

    expect(setApiBase).not.toHaveBeenCalled();
    expect(error).toBeNull();
  });
});

describe('BootstrapErrorBanner', () => {
  it('ブートストラップエラーを既存のエラースタイルの alert として表示する', () => {
    const message = 'デスクトップ設定の読み込みに失敗しました';

    render(<BootstrapErrorBanner message={message} />);

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('alert')).toHaveClass('app__error');
  });
});

describe('DesktopRoot', () => {
  it('初期化に失敗しても alert とアプリ本体をともに表示する', async () => {
    const bridge: SettingsBridge = {
      getSettings: vi.fn().mockRejectedValue(new Error('secret IPC detail')),
    };
    const error = await bootstrapDesktop({
      bridge,
      setApiBase: vi.fn(),
      logError: vi.fn(),
    });

    render(
      <DesktopRoot bootstrapError={error}>
        <div>アプリ本体</div>
      </DesktopRoot>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'デスクトップアプリの初期化に失敗しました',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('secret IPC detail');
    expect(screen.getByText('アプリ本体')).toBeInTheDocument();
  });
});
