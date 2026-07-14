import { isAbsolute, normalize, relative, resolve } from 'node:path';
import type { RunTaskRequest } from '@handoff/shared';

export function resolveAppAsset(rootDir: string, requestUrl: string): string | null {
  try {
    const url = new URL(requestUrl);
    if (url.protocol !== 'app:' || url.hostname !== 'bundle') return null;
    const decoded = decodeURIComponent(url.pathname);
    const relativeAsset = decoded === '/' ? 'index.html' : decoded.replace(/^[/\\]+/, '');
    const root = normalize(resolve(rootDir));
    const file = normalize(resolve(root, relativeAsset));
    const fromRoot = relative(root, file);
    if (fromRoot === '..' || fromRoot.startsWith('..\\') || fromRoot.startsWith('../') || isAbsolute(fromRoot)) {
      return null;
    }
    return file;
  } catch {
    return null;
  }
}

export function isTrustedRendererUrl(rawUrl: string, devServerUrl?: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === 'app:' && url.hostname === 'bundle') return true;
    if (!devServerUrl) return false;
    return url.origin === new URL(devServerUrl).origin;
  } catch {
    return false;
  }
}

export function parseRunTaskRequest(value: unknown): RunTaskRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('run request が不正です');
  }
  const input = value as Record<string, unknown>;
  for (const key of ['taskId', 'taskTitle', 'cliId', 'cwd'] as const) {
    if (typeof input[key] !== 'string' || input[key].trim() === '') {
      throw new Error('run request が不正です: ' + key);
    }
  }
  return {
    taskId: input.taskId as string,
    taskTitle: input.taskTitle as string,
    cliId: input.cliId as string,
    cwd: input.cwd as string,
  };
}
