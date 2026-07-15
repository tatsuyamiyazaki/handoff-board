import { useEffect, useRef, useState } from 'react';
import type { HandoffDesktopBridge, RunLogSnapshot, RunSummary } from '@handoff/shared';

const MAX_CLIENT_LOG_CHARS = 200_000;

export interface BufferedLogChunk {
  chunk: string;
  sequence: number;
}

function appendLog(log: string, chunk: string): string {
  return (log + chunk).slice(-MAX_CLIENT_LOG_CHARS);
}

export class BoundedRunLogBuffer {
  private readonly chunksByRun = new Map<string, BufferedLogChunk[]>();
  private readonly lengthsByRun = new Map<string, number>();

  constructor(private readonly maxChars = MAX_CLIENT_LOG_CHARS) {}

  append(runId: string, chunk: BufferedLogChunk): void {
    const chunks = this.chunksByRun.get(runId) ?? [];
    const retainedChunk = {
      ...chunk,
      chunk: this.maxChars === 0 ? '' : chunk.chunk.slice(-this.maxChars),
    };
    chunks.push(retainedChunk);

    const previousLength = this.lengthsByRun.get(runId) ?? 0;
    let overflow = previousLength + retainedChunk.chunk.length - this.maxChars;
    while (overflow > 0 && chunks.length > 0) {
      const first = chunks[0];
      if (first.chunk.length <= overflow) {
        overflow -= first.chunk.length;
        chunks.shift();
      } else {
        chunks[0] = { ...first, chunk: first.chunk.slice(overflow) };
        overflow = 0;
      }
    }

    this.chunksByRun.set(runId, chunks);
    this.lengthsByRun.set(runId, Math.min(previousLength + retainedChunk.chunk.length, this.maxChars));
  }

  get(runId: string): readonly BufferedLogChunk[] {
    return this.chunksByRun.get(runId) ?? [];
  }

  entries(): IterableIterator<[string, BufferedLogChunk[]]> {
    return this.chunksByRun.entries();
  }

  clear(): void {
    this.chunksByRun.clear();
    this.lengthsByRun.clear();
  }
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
    const bufferedChunks = new BoundedRunLogBuffer();

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
      for (const [runId, chunks] of bufferedChunks.entries()) {
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
        bufferedChunks.append(ev.runId, { chunk: ev.chunk, sequence: ev.sequence });
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
        const snapshots = await Promise.allSettled(
          initialRuns.map((run) => bridge.getRunLog(run.runId)),
        );
        const entries = snapshots.flatMap((snapshot, index) =>
          snapshot.status === 'fulfilled'
            ? [[initialRuns[index].runId, snapshot.value] as const]
            : [],
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
      bufferedChunks.clear();
      unsubscribe();
    };
  }, [bridge]);

  return { runs, logs };
}
