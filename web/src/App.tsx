import { useCallback, useEffect, useState } from 'react';
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
import { desktopBridge } from './desktop/bridge';
import { DesktopSettingsDialog } from './desktop/DesktopSettingsDialog';
import { RunPanel } from './desktop/RunPanel';

// #02 Firebase サインイン、#03 タスク作成、#05/#06 遷移・アーカイブ、#08 ポーリング自動更新。
export function App() {
  const queryClient = useQueryClient();
  const bridge = desktopBridge();
  const [authError, setAuthError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showDesktopSettings, setShowDesktopSettings] = useState(false);
  const [filter, setFilter] = useState<BoardFilter>({
    owner: ALL,
    department: ALL,
    project: ALL,
    milestone: ALL,
  });
  const isSignedIn = email !== null;
  const { data: tasks = [], error } = useBoard({ enabled: isSignedIn });
  const visibleTasks = filterTasks(tasks, filter);
  const labelOptions = {
    projects: distinctValues(tasks, 'project'),
    milestones: distinctValues(tasks, 'milestone'),
  };

  useEffect(() => onUserChange(setEmail), []);
  useEffect(() => {
    const openSettings = (): void => setShowDesktopSettings(true);
    window.addEventListener('handoff:open-settings', openSettings);
    return () => window.removeEventListener('handoff:open-settings', openSettings);
  }, []);

  const refreshBoard = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: BOARD_QUERY_KEY });
  }, [queryClient]);
  useEffect(refreshBoard, [email, refreshBoard]);

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
            {bridge && (
              <button
                type="button"
                aria-label="デスクトップ設定"
                title="デスクトップ設定"
                onClick={() => setShowDesktopSettings(true)}
              >
                ⚙
              </button>
            )}
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
            <RunPanel onTerminal={refreshBoard} />
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
        {showDesktopSettings && bridge && (
          <DesktopSettingsDialog
            bridge={bridge}
            onClose={() => {
              setShowDesktopSettings(false);
              refreshBoard();
            }}
          />
        )}
      </main>
    </LabelOptionsProvider>
  );
}
