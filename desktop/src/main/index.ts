// Electron メインプロセス。ウィンドウ生成・app:// スキーム・IPC 配線のみの薄い結線層。
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import { execFile, execFileSync } from 'node:child_process';
import crossSpawn from 'cross-spawn';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { signInWithGoogle } from './auth.js';
import { CliRunner, expandArgs, renderPrompt } from './cli-runner.js';
import { isTrustedRendererUrl, parseRunTaskRequest, resolveAppAsset } from './security-core.js';
import { SettingsStore } from './settings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function webDistDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'web')
    : join(__dirname, '..', '..', '..', 'web', 'dist');
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function registerAppProtocol(): void {
  const root = webDistDir();
  protocol.handle('app', (request) => {
    const file = resolveAppAsset(root, request.url);
    if (!file) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const senderUrl = event.senderFrame?.url ?? '';
  if (!isTrustedRendererUrl(senderUrl, process.env.HANDOFF_DEV_SERVER_URL)) {
    throw new Error('信頼されていない renderer からの IPC を拒否しました');
  }
}

function assertCommandAvailable(command: string): void {
  try {
    if (/[\\/]/.test(command)) {
      if (!existsSync(command)) throw new Error('missing');
      return;
    }
    execFileSync('where.exe', [command], { stdio: 'ignore' });
  } catch {
    throw new Error('コマンドが見つかりません: ' + command);
  }
}

function killTree(pid: number): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function wireIpc(): void {
  const settings = new SettingsStore(app.getPath('userData'));
  const runner = new CliRunner(
    (command, args, options) => crossSpawn(command, args, options),
    killTree,
    (ev) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('run:event', ev);
      }
    },
  );

  ipcMain.handle('settings:get', (event) => {
    assertTrustedSender(event);
    return settings.load();
  });
  ipcMain.handle('settings:set', (event, patch: unknown) => {
    assertTrustedSender(event);
    return settings.update(patch);
  });
  ipcMain.handle('auth:sign-in', (event) => {
    assertTrustedSender(event);
    return signInWithGoogle();
  });
  ipcMain.handle('dialog:pick-folder', async (event) => {
    assertTrustedSender(event);
    const parent = BrowserWindow.fromWebContents(event.sender);
    const result = parent
      ? await dialog.showOpenDialog(parent, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('run:start', (event, rawRequest: unknown) => {
    assertTrustedSender(event);
    const req = parseRunTaskRequest(rawRequest);
    const current = settings.load();
    const cli = current.cliDefinitions.find((candidate) => candidate.id === req.cliId);
    if (!cli) throw new Error('CLI 定義が見つかりません: ' + req.cliId);
    if (!existsSync(req.cwd)) throw new Error('フォルダが存在しません: ' + req.cwd);
    assertCommandAvailable(cli.command);
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
  ipcMain.handle('run:cancel', async (event, runId: unknown) => {
    assertTrustedSender(event);
    if (typeof runId !== 'string' || runId === '') throw new Error('runId が不正です');
    await runner.cancel(runId);
  });
  ipcMain.handle('run:list', (event) => {
    assertTrustedSender(event);
    return runner.list();
  });
  ipcMain.handle('run:log', (event, runId: unknown) => {
    assertTrustedSender(event);
    if (typeof runId !== 'string' || runId === '') throw new Error('runId が不正です');
    return runner.getLogSnapshot(runId);
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
  win.webContents.on('will-navigate', (event, url) => {
    if (isTrustedRendererUrl(url, devServerUrl)) return;
    event.preventDefault();
    if (/^https?:\/\//.test(url)) void shell.openExternal(url).catch(() => {});
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
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
