import { useEffect, useRef, useState } from 'react';
import type { HandoffDesktopBridge, RunLogSnapshot, RunSummary } from '@handoff/shared';

const MAX_CLIENT_LOG_CHARS = 200_000;

interface BufferedLogChunk {
  chunk: string;
  sequence: number;
}

function appendLog(log: string, chunk: string): string {
  return (log + chunk).slice(-MAX_CLIENT_LOG_CHARS);
}

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
    let initialized = false;
    const bufferedChunks = new Map<string, BufferedLogChunk[]>();

    const finishInitialization = (
      entries: ReadonlyArray<readonly [string, RunLogSnapshot]>,
    ): void => {
      if (!active) return;

      const initialLogs: Record<string, string> = {};
      const snapshotRunIds = new Set<string>();
      for (const [runId, snapshot] of entries) {
        snapshotRunIds.add(runId);
        initialLogs[runId] = (bufferedChunks.get(runId) ?? [])
          .filter(({ sequence }) => sequence > snapshot.lastSequence)
          .reduce(
            (log, { chunk }) => appendLog(log, chunk),
            snapshot.log.slice(-MAX_CLIENT_LOG_CHARS),
          );
      }
      for (const [runId, chunks] of bufferedChunks) {
        if (snapshotRunIds.has(runId)) continue;
        initialLogs[runId] = chunks.reduce((log, { chunk }) => appendLog(log, chunk), '');
      }

      bufferedChunks.clear();
      initialized = true;
      setLogs((current) => ({ ...current, ...initialLogs }));
    };

    const unsubscribe = bridge.onRunEvent((ev) => {
      if (ev.type === 'status') {
        setRuns((prev) => [ev.run, ...prev.filter((run) => run.runId !== ev.run.runId)]);
        if (ev.run.status !== 'running') onTerminalRef.current?.(ev.run);
      } else if (!initialized) {
        const chunks = bufferedChunks.get(ev.runId) ?? [];
        chunks.push({ chunk: ev.chunk, sequence: ev.sequence });
        bufferedChunks.set(ev.runId, chunks);
      } else {
        setLogs((prev) => ({
          ...prev,
          [ev.runId]: appendLog(prev[ev.runId] ?? '', ev.chunk),
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
        finishInitialization(entries);
      })
      .catch(() => finishInitialization([]));

    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge]);

  return { runs, logs };
}
