import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDesktopBuildDefines, loadDesktopReleaseEnv } from './release-env.mjs';

const tempDirectories = [];

async function makeWebEnvDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'handoff-release-env-'));
  tempDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('loadDesktopReleaseEnv', () => {
  it('後の env ファイルを優先し、process.env でファイル値を上書きする', async () => {
    const webDirectory = await makeWebEnvDirectory();
    await writeFile(
      join(webDirectory, '.env'),
      'FILE_ORDER=base\nSHELL_ORDER=base\nEMPTY_SHELL_ORDER=base\n',
    );
    await writeFile(join(webDirectory, '.env.local'), 'FILE_ORDER=local\n');
    await writeFile(join(webDirectory, '.env.production'), 'FILE_ORDER=production\n');
    await writeFile(
      join(webDirectory, '.env.production.local'),
      'FILE_ORDER=production-local\nSHELL_ORDER=file\n',
    );

    const resolved = loadDesktopReleaseEnv({
      processEnv: { SHELL_ORDER: 'shell', EMPTY_SHELL_ORDER: '' },
      webDirectory,
    });

    expect(resolved.FILE_ORDER).toBe('production-local');
    expect(resolved.SHELL_ORDER).toBe('shell');
    expect(resolved.EMPTY_SHELL_ORDER).toBe('base');
  });

  it('web env ファイルだけにある OAuth 値を esbuild define 用に整形する', async () => {
    const webDirectory = await makeWebEnvDirectory();
    await writeFile(
      join(webDirectory, '.env'),
      'HANDOFF_GOOGLE_CLIENT_ID=file-client-id\nHANDOFF_GOOGLE_CLIENT_SECRET=file-secret\n',
    );

    const resolved = loadDesktopReleaseEnv({ processEnv: {}, webDirectory });

    expect(createDesktopBuildDefines(resolved)).toEqual({
      __GOOGLE_CLIENT_ID__: JSON.stringify('file-client-id'),
      __GOOGLE_CLIENT_SECRET__: JSON.stringify('file-secret'),
    });
  });
});
