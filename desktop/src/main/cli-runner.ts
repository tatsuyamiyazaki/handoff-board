import type { RunEvent, RunLogSnapshot, RunStatus, RunSummary } from '@handoff/shared';

export type TemplateVars = Readonly<Record<'prompt' | 'taskId' | 'title', string>>;

export function expandArgs(template: readonly string[], vars: TemplateVars): string[] {
  return template.map((arg) =>
    arg.replace(/{(prompt|taskId|title)}/g, (_m, key: keyof TemplateVars) => vars[key]),
  );
}

export function renderPrompt(template: string, vars: { taskId: string; title: string }): string {
  return template.replace(/{(taskId|title)}/g, (_m, key: 'taskId' | 'title') => vars[key]);
}

/** 互換 API。シェル境界に流せない改行を拒否する。実行自体は cross-spawn に委譲する。 */
export function quoteForCmd(arg: string): string {
  if (/[\r\n]/.test(arg)) throw new Error('CLI 引数に改行は使用できません');
  return '"' + arg.replace(/"/g, '""') + '"';
}

export interface ChildLike {
  pid?: number;
  stdout: { on(event: 'data', cb: (chunk: Buffer | string) => void): unknown } | null;
  stderr: { on(event: 'data', cb: (chunk: Buffer | string) => void): unknown } | null;
  on(event: 'exit', cb: (code: number | null) => void): unknown;
  on(event: 'error', cb: (err: Error) => void): unknown;
}

export type SpawnLike = (
  command: string,
  args: string[],
  options: { cwd: string; shell: false },
) => ChildLike;

export type KillTreeFn = (pid: number) => Promise<void>;

export interface StartRequest {
  taskId: string;
  taskTitle: string;
  cliName: string;
  command: string;
  args: string[];
  cwd: string;
}

const MAX_LOG_CHARS = 1_000_000;

function isProcessAlreadyExitedError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('code' in err)) return false;
  const { code } = err as { code: unknown };
  return code === 128 || code === '128';
}

interface RunEntry {
  summary: RunSummary;
  log: string;
  lastSequence: number;
  child: ChildLike | null;
  cancelling: boolean;
}

export class CliRunner {
  private readonly runs = new Map<string, RunEntry>();
  private seq = 0;

  constructor(
    private readonly spawnFn: SpawnLike,
    private readonly killTree: KillTreeFn,
    private readonly emit: (ev: RunEvent) => void,
  ) {}

  isTaskRunning(taskId: string): boolean {
    return [...this.runs.values()].some(
      (r) => r.summary.taskId === taskId && r.summary.status === 'running',
    );
  }

  start(req: StartRequest): { runId: string } {
    if (this.isTaskRunning(req.taskId)) {
      throw new Error('タスク ' + req.taskId + ' は実行中です');
    }
    for (const arg of req.args) {
      if (/[\r\n]/.test(arg)) throw new Error('CLI 引数に改行は使用できません');
    }
    this.seq += 1;
    const runId = 'run-' + String(this.seq);
    const summary: RunSummary = {
      runId,
      taskId: req.taskId,
      taskTitle: req.taskTitle,
      cliName: req.cliName,
      status: 'running',
      exitCode: null,
    };
    this.runs.set(runId, {
      summary,
      log: '',
      lastSequence: 0,
      child: null,
      cancelling: false,
    });

    const child = this.spawnFn(req.command, req.args, { cwd: req.cwd, shell: false });
    const entry = this.runs.get(runId);
    if (entry) entry.child = child;

    child.stdout?.on('data', (chunk) => this.append(runId, 'stdout', String(chunk)));
    child.stderr?.on('data', (chunk) => this.append(runId, 'stderr', String(chunk)));
    child.on('error', (err) => {
      this.append(runId, 'stderr', err.message + '\n');
      this.finish(runId, 'failed', null);
    });
    child.on('exit', (code) => {
      if (this.runs.get(runId)?.cancelling) return;
      this.finish(runId, code === 0 ? 'succeeded' : 'failed', code);
    });

    this.emit({ runId, type: 'status', run: summary });
    return { runId };
  }

  async cancel(runId: string): Promise<void> {
    const entry = this.runs.get(runId);
    if (!entry || entry.summary.status !== 'running' || entry.cancelling) return;
    if (entry.child?.pid === undefined) {
      this.finish(runId, 'cancelled', null);
      return;
    }
    entry.cancelling = true;
    try {
      await this.killTree(entry.child.pid);
      this.finish(runId, 'cancelled', null);
    } catch (err: unknown) {
      if (isProcessAlreadyExitedError(err)) {
        this.finish(runId, 'cancelled', null);
        return;
      }
      entry.cancelling = false;
      const message = err instanceof Error ? err.message : String(err);
      this.append(runId, 'stderr', 'キャンセルに失敗しました: ' + message + '\n');
      this.finish(runId, 'failed', null);
      throw err;
    }
  }

  list(): RunSummary[] {
    return [...this.runs.values()].map((r) => r.summary).reverse();
  }

  getLogSnapshot(runId: string): RunLogSnapshot {
    const entry = this.runs.get(runId);
    if (!entry) return { log: '', lastSequence: 0 };
    return { log: entry.log, lastSequence: entry.lastSequence };
  }

  private append(runId: string, type: 'stdout' | 'stderr', chunk: string): void {
    const entry = this.runs.get(runId);
    if (!entry) return;
    entry.log = (entry.log + chunk).slice(-MAX_LOG_CHARS);
    entry.lastSequence += 1;
    this.emit({ runId, type, chunk, sequence: entry.lastSequence });
  }

  private finish(runId: string, status: RunStatus, exitCode: number | null): void {
    const entry = this.runs.get(runId);
    if (!entry || entry.summary.status !== 'running') return;
    entry.summary = { ...entry.summary, status, exitCode };
    this.emit({ runId, type: 'status', run: entry.summary });
  }
}
