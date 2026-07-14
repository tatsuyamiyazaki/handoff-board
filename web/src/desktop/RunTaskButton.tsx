import { useState } from 'react';
import { isAiOwner, type HandoffDesktopBridge, type Task } from '@handoff/shared';
import { desktopBridge } from './bridge';
import { RunDialog } from './RunDialog';

interface RunTaskButtonProps {
  task: Task;
  /** テスト用に差し替え可能。既定は window.handoffDesktop。 */
  bridge?: HandoffDesktopBridge | null;
}

/** AI オーナーのタスクをローカル CLI で実行するボタン。デスクトップ版のみ表示。 */
export function RunTaskButton({ task, bridge = desktopBridge() }: RunTaskButtonProps) {
  const [open, setOpen] = useState(false);
  if (!bridge || !isAiOwner(task.owner)) return null;
  return (
    <>
      <button
        type="button"
        aria-label="AI実行"
        title="ローカル CLI で実行"
        onClick={() => setOpen(true)}
      >
        ▶
      </button>
      {open && <RunDialog task={task} bridge={bridge} onClose={() => setOpen(false)} />}
    </>
  );
}
