import { loadDesktopReleaseEnv } from './release-env.mjs';

const resolvedEnv = loadDesktopReleaseEnv();
const required = [
  'HANDOFF_GOOGLE_CLIENT_ID',
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_API_BASE',
];
const missing = required.filter((key) => !resolvedEnv[key]);
if (missing.length > 0) {
  throw new Error('Desktop release configuration is missing: ' + missing.join(', '));
}
