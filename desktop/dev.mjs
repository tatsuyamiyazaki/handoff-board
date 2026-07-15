// 開発用オーケストレーター（HMR モード）。
// Vite dev server（web renderer）を起動し、応答を待ってから Electron を
// HANDOFF_DEV_SERVER_URL 指定で起動する。renderer の変更は HMR で即時反映され、
// web/dist を毎回ビルドし直す必要がない（停留バンドルによる不整合を避ける）。
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { platform } from 'node:os';

const DEV_SERVER_URL = process.env.HANDOFF_DEV_SERVER_URL ?? 'http://localhost:5173';
const READY_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 300;
const isWindows = platform() === 'win32';

/** 子プロセスツリーを確実に停止する（Windows は taskkill /T、他は SIGTERM）。 */
function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (isWindows && child.pid !== undefined) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

const web = spawn('pnpm', ['--filter', '@handoff/web', 'dev'], { stdio: 'inherit', shell: true });

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  killTree(web);
  process.exit(code ?? 0);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
web.on('exit', (code) => shutdown(code ?? 0));

/** Vite dev server が応答するまでポーリングする。 */
async function waitForServer() {
  const start = Date.now();
  while (Date.now() - start < READY_TIMEOUT_MS) {
    try {
      const res = await fetch(DEV_SERVER_URL);
      if (res.ok) return;
    } catch {
      // まだ起動中
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Vite dev server が ${READY_TIMEOUT_MS}ms 以内に起動しませんでした: ${DEV_SERVER_URL}`);
}

try {
  await waitForServer();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  shutdown(1);
}

// main/preload をビルドしてから Electron を dev server 指定で起動する。
const build = spawn('node', ['build.mjs'], { stdio: 'inherit', shell: true });
const [buildCode] = await once(build, 'exit');
if (buildCode !== 0) shutdown(buildCode ?? 1);

const electron = spawn('electron', ['.'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, HANDOFF_DEV_SERVER_URL: DEV_SERVER_URL },
});
electron.on('exit', (code) => shutdown(code ?? 0));
