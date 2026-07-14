import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  applySettingsPatch,
  SettingsValidationError,
} from './settings-core.js';

describe('DEFAULT_SETTINGS', () => {
  it('Claude Code と Codex のプリセットを持つ', () => {
    const ids = DEFAULT_SETTINGS.cliDefinitions.map((d) => d.id);
    expect(ids).toEqual(['claude-code', 'codex']);
    expect(DEFAULT_SETTINGS.apiBaseUrl).toBe('');
    expect(DEFAULT_SETTINGS.promptTemplate).toContain('{taskId}');
  });
});

describe('applySettingsPatch', () => {
  it('部分パッチをイミュータブルに適用する', () => {
    const next = applySettingsPatch(DEFAULT_SETTINGS, {
      apiBaseUrl: 'https://api.example.com',
    });
    expect(next.apiBaseUrl).toBe('https://api.example.com');
    expect(next).not.toBe(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.apiBaseUrl).toBe('');
  });

  it('projectFolderMap を置き換えられる', () => {
    const next = applySettingsPatch(DEFAULT_SETTINGS, {
      projectFolderMap: { handoff: 'C:/Users/me/Dev/handoff-board' },
    });
    expect(next.projectFolderMap).toEqual({ handoff: 'C:/Users/me/Dev/handoff-board' });
  });

  it('不明なキーは 422 で拒否する', () => {
    expect(() => applySettingsPatch(DEFAULT_SETTINGS, { nope: 1 })).toThrow(
      SettingsValidationError,
    );
  });

  it('http(s) 以外の apiBaseUrl は拒否する（空文字は許可）', () => {
    expect(() => applySettingsPatch(DEFAULT_SETTINGS, { apiBaseUrl: 'ftp://x' })).toThrow(
      SettingsValidationError,
    );
    expect(applySettingsPatch(DEFAULT_SETTINGS, { apiBaseUrl: '' }).apiBaseUrl).toBe('');
  });

  it('空の promptTemplate は拒否する', () => {
    expect(() => applySettingsPatch(DEFAULT_SETTINGS, { promptTemplate: ' ' })).toThrow(
      SettingsValidationError,
    );
  });

  it('cliDefinitions の id 重複は拒否する', () => {
    const dup = [
      { id: 'a', name: 'A', command: 'a', argsTemplate: ['{prompt}'], defaultForOwners: [] },
      { id: 'a', name: 'B', command: 'b', argsTemplate: ['{prompt}'], defaultForOwners: [] },
    ];
    expect(() => applySettingsPatch(DEFAULT_SETTINGS, { cliDefinitions: dup })).toThrow(
      SettingsValidationError,
    );
  });

  it('defaultForOwners に human や未知の owner は指定できない', () => {
    const bad = (owners: string[]) => [
      { id: 'a', name: 'A', command: 'a', argsTemplate: ['{prompt}'], defaultForOwners: owners },
    ];
    expect(() =>
      applySettingsPatch(DEFAULT_SETTINGS, { cliDefinitions: bad(['human']) }),
    ).toThrow(SettingsValidationError);
    expect(() =>
      applySettingsPatch(DEFAULT_SETTINGS, { cliDefinitions: bad(['gemini']) }),
    ).toThrow(SettingsValidationError);
  });

  it('projectFolderMap の値が文字列以外なら拒否する', () => {
    expect(() =>
      applySettingsPatch(DEFAULT_SETTINGS, { projectFolderMap: { p: 1 } }),
    ).toThrow(SettingsValidationError);
  });
});
