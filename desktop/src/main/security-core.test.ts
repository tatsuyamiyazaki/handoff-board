import { describe, expect, it } from 'vitest';
import { isTrustedRendererUrl, parseRunTaskRequest, resolveAppAsset } from './security-core.js';

describe('resolveAppAsset', () => {
  it('bundle host の asset だけを root 配下へ解決する', () => {
    expect(resolveAppAsset('C:/app/web', 'app://bundle/assets/app.js')).toBe(
      'C:\\app\\web\\assets\\app.js',
    );
    expect(resolveAppAsset('C:/app/web', 'app://other/assets/app.js')).toBeNull();
  });

  it('エンコードされた Windows パストラバーサルを拒否する', () => {
    expect(resolveAppAsset('C:/app/web', 'app://bundle/%2e%2e%5csecret.txt')).toBeNull();
  });
});

describe('isTrustedRendererUrl', () => {
  it('本番 bundle と設定された dev server の同一 origin だけを許可する', () => {
    expect(isTrustedRendererUrl('app://bundle/index.html')).toBe(true);
    expect(isTrustedRendererUrl('https://evil.example/')).toBe(false);
    expect(isTrustedRendererUrl('http://localhost:5173/src/main.tsx', 'http://localhost:5173')).toBe(true);
    expect(isTrustedRendererUrl('http://localhost:5174/', 'http://localhost:5173')).toBe(false);
  });
});

describe('parseRunTaskRequest', () => {
  it('必須文字列を持つ request だけを受け入れる', () => {
    expect(parseRunTaskRequest({ taskId: 't1', taskTitle: 'T', cliId: 'codex', cwd: 'C:/work' })).toEqual({
      taskId: 't1', taskTitle: 'T', cliId: 'codex', cwd: 'C:/work',
    });
    expect(() => parseRunTaskRequest({ taskId: 't1', taskTitle: 'T', cliId: '', cwd: 'C:/work' })).toThrow('run request');
  });
});
