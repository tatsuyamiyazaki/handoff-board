import type { HandoffDesktopBridge } from '@handoff/shared';

declare global {
  interface Window {
    /** Electron の preload が注入する。ブラウザ実行時は undefined。 */
    handoffDesktop?: HandoffDesktopBridge;
  }
}

export {};
