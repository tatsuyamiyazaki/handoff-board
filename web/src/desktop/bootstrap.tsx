import type { HandoffDesktopBridge } from '@handoff/shared';

type SettingsBridge = Pick<HandoffDesktopBridge, 'getSettings'>;

interface BootstrapDesktopDependencies {
  bridge: SettingsBridge | null;
  setApiBase: (url: string) => void;
}

/** デスクトップ設定を API クライアントへ反映し、描画可能なエラーへ変換する。 */
export async function bootstrapDesktop({
  bridge,
  setApiBase,
}: BootstrapDesktopDependencies): Promise<string | null> {
  if (!bridge) return null;

  try {
    const settings = await bridge.getSettings();
    setApiBase(settings.apiBaseUrl);
    return null;
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return `デスクトップ設定の読み込みに失敗しました: ${detail}`;
  }
}

/** ブートストラップ失敗を、アプリ本体を隠さずユーザーへ通知する。 */
export function BootstrapErrorBanner({ message }: { message: string }) {
  return (
    <p role="alert" className="app__error">
      {message}
    </p>
  );
}
