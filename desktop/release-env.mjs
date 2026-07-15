import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_FILE_NAMES = ['.env', '.env.local', '.env.production', '.env.production.local'];

export function loadDesktopReleaseEnv({
  processEnv = process.env,
  webDirectory = resolve('../web'),
} = {}) {
  const values = {};
  for (const name of ENV_FILE_NAMES) {
    const file = resolve(webDirectory, name);
    if (!existsSync(file)) continue;
    for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      if (!match) continue;
      values[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  for (const [key, value] of Object.entries(processEnv)) {
    if (value) values[key] = value;
  }
  return values;
}

export function createDesktopBuildDefines(values) {
  return {
    __GOOGLE_CLIENT_ID__: JSON.stringify(values.HANDOFF_GOOGLE_CLIENT_ID ?? ''),
    __GOOGLE_CLIENT_SECRET__: JSON.stringify(values.HANDOFF_GOOGLE_CLIENT_SECRET ?? ''),
  };
}
