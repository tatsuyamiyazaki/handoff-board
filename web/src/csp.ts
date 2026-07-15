import type { Plugin } from 'vite';

const CSP_META_PATTERN =
  /[ \t]*<meta\b(?=[^>]*\bhttp-equiv\s*=\s*(["'])Content-Security-Policy\1)[^>]*\/?>[ \t]*\r?\n?/gi;
const BARE_HOST_PATTERN =
  /^(?:localhost|(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)*[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?)(?::\d{1,5})?$/i;

export function normalizeAuthFrameOrigin(value?: string): string | null {
  const input = value?.trim();
  if (!input || /[\s<>"']/.test(input)) return null;

  const isHttpUrl = /^https?:\/\//i.test(input);
  if (!isHttpUrl && !BARE_HOST_PATTERN.test(input)) return null;

  try {
    const url = new URL(isHttpUrl ? input : `https://${input}`);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!url.hostname || url.username || url.password) return null;
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
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' https: http:",
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
