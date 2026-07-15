import { build } from 'esbuild';
import { createDesktopBuildDefines, loadDesktopReleaseEnv } from './release-env.mjs';

const define = createDesktopBuildDefines(loadDesktopReleaseEnv());

await build({
  entryPoints: ['src/main/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/main/index.js',
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
