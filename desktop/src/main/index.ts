// Electron メインプロセス。ウィンドウ生成・app:// スキーム・IPC 配線のみの薄い結線層。
import { app, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { signInWithGoogle } from './auth.js';
import { SettingsStore } from './settings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// renderer 資産の場所: 開発中はリポジトリ内の web/dist、パッケージ後は resources/web
function webDistDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'web')
    : join(__dirname, '..', '..', '..', 'web', 'dist');
}

// app:// を standard スキームにしてオリジンを安定させる（localStorage / IndexedDB / Firebase 永続化のため）
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function registerAppProtocol(): void {
  const root = normalize(webDistDir());
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    const rel = pathname === '/' ? '/index.html' : pathname;
    const file = normalize(join(root, rel));
    if (!file.startsWith(root)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function wireIpc(): void {
  const settings = new SettingsStore(app.getPath('userData'));
  ipcMain.handle('settings:get', () => settings.load());
  ipcMain.handle('settings:set', (_e, patch: unknown) => settings.update(patch));
  ipcMain.handle('auth:sign-in', () => signInWithGoogle());
  ipcMain.handle('dialog:pick-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  const devServerUrl = process.env.HANDOFF_DEV_SERVER_URL;
  void win.loadURL(devServerUrl ?? 'app://bundle/index.html');
}

void app.whenReady().then(() => {
  registerAppProtocol();
  wireIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
