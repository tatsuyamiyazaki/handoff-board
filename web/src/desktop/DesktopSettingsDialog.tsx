import { useEffect, useState } from 'react';
import {
  OWNERS,
  isAiOwner,
  type CliDefinition,
  type DesktopSettings,
  type HandoffDesktopBridge,
  type Owner,
} from '@handoff/shared';
import { setApiBase } from '../api-client';
import { Icon } from '../components/icons';
import { deriveAiOwners } from './owner-options';

interface DesktopSettingsDialogProps {
  bridge: HandoffDesktopBridge;
  onClose: () => void;
}

/** CLI 定義編集用のフォーム行。argsTemplate はスペース区切りのテキストで編集する。 */
interface CliRow {
  id: string;
  name: string;
  command: string;
  argsText: string;
  defaultForOwners: Owner[];
}

const AI_OWNERS = deriveAiOwners(OWNERS, isAiOwner);

function toRow(def: CliDefinition): CliRow {
  return {
    id: def.id,
    name: def.name,
    command: def.command,
    argsText: def.argsTemplate.join(' '),
    defaultForOwners: def.defaultForOwners,
  };
}

function toDefinition(row: CliRow): CliDefinition {
  return {
    id: row.id,
    name: row.name,
    command: row.command,
    argsTemplate: row.argsText.split(/\s+/).filter((a) => a !== ''),
    defaultForOwners: row.defaultForOwners,
  };
}

/** デスクトップ設定（API URL / CLI 定義 / フォルダマッピング / プロンプト）を編集するダイアログ。 */
export function DesktopSettingsDialog({ bridge, onClose }: DesktopSettingsDialogProps) {
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [promptTemplate, setPromptTemplate] = useState('');
  const [cliRows, setCliRows] = useState<CliRow[]>([]);
  const [folderMap, setFolderMap] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    bridge
      .getSettings()
      .then((s: DesktopSettings) => {
        if (cancelled) return;
        setApiBaseUrl(s.apiBaseUrl);
        setPromptTemplate(s.promptTemplate);
        setCliRows(s.cliDefinitions.map(toRow));
        setFolderMap(s.projectFolderMap);
        setLoaded(true);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  function updateRow(index: number, patch: Partial<CliRow>): void {
    setCliRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function toggleOwner(index: number, owner: Owner): void {
    setCliRows((rows) =>
      rows.map((r, i) => {
        if (i !== index) return r;
        const has = r.defaultForOwners.includes(owner);
        return {
          ...r,
          defaultForOwners: has
            ? r.defaultForOwners.filter((o) => o !== owner)
            : [...r.defaultForOwners, owner],
        };
      }),
    );
  }

  async function handleChangeFolder(project: string): Promise<void> {
    const folder = await bridge.pickFolder();
    if (folder) setFolderMap((m) => ({ ...m, [project]: folder }));
  }

  async function handleSave(): Promise<void> {
    setError(null);
    try {
      const saved = await bridge.setSettings({
        apiBaseUrl,
        promptTemplate,
        cliDefinitions: cliRows.map(toDefinition),
        projectFolderMap: folderMap,
      });
      setApiBase(saved.apiBaseUrl);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="settings-dialog"
        role="dialog"
        aria-label="デスクトップ設定"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="settings-dialog__title">デスクトップ設定</h2>
        {error && (
          <p role="alert" className="settings-dialog__error">
            {error}
          </p>
        )}
        {loaded && (
          <>
            <label className="field">
              <span>API ベース URL</span>
              <input
                aria-label="API ベース URL"
                value={apiBaseUrl}
                placeholder="空欄はビルド時の既定を使う"
                onChange={(e) => setApiBaseUrl(e.target.value)}
              />
            </label>
            <label className="field">
              <span>プロンプトテンプレート</span>
              <input
                aria-label="プロンプトテンプレート"
                value={promptTemplate}
                onChange={(e) => setPromptTemplate(e.target.value)}
              />
            </label>

            <h3 className="settings-dialog__section">CLI 定義</h3>
            {cliRows.map((row, i) => (
              <fieldset
                key={i}
                className="settings-dialog__cli"
                role="group"
                aria-label={'CLI 定義 ' + String(i + 1)}
              >
                <label className="field">
                  <span>ID</span>
                  <input
                    aria-label="ID"
                    value={row.id}
                    onChange={(e) => updateRow(i, { id: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>名前</span>
                  <input
                    aria-label="名前"
                    value={row.name}
                    onChange={(e) => updateRow(i, { name: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>コマンド</span>
                  <input
                    aria-label="コマンド"
                    value={row.command}
                    onChange={(e) => updateRow(i, { command: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>引数</span>
                  <input
                    aria-label="引数"
                    value={row.argsText}
                    placeholder="例: -p {prompt}"
                    onChange={(e) => updateRow(i, { argsText: e.target.value })}
                  />
                </label>
                <div className="field field--full settings-dialog__owner-field">
                  <span>既定にする owner</span>
                  <div className="settings-dialog__owners">
                    {AI_OWNERS.map((owner) => (
                      <label key={owner} className="settings-dialog__owner">
                        <input
                          type="checkbox"
                          checked={row.defaultForOwners.includes(owner)}
                          onChange={() => toggleOwner(i, owner)}
                        />
                        {owner}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="settings-dialog__cli-actions">
                  <button
                    type="button"
                    className="settings-dialog__icon-btn settings-dialog__icon-btn--danger"
                    aria-label="削除"
                    title="削除"
                    onClick={() => setCliRows((rows) => rows.filter((_, j) => j !== i))}
                  >
                    <Icon name="minus" />
                  </button>
                </div>
              </fieldset>
            ))}
            <div>
              <button
                type="button"
                className="settings-dialog__icon-btn"
                aria-label="CLI を追加"
                title="CLI を追加"
                onClick={() =>
                  setCliRows((rows) => [
                    ...rows,
                    { id: '', name: '', command: '', argsText: '', defaultForOwners: [] },
                  ])
                }
              >
                <Icon name="plus" />
              </button>
            </div>

            <h3 className="settings-dialog__section">project → フォルダ</h3>
            <ul className="settings-dialog__folders">
              {Object.entries(folderMap).map(([project, folder]) => (
                <li key={project}>
                  <span className="settings-dialog__folder-name">{project}</span>
                  <span className="settings-dialog__folder-path">{folder}</span>
                  <button
                    type="button"
                    className="settings-dialog__btn"
                    onClick={() => void handleChangeFolder(project)}
                  >
                    変更
                  </button>
                  <button
                    type="button"
                    className="settings-dialog__icon-btn settings-dialog__icon-btn--danger"
                    aria-label="削除"
                    title="削除"
                    onClick={() =>
                      setFolderMap((m) =>
                        Object.fromEntries(Object.entries(m).filter(([k]) => k !== project)),
                      )
                    }
                  >
                    <Icon name="minus" />
                  </button>
                </li>
              ))}
            </ul>

            <div className="settings-dialog__actions">
              <button type="button" aria-label="キャンセル" title="キャンセル" onClick={onClose}>
                <Icon name="x" />
              </button>
              <button
                type="button"
                className="settings-dialog__save"
                aria-label="保存"
                title="保存"
                onClick={() => void handleSave()}
              >
                <Icon name="check" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

