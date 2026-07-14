import { useEffect, useState } from 'react';
import { isAiOwner, type HandoffDesktopBridge, type Task } from '@handoff/shared';
import { desktopBridge } from './bridge';
import { RunDialog } from './RunDialog';

interface RunTaskButtonProps {
  task: Task;
  bridge?: HandoffDesktopBridge | null;
}

export function RunTaskButton({ task, bridge = desktopBridge() }: RunTaskButtonProps) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    let active = true;
    void bridge
      .listRuns()
      .then((runs) => {
        if (active) setRunning(runs.some((run) => run.taskId === task.id && run.status === 'running'));
      })
      .catch(() => {});
    const unsubscribe = bridge.onRunEvent((event) => {
      if (event.type === 'status' && event.run.taskId === task.id) {
        setRunning(event.run.status === 'running');
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bridge, task.id]);

  if (!bridge || !isAiOwner(task.owner)) return null;
  return (
    <>
      <button
        type="button"
        aria-label={running ? 'AI実行中' : 'AI実行'}
        title={running ? 'ローカル CLI で実行中' : 'ローカル CLI で実行'}
        disabled={running}
        onClick={() => setOpen(true)}
      >
        {running ? '…' : '▶'}
      </button>
      {open && <RunDialog task={task} bridge={bridge} onClose={() => setOpen(false)} />}
    </>
  );
}
