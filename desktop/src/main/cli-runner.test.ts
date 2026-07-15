import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { RunEvent } from '@handoff/shared';
import { CliRunner, expandArgs, quoteForCmd, renderPrompt, type ChildLike } from './cli-runner.js';

class FakeChild extends EventEmitter {
  pid: number | undefined = 1234;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function terminalStatusEvents(events: RunEvent[], runId: string) {
  return events.filter(
    (event) => event.runId === runId && event.type === 'status' && event.run.status !== 'running',
  );
}

function setup() {
  const children: FakeChild[] = [];
  const spawnFn = vi.fn((_cmd: string, _args: string[], _opts: { cwd: string; shell: false }) => {
    const child = new FakeChild();
    children.push(child);
    return child as unknown as ChildLike;
  });
  const killTree = vi.fn().mockResolvedValue(undefined);
  const events: RunEvent[] = [];
  const runner = new CliRunner(spawnFn, killTree, (ev) => events.push(ev));
  return { runner, spawnFn, killTree, events, children };
}

const REQ = {
  taskId: 't1',
  taskTitle: 'テスト',
  cliName: 'Claude Code',
  command: 'claude',
  args: ['-p', 'やる'],
  cwd: 'C:/work',
};

describe('expandArgs / renderPrompt / quoteForCmd', () => {
  it('プレースホルダを要素単位で展開する', () => {
    expect(
      expandArgs(['-p', '{prompt}', '--task={taskId}'], {
        prompt: 'P',
        taskId: 'id1',
        title: 'T',
      }),
    ).toEqual(['-p', 'P', '--task=id1']);
  });

  it('renderPrompt は taskId と title を埋める', () => {
    expect(renderPrompt('do {taskId} ({title})', { taskId: 'a', title: 'b' })).toBe('do a (b)');
  });

  it('quoteForCmd は全体を二重引用符で包み、内部の引用符を二重化する', () => {
    expect(quoteForCmd('hello world')).toBe('"hello world"');
    expect(quoteForCmd('say "hi"')).toBe('"say ""hi"""');
  });
  it('quoteForCmd はシェルの行境界になる改行を拒否する', () => {
    expect(() => quoteForCmd('safe\r\nwhoami')).toThrow('改行');
  });
});

describe('CliRunner', () => {
  it('start で running ステータスを発行し、引数を quote して spawn する', () => {
    const { runner, spawnFn, events } = setup();
    const { runId } = runner.start(REQ);
    expect(spawnFn).toHaveBeenCalledWith('claude', ['-p', 'やる'], {
      cwd: 'C:/work',
      shell: false,
    });
    expect(events[0]).toMatchObject({ runId, type: 'status', run: { status: 'running' } });
  });

  it('stdout / stderr イベントに実行ごとの単調増加 sequence を付ける', () => {
    const { runner, events, children } = setup();
    const first = runner.start(REQ);
    const second = runner.start({ ...REQ, taskId: 't2' });

    children[0].stdout.emit('data', Buffer.from('first-out'));
    children[1].stderr.emit('data', Buffer.from('second-err'));
    children[0].stderr.emit('data', Buffer.from('first-err'));
    children[1].stdout.emit('data', Buffer.from('second-out'));

    expect(events.filter((event) => event.type !== 'status')).toEqual([
      { runId: first.runId, type: 'stdout', chunk: 'first-out', sequence: 1 },
      { runId: second.runId, type: 'stderr', chunk: 'second-err', sequence: 1 },
      { runId: first.runId, type: 'stderr', chunk: 'first-err', sequence: 2 },
      { runId: second.runId, type: 'stdout', chunk: 'second-out', sequence: 2 },
    ]);
  });

  it('ログ snapshot は同じ RunEntry のログと最終 sequence を返す', () => {
    const { runner, children } = setup();
    const { runId } = runner.start(REQ);
    children[0].stdout.emit('data', Buffer.from('hello'));
    children[0].stderr.emit('data', Buffer.from(' error'));

    expect(runner.getLogSnapshot(runId)).toEqual({
      log: 'hello error',
      lastSequence: 2,
    });
    expect(runner.getLogSnapshot('unknown')).toEqual({ log: '', lastSequence: 0 });
  });

  it('exit 0 → succeeded / exit 1 → failed', () => {
    const { runner, children } = setup();
    const { runId } = runner.start(REQ);
    children[0].emit('exit', 0);
    expect(runner.list().find((r) => r.runId === runId)).toMatchObject({
      status: 'succeeded',
      exitCode: 0,
    });

    const second = runner.start({ ...REQ, taskId: 't2' });
    children[1].emit('exit', 1);
    expect(runner.list().find((r) => r.runId === second.runId)).toMatchObject({
      status: 'failed',
      exitCode: 1,
    });
  });

  it('同一タスクの二重実行を拒否する', () => {
    const { runner } = setup();
    runner.start(REQ);
    expect(() => runner.start(REQ)).toThrow('実行中');
  });

  it('終了後なら同一タスクを再実行できる', () => {
    const { runner, children } = setup();
    runner.start(REQ);
    children[0].emit('exit', 0);
    expect(() => runner.start(REQ)).not.toThrow();
  });

  it('cancel は killTree 完了後に cancelled にする。後続の exit で上書きされない', async () => {
    const { runner, killTree, children } = setup();
    const { runId } = runner.start(REQ);
    await runner.cancel(runId);
    expect(killTree).toHaveBeenCalledWith(1234);
    children[0].emit('exit', 1);
    expect(runner.list().find((r) => r.runId === runId)?.status).toBe('cancelled');
  });

  it('killTree 待機中に exit してもキャンセル要求が勝ち、terminal status は一度だけ発行する', async () => {
    const killPending = deferred<void>();
    const { runner, killTree, events, children } = setup();
    killTree.mockReturnValueOnce(killPending.promise);
    const { runId } = runner.start(REQ);

    const cancelPromise = runner.cancel(runId);
    children[0].emit('exit', 0);
    expect(runner.list().find((run) => run.runId === runId)?.status).toBe('running');

    killPending.resolve();
    await cancelPromise;
    children[0].emit('exit', 1);

    expect(runner.list().find((run) => run.runId === runId)?.status).toBe('cancelled');
    expect(terminalStatusEvents(events, runId)).toHaveLength(1);
  });

  it.each([128, '128'])('killTree の code %s は cancelled として扱い reject しない', async (code) => {
    const killPending = deferred<void>();
    const { runner, killTree, events, children } = setup();
    killTree.mockReturnValueOnce(killPending.promise);
    const { runId } = runner.start(REQ);
    const error = Object.assign(new Error('process already exited'), { code });

    const cancelPromise = runner.cancel(runId);
    children[0].emit('exit', 1);
    killPending.reject(error);

    await expect(cancelPromise).resolves.toBeUndefined();
    children[0].emit('exit', 0);
    expect(runner.list().find((run) => run.runId === runId)?.status).toBe('cancelled');
    expect(runner.getLogSnapshot(runId).log).toBe('');
    expect(terminalStatusEvents(events, runId)).toHaveLength(1);
  });

  it('killTree の code 128 以外の失敗はログを残して failed にし、cancel を reject する', async () => {
    const killPending = deferred<void>();
    const { runner, killTree, events, children } = setup();
    killTree.mockReturnValueOnce(killPending.promise);
    const { runId } = runner.start(REQ);
    const error = Object.assign(new Error('access denied'), { code: 'EPERM' });

    const cancelPromise = runner.cancel(runId);
    children[0].emit('exit', 0);
    killPending.reject(error);

    await expect(cancelPromise).rejects.toBe(error);
    children[0].emit('exit', 0);
    expect(runner.list().find((run) => run.runId === runId)?.status).toBe('failed');
    expect(runner.getLogSnapshot(runId).log).toContain('キャンセルに失敗しました: access denied');
    expect(terminalStatusEvents(events, runId)).toHaveLength(1);
  });

  it('キャンセル処理中の再度の cancel は no-op で killTree を一度だけ呼ぶ', async () => {
    const killPending = deferred<void>();
    const { runner, killTree, events, children } = setup();
    killTree.mockReturnValueOnce(killPending.promise);
    const { runId } = runner.start(REQ);

    const firstCancel = runner.cancel(runId);
    await runner.cancel(runId);
    children[0].emit('exit', 1);
    expect(killTree).toHaveBeenCalledTimes(1);

    killPending.resolve();
    await firstCancel;
    children[0].emit('exit', 1);
    expect(runner.list().find((run) => run.runId === runId)?.status).toBe('cancelled');
    expect(terminalStatusEvents(events, runId)).toHaveLength(1);
  });

  it('pid がない child は killTree を呼ばず cancelled にする', async () => {
    const { runner, killTree, events, children } = setup();
    const { runId } = runner.start(REQ);
    children[0].pid = undefined;

    await runner.cancel(runId);
    children[0].emit('exit', 1);

    expect(killTree).not.toHaveBeenCalled();
    expect(runner.list().find((run) => run.runId === runId)?.status).toBe('cancelled');
    expect(terminalStatusEvents(events, runId)).toHaveLength(1);
  });

  it('終了済みまたは unknown の run の cancel は no-op', async () => {
    const { runner, killTree, events, children } = setup();
    const { runId } = runner.start(REQ);
    children[0].emit('exit', 0);

    await runner.cancel(runId);
    await runner.cancel('unknown');
    children[0].emit('exit', 1);

    expect(killTree).not.toHaveBeenCalled();
    expect(runner.list().find((run) => run.runId === runId)?.status).toBe('succeeded');
    expect(terminalStatusEvents(events, runId)).toHaveLength(1);
  });

  it('spawn の error イベント（ENOENT 等）で failed になりメッセージがログに残る', () => {
    const { runner, children } = setup();
    const { runId } = runner.start(REQ);
    children[0].emit('error', new Error('spawn claude ENOENT'));
    expect(runner.list().find((r) => r.runId === runId)?.status).toBe('failed');
    expect(runner.getLogSnapshot(runId).log).toContain('ENOENT');
  });

  it('ログは上限を超えた分から切り捨てる', () => {
    const { runner, children } = setup();
    const { runId } = runner.start(REQ);
    children[0].stdout.emit('data', 'x'.repeat(1_000_001));
    expect(runner.getLogSnapshot(runId).log.length).toBe(1_000_000);
  });
});
