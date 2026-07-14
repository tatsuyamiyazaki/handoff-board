import { useEffect, useState } from 'react';
import type { DesktopSettings, HandoffDesktopBridge, Task } from '@handoff/shared';

interface RunDialogProps {
  task: Task;
  bridge: HandoffDesktopBridge;
  onClose: () => void;
}

/** CLI と作業フォルダを確定してタスクを実行するダイアログ。 */
export function RunDialog({ task, bridge, onClose }: RunDialogProps) {
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [cliId, setCliId] = useState('');
  const [cwd, setCwd] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    bridge
      .getSettings()
      .then((s) => {
        if (cancelled) return;
        setSettings(s);
        const def =
          s.cliDefinitions.find((d) => d.defaultForOwners.includes(task.owner)) ??
          s.cliDefinitions[0];
        if (def) setCliId(def.id);
        if (task.project && s.projectFolderMap[task.project]) {
          setCwd(s.projectFolderMap[task.project]);
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [bridge, task]);

  async function handlePickFolder(): Promise<void> {
    const folder = await bridge.pickFolder();
    if (!folder) return;
    setCwd(folder);
    if (task.project) {
      const map = { ...(settings?.projectFolderMap ?? {}), [task.project]: folder };
      const updated = await bridge.setSettings({ projectFolderMap: map });
      setSettings(updated);
    }
  }

  async function handleRun(): Promise<void> {
    if (!cliId || !cwd) return;
    setSubmitting(true);
    setError(null);
    try {
      await bridge.runTask({ taskId: task.id, taskTitle: task.title, cliId, cwd });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="run-dialog"
        role="dialog"
        aria-label="タスクを CLI で実行"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="run-dialog__title">AI実行 — {task.title}</h2>
        {error && (
          <p role="alert" className="run-dialog__error">
            {error}
          </p>
        )}
        <label className="field">
          <span>CLI</span>
          <select
            aria-label="CLI"
            value={cliId}
            onChange={(e) => setCliId(e.target.value)}
          >
            {(settings?.cliDefinitions ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <div className="run-dialog__cwd">
          <span>作業フォルダ: </span>
          {cwd ? <span>{cwd}</span> : <span>未設定</span>}
          <button type="button" onClick={() => void handlePickFolder()}>
            フォルダを選択
          </button>
        </div>
        <div className="run-dialog__actions">
          <button type="button" onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            disabled={!cliId || !cwd || submitting}
            onClick={() => void handleRun()}
          >
            実行
          </button>
        </div>
      </div>
    </div>
  );
}
