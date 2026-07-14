// デスクトップ設定の純粋ロジック（デフォルト値・パッチ検証）。I/O は settings.ts に分離。
import { OWNERS, type Owner, type CliDefinition, type DesktopSettings } from '@handoff/shared';

/** 設定パッチの検証エラー。@handoff/shared の ValidationError(422) の流儀に合わせる。 */
export class SettingsValidationError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = 'SettingsValidationError';
  }
}

export const DEFAULT_SETTINGS: DesktopSettings = {
  apiBaseUrl: '',
  cliDefinitions: [
    {
      id: 'claude-code',
      name: 'Claude Code',
      command: 'claude',
      argsTemplate: ['-p', '{prompt}'],
      defaultForOwners: ['claude-code'],
    },
    {
      id: 'codex',
      name: 'Codex CLI',
      command: 'codex',
      argsTemplate: ['exec', '{prompt}'],
      defaultForOwners: ['codex'],
    },
  ],
  projectFolderMap: {},
  promptTemplate:
    'handoff のタスク {taskId}（{title}）を handoff-mcp の get_task で取得し、内容に従って作業してください。着手時と完了時に transition_task でステータスを遷移させてください。',
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '';
}

function validateOwner(v: unknown, index: number): Owner {
  if (typeof v !== 'string' || !(OWNERS as readonly string[]).includes(v) || v === 'human') {
    throw new SettingsValidationError(
      `cliDefinitions[${index}].defaultForOwners に不正な owner があります: ${String(v)}`,
    );
  }
  return v as Owner;
}

function validateCliDefinition(v: unknown, index: number): CliDefinition {
  if (!isPlainObject(v)) {
    throw new SettingsValidationError(`cliDefinitions[${index}] はオブジェクトである必要があります`);
  }
  const { id, name, command, argsTemplate, defaultForOwners } = v;
  if (!isNonEmptyString(id) || !isNonEmptyString(name) || !isNonEmptyString(command)) {
    throw new SettingsValidationError(`cliDefinitions[${index}] の id/name/command は必須です`);
  }
  if (
    !Array.isArray(argsTemplate) ||
    argsTemplate.length === 0 ||
    !argsTemplate.every((a): a is string => typeof a === 'string')
  ) {
    throw new SettingsValidationError(
      `cliDefinitions[${index}].argsTemplate は文字列の配列（1件以上）が必要です`,
    );
  }
  if (!Array.isArray(defaultForOwners)) {
    throw new SettingsValidationError(
      `cliDefinitions[${index}].defaultForOwners は配列である必要があります`,
    );
  }
  return {
    id,
    name,
    command,
    argsTemplate: [...argsTemplate],
    defaultForOwners: defaultForOwners.map((o) => validateOwner(o, index)),
  };
}

/** 現在の設定にパッチを検証つきで適用し、新しい設定を返す（イミュータブル）。 */
export function applySettingsPatch(current: DesktopSettings, patch: unknown): DesktopSettings {
  if (!isPlainObject(patch)) {
    throw new SettingsValidationError('設定パッチはオブジェクトである必要があります');
  }
  let next: DesktopSettings = {
    ...current,
    cliDefinitions: current.cliDefinitions.map((d) => ({ ...d })),
    projectFolderMap: { ...current.projectFolderMap },
  };
  for (const [key, value] of Object.entries(patch)) {
    switch (key) {
      case 'apiBaseUrl': {
        if (typeof value !== 'string' || (value !== '' && !/^https?:\/\//.test(value))) {
          throw new SettingsValidationError('apiBaseUrl は http(s) の URL か空文字が必要です');
        }
        next = { ...next, apiBaseUrl: value };
        break;
      }
      case 'promptTemplate': {
        if (!isNonEmptyString(value)) {
          throw new SettingsValidationError('promptTemplate は空にできません');
        }
        next = { ...next, promptTemplate: value };
        break;
      }
      case 'projectFolderMap': {
        if (
          !isPlainObject(value) ||
          !Object.values(value).every((p) => typeof p === 'string')
        ) {
          throw new SettingsValidationError(
            'projectFolderMap は文字列から文字列へのマップが必要です',
          );
        }
        next = { ...next, projectFolderMap: { ...(value as Record<string, string>) } };
        break;
      }
      case 'cliDefinitions': {
        if (!Array.isArray(value) || value.length === 0) {
          throw new SettingsValidationError('cliDefinitions は1件以上の配列が必要です');
        }
        const defs = value.map((d, i) => validateCliDefinition(d, i));
        if (new Set(defs.map((d) => d.id)).size !== defs.length) {
          throw new SettingsValidationError('cliDefinitions の id が重複しています');
        }
        next = { ...next, cliDefinitions: defs };
        break;
      }
      default:
        throw new SettingsValidationError(`不明な設定キー: ${key}`);
    }
  }
  return next;
}
