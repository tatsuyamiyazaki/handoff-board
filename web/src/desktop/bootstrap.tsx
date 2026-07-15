import type { HandoffDesktopBridge } from '@handoff/shared';
import type { ReactNode } from 'react';

type SettingsBridge = Pick<HandoffDesktopBridge, 'getSettings'>;

interface BootstrapDesktopDependencies {
  bridge: SettingsBridge | null;
  setApiBase: (url: string) => void;
  logError?: (message: string, cause: unknown) => void;
}

const BOOTSTRAP_ERROR =
  'デスクトップアプリの初期化に失敗しました。一部の機能を利用できない可能性があります。';

/** デスクトップ設定を API クライアントへ反映し、描画可能なエラーへ変換する。 */
export async function bootstrapDesktop({
  bridge,
  setApiBase,
  logError = (message, cause) => console.error(message, cause),
}: BootstrapDesktopDependencies): Promise<string | null> {
  if (!bridge) return null;

  try {
    const settings = await bridge.getSettings();
    setApiBase(settings.apiBaseUrl);
    return null;
  } catch (error: unknown) {
    logError('Desktop bootstrap failed', error);
    return BOOTSTRAP_ERROR;
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

/** App が所有する main ランドマークを重複させず、初期化通知と本体を合成する。 */
export function DesktopRoot({
  bootstrapError,
  children,
}: {
  bootstrapError: string | null;
  children: ReactNode;
}) {
  return (
    <>
      {bootstrapError && <BootstrapErrorBanner message={bootstrapError} />}
      {children}
    </>
  );
}
