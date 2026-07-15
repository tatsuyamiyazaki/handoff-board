import { build } from 'esbuild';
import { createDesktopBuildDefines, loadDesktopReleaseEnv } from './release-env.mjs';

const define = createDesktopBuildDefines(loadDesktopReleaseEnv());

// CJS で出力する。ESM 出力だと cross-spawn 等の CJS 依存が内部で使う
// require('child_process') が esbuild の実行時シムを経由し、
// Electron の main プロセスで "Dynamic require of ... is not supported" になるため。
await build({
  entryPoints: ['src/main/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/main/index.cjs',
  external: ['electron'],
  define,
});

// sandbox: true の preload は CJS 必須（ESM preload はサンドボックスで動かない）
await build({
  entryPoints: ['src/preload/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'dist/preload/index.cjs',
  external: ['electron'],
});
