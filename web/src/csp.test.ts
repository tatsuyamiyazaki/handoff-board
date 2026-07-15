import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCspPolicy,
  injectCspMeta,
  normalizeAuthFrameOrigin,
  productionCspPlugin,
} from './csp';

const CSP_META_PATTERN = /<meta\s+[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi;

describe('injectCspMeta', () => {
  it('inserts exactly one CSP meta tag into head', () => {
    const html = '<!doctype html><html><head><title>HANDOFF</title></head><body></body></html>';

    const transformed = injectCspMeta(html);

    expect(transformed.match(CSP_META_PATTERN)).toHaveLength(1);
    expect(transformed.indexOf('Content-Security-Policy')).toBeGreaterThan(
      transformed.indexOf('<head>'),
    );
    expect(transformed.indexOf('Content-Security-Policy')).toBeLessThan(
      transformed.indexOf('</head>'),
    );
  });

  it('replaces existing CSP tags instead of duplicating them', () => {
    const html = `<html><head>
      <meta http-equiv="Content-Security-Policy" content="default-src *">
      <meta content="script-src *" http-equiv="Content-Security-Policy">
    </head><body></body></html>`;

    const transformed = injectCspMeta(html);

    expect(transformed.match(CSP_META_PATTERN)).toHaveLength(1);
    expect(transformed).not.toContain('default-src *');
    expect(transformed).not.toContain('script-src *');
  });
});

describe('buildCspPolicy', () => {
  it('keeps required production sources and adds a valid Firebase auth origin', () => {
    const policy = buildCspPolicy('https://auth.example.com/sign-in?tenant=handoff');

    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain(
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    );
    expect(policy).toContain("font-src 'self' https://fonts.gstatic.com");
    expect(policy).toContain("connect-src 'self' https: http:");
    expect(policy).toContain("img-src 'self' data: https:");
    expect(policy).toContain('frame-src https://*.firebaseapp.com https://*.web.app');
    expect(policy).toContain('https://auth.example.com');
    expect(policy).not.toContain('/sign-in');
  });
});

describe('normalizeAuthFrameOrigin', () => {
  it.each([
    ['handoff-dashboard.firebaseapp.com', 'https://handoff-dashboard.firebaseapp.com'],
    ['https://auth.example.com/path', 'https://auth.example.com'],
    ['http://localhost:9099/emulator', 'http://localhost:9099'],
  ])('normalizes %s to %s', (value, expected) => {
    expect(normalizeAuthFrameOrigin(value)).toBe(expected);
  });

  it.each([
    'javascript:alert(1)',
    'https://user:password@example.com',
    'auth.example.com\"; script-src *',
    'auth.example.com<meta http-equiv="refresh">',
    'not a hostname',
  ])('rejects unsafe or malformed input without interpolating it: %s', (value) => {
    expect(normalizeAuthFrameOrigin(value)).toBeNull();
    expect(buildCspPolicy(value)).not.toContain(value);
  });
});

describe('productionCspPlugin', () => {
  it('uses the pure transformer for production HTML', () => {
    const plugin = productionCspPlugin('auth.example.com');
    const transform = plugin.transformIndexHtml;

    expect(typeof transform).toBe('function');
    if (typeof transform !== 'function') throw new Error('missing HTML transformer');

    const transformed = transform(
      '<html><head></head><body></body></html>',
      undefined as never,
    );
    expect(transformed).toContain('https://auth.example.com');
  });
});

it('keeps source index.html free of a static CSP', () => {
  const indexPath = resolve(process.cwd(), 'index.html');
  const sourceHtml = readFileSync(indexPath, 'utf8');

  expect(sourceHtml.match(CSP_META_PATTERN) ?? []).toHaveLength(0);
});
