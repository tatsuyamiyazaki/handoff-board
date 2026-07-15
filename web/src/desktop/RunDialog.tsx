import { useEffect, useState } from 'react';
import type { DesktopSettings, HandoffDesktopBridge, Task } from '@handoff/shared';

interface RunDialogProps {
  task: Task;
  bridge: HandoffDesktopBridge;
  onClose: () => void;
}

export function RunDialog({ task, bridge, onClose }: RunDialogProps) {
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [cliId, setCliId] = useState('');
  const [cwd, setCwd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showSettingsAction, setShowSettingsAction] = useState(false);

  useEffect(() => {
    let cancelled = false;
    bridge.getSettings().then((value) => {
      if (cancelled) return;
      setSettings(value);
      const definition = value.cliDefinitions.find((item) => item.defaultForOwners.includes(task.owner)) ?? value.cliDefinitions[0];
      if (definition) setCliId(definition.id);
      if (task.project && value.projectFolderMap[task.project]) setCwd(value.projectFolderMap[task.project]);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
    return () => { cancelled = true; };
  }, [bridge, task]);

  async function handlePickFolder(): Promise<void> {
    setError(null);
    try {
      const folder = await bridge.pickFolder();
      if (!folder) return;
      setCwd(folder);
      if (task.project) {
        const map = { ...(settings?.projectFolderMap ?? {}), [task.project]: folder };
        const updated = await bridge.setSettings({ projectFolderMap: map });
        setSettings(updated);
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function handleRun(): Promise<void> {
    if (!cliId || !cwd) return;
    setSubmitting(true);
    setError(null);
    setShowSettingsAction(false);
    try {
      await bridge.runTask({ taskId: task.id, taskTitle: task.title, cliId, cwd });
      onClose();
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      if (message.includes('フォルダが存在しません')) setCwd(null);
      if (message.includes('コマンドが見つかりません')) setShowSettingsAction(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div className="run-dialog" role="dialog" aria-label="タスクを CLI で実行" onClick={(event) => event.stopPropagation()}>
        <h2 className="run-dialog__title">AI実行 — {task.title}</h2>
        {error && <p role="alert" className="run-dialog__error">{error}</p>}
        {showSettingsAction && (
          <button type="button" onClick={() => window.dispatchEvent(new Event('handoff:open-settings'))}>
            デスクトップ設定を開く
          </button>
        )}
        <label className="field">
          <span>CLI</span>
          <select aria-label="CLI" value={cliId} onChange={(event) => setCliId(event.target.value)}>
            {(settings?.cliDefinitions ?? []).map((definition) => (
              <option key={definition.id} value={definition.id}>{definition.name}</option>
            ))}
          </select>
        </label>
        <div className="run-dialog__cwd">
          <span>作業フォルダ: </span>
          {cwd ? <span>{cwd}</span> : <span>未設定</span>}
          <button type="button" onClick={() => void handlePickFolder()}>フォルダを選択</button>
        </div>
        <div className="run-dialog__actions">
          <button type="button" onClick={onClose}>キャンセル</button>
          <button type="button" disabled={!cliId || !cwd || submitting} onClick={() => void handleRun()}>実行</button>
        </div>
      </div>
    </div>
  );
}
