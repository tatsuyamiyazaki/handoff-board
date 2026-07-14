// CLI 子プロセスの起動・出力ストリーミング・実行管理。spawn/kill は注入してテスト可能にする。
import type { RunEvent, RunStatus, RunSummary } from '@handoff/shared';

export type TemplateVars = Readonly<Record<'prompt' | 'taskId' | 'title', string>>;

/** argsTemplate のプレースホルダを要素単位で展開する（文字列連結でコマンドを組まない）。 */
export function expandArgs(template: readonly string[], vars: TemplateVars): string[] {
  return template.map((arg) =>
    arg.replace(/{(prompt|taskId|title)}/g, (_m, key: keyof TemplateVars) => vars[key]),
  );
}

/** promptTemplate の {taskId} / {title} を埋める。 */
export function renderPrompt(template: string, vars: { taskId: string; title: string }): string {
  return template.replace(/{(taskId|title)}/g, (_m, key: 'taskId' | 'title') => vars[key]);
}

/**
 * Windows の shell:true（cmd.exe）向けの引数クォート。全体を二重引用符で包み、内部の " は "" に。
 * 制約: プロンプトに改行を含めない（settings-core が単一行テンプレートを前提とする）。
 */
export function quoteForCmd(arg: string): string {
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
  options: { cwd: string; shell: boolean },
) => ChildLike;

export type KillTreeFn = (pid: number) => void;

export interface StartRequest {
  taskId: string;
  taskTitle: string;
  cliName: string;
  command: string;
  args: string[];
  cwd: string;
}

const MAX_LOG_CHARS = 1_000_000;

interface RunEntry {
  summary: RunSummary;
  log: string;
  child: ChildLike | null;
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
    this.runs.set(runId, { summary, log: '', child: null });

    const child = this.spawnFn(req.command, req.args.map(quoteForCmd), {
      cwd: req.cwd,
      shell: true,
    });
    const entry = this.runs.get(runId);
    if (entry) entry.child = child;

    child.stdout?.on('data', (chunk) => this.append(runId, 'stdout', String(chunk)));
    child.stderr?.on('data', (chunk) => this.append(runId, 'stderr', String(chunk)));
    child.on('error', (err) => {
      this.append(runId, 'stderr', err.message + '\n');
      this.finish(runId, 'failed', null);
    });
    child.on('exit', (code) => {
      this.finish(runId, code === 0 ? 'succeeded' : 'failed', code);
    });

    this.emit({ runId, type: 'status', run: summary });
    return { runId };
  }

  cancel(runId: string): void {
    const entry = this.runs.get(runId);
    if (!entry || entry.summary.status !== 'running') return;
    if (entry.child?.pid !== undefined) this.killTree(entry.child.pid);
    this.finish(runId, 'cancelled', null);
  }

  /** 新しい順のサマリ一覧。 */
  list(): RunSummary[] {
    return [...this.runs.values()].map((r) => r.summary).reverse();
  }

  getLog(runId: string): string {
    return this.runs.get(runId)?.log ?? '';
  }

  private append(runId: string, type: 'stdout' | 'stderr', chunk: string): void {
    const entry = this.runs.get(runId);
    if (!entry) return;
    entry.log = (entry.log + chunk).slice(-MAX_LOG_CHARS);
    this.emit({ runId, type, chunk });
  }

  private finish(runId: string, status: RunStatus, exitCode: number | null): void {
    const entry = this.runs.get(runId);
    if (!entry || entry.summary.status !== 'running') return;
    entry.summary = { ...entry.summary, status, exitCode };
    this.emit({ runId, type: 'status', run: entry.summary });
  }
}
