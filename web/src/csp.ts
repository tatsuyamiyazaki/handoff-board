import type { Plugin } from 'vite';

const CSP_META_PATTERN =
  /[ \t]*<meta\b(?=[^>]*\bhttp-equiv\s*=\s*(?:"Content-Security-Policy"|'Content-Security-Policy'|Content-Security-Policy(?=[\s/>])))[^>]*\/?>[ \t]*\r?\n?/gi;
const BARE_HOST_PATTERN =
  /^(?:localhost|(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)*[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)(?::\d{1,5})?$/i;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function normalizeAuthFrameOrigin(value?: string): string | null {
  const input = value?.trim();
  if (!input || /[\s<>"']/.test(input)) return null;

  const isHttpUrl = /^https?:\/\//i.test(input);
  if (!isHttpUrl && !BARE_HOST_PATTERN.test(input)) return null;

  try {
    const url = new URL(isHttpUrl ? input : `https://${input}`);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!url.hostname || url.username || url.password) return null;
    if (url.protocol === 'http:' && !LOOPBACK_HOSTS.has(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function buildCspPolicy(authDomain?: string): string {
  const authOrigin = normalizeAuthFrameOrigin(authDomain);
  const frameSources = [
    'https://*.firebaseapp.com',
    'https://*.web.app',
    ...(authOrigin ? [authOrigin] : []),
  ];

  return [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    // Firebase Auth の signInWithPopup は gapi (apis.google.com) を実行時ロードする。
    // これを塞ぐと auth/internal-error になる。
    "script-src 'self' https://apis.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    // Desktop API origins are runtime-configurable, so build-time CSP cannot enumerate them.
    // Keep HTTPS broad for that approved feature; restrict HTTP to local emulators only.
    // CSP host-source は IPv6 リテラル（[::1]）非対応のため localhost / 127.0.0.1 のみ。
    "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
    `frame-src ${frameSources.join(' ')}`,
  ].join('; ');
}

export function injectCspMeta(html: string, authDomain?: string): string {
  const withoutExistingCsp = html.replace(CSP_META_PATTERN, '');
  const meta = `<meta http-equiv="Content-Security-Policy" content="${buildCspPolicy(authDomain)}" />`;

  return withoutExistingCsp.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}\n    ${meta}`);
}

export function productionCspPlugin(authDomain?: string): Plugin {
  return {
    name: 'handoff-production-csp',
    transformIndexHtml(html) {
      return injectCspMeta(html, authDomain);
    },
  };
}

export function selectProductionCspPlugins(
  command: 'build' | 'serve',
  authDomain?: string,
): Plugin[] {
  return command === 'build' ? [productionCspPlugin(authDomain)] : [];
}
