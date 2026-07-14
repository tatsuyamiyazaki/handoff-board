import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readEnvFiles() {
  const values = {};
  for (const name of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    const file = resolve('../web', name);
    if (!existsSync(file)) continue;
    for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      if (!match) continue;
      values[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return values;
}

const fileEnv = readEnvFiles();
const required = [
  'HANDOFF_GOOGLE_CLIENT_ID',
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_API_BASE',
];
const missing = required.filter((key) => !(process.env[key] || fileEnv[key]));
if (missing.length > 0) {
  throw new Error('Desktop release configuration is missing: ' + missing.join(', '));
}
