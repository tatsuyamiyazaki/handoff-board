// preload。contextBridge で window.handoffDesktop を公開する（薄い転送層、ロジック禁止）。
import { contextBridge, ipcRenderer } from 'electron';
import type {
  DesktopSettings,
  HandoffDesktopBridge,
  RunEvent,
  RunSummary,
  RunTaskRequest,
} from '@handoff/shared';

const bridge = {
  runTask: (req: RunTaskRequest): Promise<{ runId: string }> =>
    ipcRenderer.invoke('run:start', req),
  cancelRun: (runId: string): Promise<void> => ipcRenderer.invoke('run:cancel', runId),
  listRuns: (): Promise<RunSummary[]> => ipcRenderer.invoke('run:list'),
  getRunLog: (runId: string): Promise<string> => ipcRenderer.invoke('run:log', runId),
  onRunEvent: (cb: (ev: RunEvent) => void): (() => void) => {
    const listener = (_e: unknown, ev: RunEvent): void => cb(ev);
    ipcRenderer.on('run:event', listener);
    return () => {
      ipcRenderer.removeListener('run:event', listener);
    };
  },
  getSettings: (): Promise<DesktopSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<DesktopSettings>): Promise<DesktopSettings> =>
    ipcRenderer.invoke('settings:set', patch),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pick-folder'),
  signIn: (): Promise<{ idToken: string }> => ipcRenderer.invoke('auth:sign-in'),
} satisfies HandoffDesktopBridge;

contextBridge.exposeInMainWorld('handoffDesktop', bridge);
