// preload。contextBridge で window.handoffDesktop を公開する（薄い転送層、ロジック禁止）。
import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopSettings } from '@handoff/shared';

const bridge = {
  getSettings: (): Promise<DesktopSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<DesktopSettings>): Promise<DesktopSettings> =>
    ipcRenderer.invoke('settings:set', patch),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pick-folder'),
  signIn: (): Promise<{ idToken: string }> => ipcRenderer.invoke('auth:sign-in'),
};

contextBridge.exposeInMainWorld('handoffDesktop', bridge);
