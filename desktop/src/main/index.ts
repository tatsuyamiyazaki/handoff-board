// Electron メインプロセス。ウィンドウ生成・app:// スキーム・IPC 配線のみの薄い結線層。
import { app, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { RunTaskRequest } from '@handoff/shared';
import { signInWithGoogle } from './auth.js';
import { CliRunner, expandArgs, renderPrompt } from './cli-runner.js';
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

function killTree(pid: number): void {
  // shell:true 経由の子（cmd → CLI）ごと確実に止めるため taskkill /T /F を使う
  execFile('taskkill', ['/pid', String(pid), '/T', '/F']);
}

function wireIpc(): void {
  const settings = new SettingsStore(app.getPath('userData'));
  const runner = new CliRunner(
    (command, args, options) => spawn(command, args, options),
    killTree,
    (ev) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('run:event', ev);
      }
    },
  );

  ipcMain.handle('settings:get', () => settings.load());
  ipcMain.handle('settings:set', (_e, patch: unknown) => settings.update(patch));
  ipcMain.handle('auth:sign-in', () => signInWithGoogle());
  ipcMain.handle('dialog:pick-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('run:start', (_e, req: RunTaskRequest) => {
    const current = settings.load();
    const cli = current.cliDefinitions.find((c) => c.id === req.cliId);
    if (!cli) throw new Error('CLI 定義が見つかりません: ' + req.cliId);
    if (!existsSync(req.cwd)) throw new Error('フォルダが存在しません: ' + req.cwd);
    const prompt = renderPrompt(current.promptTemplate, {
      taskId: req.taskId,
      title: req.taskTitle,
    });
    const args = expandArgs(cli.argsTemplate, {
      prompt,
      taskId: req.taskId,
      title: req.taskTitle,
    });
    return runner.start({
      taskId: req.taskId,
      taskTitle: req.taskTitle,
      cliName: cli.name,
      command: cli.command,
      args,
      cwd: req.cwd,
    });
  });
  ipcMain.handle('run:cancel', (_e, runId: string) => runner.cancel(runId));
  ipcMain.handle('run:list', () => runner.list());
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
