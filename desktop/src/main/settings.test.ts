import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsStore } from './settings.js';
import { DEFAULT_SETTINGS } from './settings-core.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'handoff-settings-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('SettingsStore', () => {
  it('ファイルが無ければデフォルトを返す', () => {
    const store = new SettingsStore(dir);
    expect(store.load()).toEqual(DEFAULT_SETTINGS);
  });

  it('update は検証して保存し、次回 load で読める', () => {
    const store = new SettingsStore(dir);
    const next = store.update({ apiBaseUrl: 'https://api.example.com' });
    expect(next.apiBaseUrl).toBe('https://api.example.com');
    expect(new SettingsStore(dir).load().apiBaseUrl).toBe('https://api.example.com');
  });

  it('壊れた JSON はデフォルトにフォールバックする', () => {
    writeFileSync(join(dir, 'settings.json'), '{not json');
    expect(new SettingsStore(dir).load()).toEqual(DEFAULT_SETTINGS);
  });

  it('ファイル内の未知キーは無視して読み込む（将来の後方互換）', () => {
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ apiBaseUrl: 'https://a.example.com', futureKey: true }),
    );
    const loaded = new SettingsStore(dir).load();
    expect(loaded.apiBaseUrl).toBe('https://a.example.com');
  });
});
