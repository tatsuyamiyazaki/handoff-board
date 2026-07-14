import { useEffect, useRef, useState } from 'react';
import type { HandoffDesktopBridge, RunSummary } from '@handoff/shared';

const MAX_CLIENT_LOG_CHARS = 200_000;

export interface RunsState {
  runs: RunSummary[];
  logs: Record<string, string>;
}

export function useRunEvents(
  bridge: HandoffDesktopBridge,
  onTerminal?: (run: RunSummary) => void,
): RunsState {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [logs, setLogs] = useState<Record<string, string>>({});
  const onTerminalRef = useRef(onTerminal);
  onTerminalRef.current = onTerminal;

  useEffect(() => {
    let active = true;
    const unsubscribe = bridge.onRunEvent((ev) => {
      if (ev.type === 'status') {
        setRuns((prev) => [ev.run, ...prev.filter((run) => run.runId !== ev.run.runId)]);
        if (ev.run.status !== 'running') onTerminalRef.current?.(ev.run);
      } else {
        setLogs((prev) => ({
          ...prev,
          [ev.runId]: ((prev[ev.runId] ?? '') + ev.chunk).slice(-MAX_CLIENT_LOG_CHARS),
        }));
      }
    });

    void bridge
      .listRuns()
      .then(async (initialRuns) => {
        const entries = await Promise.all(
          initialRuns.map(async (run) => [run.runId, await bridge.getRunLog(run.runId)] as const),
        );
        if (!active) return;
        setRuns((current) => [
          ...current,
          ...initialRuns.filter((run) => !current.some((item) => item.runId === run.runId)),
        ]);
        setLogs((current) => ({ ...Object.fromEntries(entries), ...current }));
      })
      .catch(() => {});

    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge]);

  return { runs, logs };
}
