// 設定の永続化（userData/settings.json）。検証は settings-core に委譲。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DesktopSettings } from '@handoff/shared';
import { DEFAULT_SETTINGS, applySettingsPatch } from './settings-core.js';

const KNOWN_KEYS = ['apiBaseUrl', 'cliDefinitions', 'projectFolderMap', 'promptTemplate'] as const;

export class SettingsStore {
  constructor(private readonly dir: string) {}

  private get file(): string {
    return join(this.dir, 'settings.json');
  }

  /** 保存済み設定を読む。無い・壊れている場合はデフォルト。未知キーは黙って捨てる。 */
  load(): DesktopSettings {
    if (!existsSync(this.file)) return DEFAULT_SETTINGS;
    try {
      const raw: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
      if (typeof raw !== 'object' || raw === null) return DEFAULT_SETTINGS;
      const known = Object.fromEntries(
        Object.entries(raw).filter(([k]) => (KNOWN_KEYS as readonly string[]).includes(k)),
      );
      return applySettingsPatch(DEFAULT_SETTINGS, known);
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  /** パッチを検証して適用し、保存して新しい設定を返す。不正は SettingsValidationError。 */
  update(patch: unknown): DesktopSettings {
    const next = applySettingsPatch(this.load(), patch);
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.file, JSON.stringify(next, null, 2));
    return next;
  }
}
