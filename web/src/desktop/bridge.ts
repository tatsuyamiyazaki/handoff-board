import type { HandoffDesktopBridge } from '@handoff/shared';

/** デスクトップ（Electron）ブリッジ。ブラウザ実行時は null。 */
export function desktopBridge(): HandoffDesktopBridge | null {
  return typeof window === 'undefined' ? null : (window.handoffDesktop ?? null);
}
