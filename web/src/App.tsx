import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Board } from './components/Board';
import { BoardControls } from './components/BoardControls';
import { CreateTaskDialog } from './components/CreateTaskDialog';
import { filterTasks, distinctValues, ALL, type BoardFilter } from './lib/board-view';
import { LabelOptionsProvider } from './lib/label-options';
import { useBoard, BOARD_QUERY_KEY } from './hooks/useBoard';
import {
  isAuthConfigured,
  onUserChange,
  signInWithGoogle,
  signOutUser,
} from './auth/firebase-auth';
import { Icon } from './components/icons';

// #02 Firebase サインイン、#03 タスク作成、#05/#06 遷移・アーカイブ、#08 ポーリング自動更新。
export function App() {
  const queryClient = useQueryClient();
  const [authError, setAuthError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<BoardFilter>({
    owner: ALL,
    department: ALL,
    project: ALL,
    milestone: ALL,
  });
  // サインイン中のみボードを取得する。未ログイン時は他人のタスクを一切読み込まない。
  const isSignedIn = email !== null;
  const { data: tasks = [], error } = useBoard({ enabled: isSignedIn });
  // サマリ・選択肢は全タスク、カンバンには絞り込み後を渡す。
  const visibleTasks = filterTasks(tasks, filter);
  // ダイアログの datalist 候補は、フィルタ前の全タスク由来の既存 project/milestone。
  const labelOptions = {
    projects: distinctValues(tasks, 'project'),
    milestones: distinctValues(tasks, 'milestone'),
  };

  useEffect(() => onUserChange(setEmail), []);

  // サインイン状態が変わると認証ヘッダーが変わるため、ボードを再取得する。
  const refreshBoard = (): void => {
    void queryClient.invalidateQueries({ queryKey: BOARD_QUERY_KEY });
  };
  useEffect(refreshBoard, [email]); // eslint-disable-line react-hooks/exhaustive-deps

  const message = authError ?? (error instanceof Error ? error.message : null);

  return (
    <LabelOptionsProvider value={labelOptions}>
    <main className="app">
      <header className="app__header">
        <div className="app__brand">
          <h1 className="app__title">HANDOFF</h1>
          <p className="app__subtitle">人間とAIの共同タスクボード</p>
        </div>
        <div className="app__auth">
          {isSignedIn && (
            <button
              type="button"
              aria-label="新規タスク"
              title="新規タスク"
              onClick={() => setShowCreate(true)}
            >
              <Icon name="plus" />
            </button>
          )}
          {email ? (
            <>
              <span className="app__user">{email}</span>
              <button
                type="button"
                aria-label="サインアウト"
                title="サインアウト"
                onClick={() => void signOutUser()}
              >
                <Icon name="log-out" />
              </button>
            </>
          ) : (
            <button
              type="button"
              aria-label="Google でサインイン"
              title="Google でサインイン"
              disabled={!isAuthConfigured()}
              onClick={() =>
                void signInWithGoogle().catch((e: unknown) =>
                  setAuthError(e instanceof Error ? e.message : String(e)),
                )
              }
            >
              <Icon name="log-in" />
            </button>
          )}
        </div>
      </header>
      {message && (
        <p role="alert" className="app__error">
          {message}
        </p>
      )}
      {isSignedIn ? (
        <>
          <BoardControls tasks={tasks} filter={filter} onFilterChange={setFilter} />
          <Board
            tasks={visibleTasks}
            onTransitioned={refreshBoard}
            onArchived={refreshBoard}
            onDeleted={refreshBoard}
          />
        </>
      ) : (
        <p className="app__signin-prompt">
          サインインすると、あなたが作成したタスクのボードが表示されます。
        </p>
      )}
      {showCreate && (
        <CreateTaskDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            refreshBoard();
            setShowCreate(false);
          }}
        />
      )}
    </main>
    </LabelOptionsProvider>
  );
}
