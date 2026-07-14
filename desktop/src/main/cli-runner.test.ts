import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { RunEvent } from '@handoff/shared';
import { CliRunner, expandArgs, quoteForCmd, renderPrompt, type ChildLike } from './cli-runner.js';

class FakeChild extends EventEmitter {
  pid = 1234;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}

function setup() {
  const children: FakeChild[] = [];
  const spawnFn = vi.fn((_cmd: string, _args: string[], _opts: { cwd: string; shell: boolean }) => {
    const child = new FakeChild();
    children.push(child);
    return child as unknown as ChildLike;
  });
  const killTree = vi.fn();
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
});

describe('CliRunner', () => {
  it('start で running ステータスを発行し、引数を quote して spawn する', () => {
    const { runner, spawnFn, events } = setup();
    const { runId } = runner.start(REQ);
    expect(spawnFn).toHaveBeenCalledWith('claude', ['"-p"', '"やる"'], {
      cwd: 'C:/work',
      shell: true,
    });
    expect(events[0]).toMatchObject({ runId, type: 'status', run: { status: 'running' } });
  });

  it('stdout をログに蓄積しイベントを流す', () => {
    const { runner, events, children } = setup();
    const { runId } = runner.start(REQ);
    children[0].stdout.emit('data', Buffer.from('hello'));
    expect(events).toContainEqual({ runId, type: 'stdout', chunk: 'hello' });
    expect(runner.getLog(runId)).toBe('hello');
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

  it('cancel は killTree を呼び cancelled にする。後続の exit で上書きされない', () => {
    const { runner, killTree, children } = setup();
    const { runId } = runner.start(REQ);
    runner.cancel(runId);
    expect(killTree).toHaveBeenCalledWith(1234);
    children[0].emit('exit', 1);
    expect(runner.list().find((r) => r.runId === runId)?.status).toBe('cancelled');
  });

  it('spawn の error イベント（ENOENT 等）で failed になりメッセージがログに残る', () => {
    const { runner, children } = setup();
    const { runId } = runner.start(REQ);
    children[0].emit('error', new Error('spawn claude ENOENT'));
    expect(runner.list().find((r) => r.runId === runId)?.status).toBe('failed');
    expect(runner.getLog(runId)).toContain('ENOENT');
  });

  it('ログは上限を超えた分から切り捨てる', () => {
    const { runner, children } = setup();
    const { runId } = runner.start(REQ);
    children[0].stdout.emit('data', 'x'.repeat(1_000_001));
    expect(runner.getLog(runId).length).toBe(1_000_000);
  });
});
