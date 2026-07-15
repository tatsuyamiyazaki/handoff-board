import { useState } from 'react';
import type { HandoffDesktopBridge } from '@handoff/shared';
import { desktopBridge } from './bridge';
import { useRunEvents } from './useRunEvents';

interface RunPanelProps {
  /** テスト用に差し替え可能。既定は window.handoffDesktop。 */
  bridge?: HandoffDesktopBridge | null;
  onTerminal?: () => void;
}

/** CLI 実行の一覧とログを表示するパネル。デスクトップ版のみ表示。 */
export function RunPanel({ bridge = desktopBridge(), onTerminal }: RunPanelProps) {
  if (!bridge) return null;
  return <RunPanelInner bridge={bridge} onTerminal={onTerminal} />;
}

function RunPanelInner({ bridge, onTerminal }: { bridge: HandoffDesktopBridge; onTerminal?: () => void }) {
  const { runs, logs } = useRunEvents(bridge, onTerminal);
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  if (runs.length === 0) return null;

  return (
    <section className="run-panel" aria-label="CLI 実行ログ">
      <h2 className="run-panel__title">実行</h2>
      <ul className="run-panel__list">
        {runs.map((run) => (
          <li key={run.runId} className="run-panel__item" data-status={run.status}>
            <button
              type="button"
              className="run-panel__row"
              onClick={() => setOpenRunId(openRunId === run.runId ? null : run.runId)}
            >
              <span className="run-panel__status">{run.status}</span>
              <span className="run-panel__task">{run.taskTitle}</span>
              <span className="run-panel__cli">{run.cliName}</span>
              {run.exitCode !== null && <span>exit {run.exitCode}</span>}
            </button>
            {run.status === 'running' && (
              <button
                type="button"
                aria-label="キャンセル"
                onClick={() => void bridge.cancelRun(run.runId)}
              >
                キャンセル
              </button>
            )}
            {(openRunId === run.runId || run.status === 'running') && (
              <pre className="run-panel__log">{logs[run.runId] ?? ''}</pre>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
