import { useEffect, useState } from 'react';
import type { HandoffDesktopBridge, RunSummary } from '@handoff/shared';

/** renderer 側で保持するログの上限（1実行あたり）。超過分は先頭から捨てる。 */
const MAX_CLIENT_LOG_CHARS = 200_000;

export interface RunsState {
  runs: RunSummary[];
  logs: Record<string, string>;
}

/** 実行イベントを購読し、実行一覧とログを状態として返す。 */
export function useRunEvents(bridge: HandoffDesktopBridge): RunsState {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [logs, setLogs] = useState<Record<string, string>>({});

  useEffect(() => {
    void bridge.listRuns().then(setRuns);
    return bridge.onRunEvent((ev) => {
      if (ev.type === 'status') {
        setRuns((prev) => [ev.run, ...prev.filter((r) => r.runId !== ev.run.runId)]);
      } else {
        setLogs((prev) => ({
          ...prev,
          [ev.runId]: ((prev[ev.runId] ?? '') + ev.chunk).slice(-MAX_CLIENT_LOG_CHARS),
        }));
      }
    });
  }, [bridge]);

  return { runs, logs };
}
