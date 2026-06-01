import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Board } from './components/Board';
import { CreateTaskDialog } from './components/CreateTaskDialog';
import { useBoard, BOARD_QUERY_KEY } from './hooks/useBoard';
import {
  isAuthConfigured,
  onUserChange,
  signInWithGoogle,
  signOutUser,
} from './auth/firebase-auth';

// #02 Firebase サインイン、#03 タスク作成、#05/#06 遷移・アーカイブ、#08 ポーリング自動更新。
export function App() {
  const queryClient = useQueryClient();
  const [authError, setAuthError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  // サインイン中のみボードを取得する。未ログイン時は他人のタスクを一切読み込まない。
  const isSignedIn = email !== null;
  const { data: tasks = [], error } = useBoard({ enabled: isSignedIn });

  useEffect(() => onUserChange(setEmail), []);

  // サインイン状態が変わると認証ヘッダーが変わるため、ボードを再取得する。
  const refreshBoard = (): void => {
    void queryClient.invalidateQueries({ queryKey: BOARD_QUERY_KEY });
  };
  useEffect(refreshBoard, [email]); // eslint-disable-line react-hooks/exhaustive-deps

  const message = authError ?? (error instanceof Error ? error.message : null);

  return (
    <main className="app">
      <header className="app__header">
        <div className="app__brand">
          <h1 className="app__title">HANDOFF</h1>
          <p className="app__subtitle">人間とAIの共同タスクボード</p>
        </div>
        <div className="app__auth">
          {isSignedIn && (
            <button type="button" onClick={() => setShowCreate(true)}>
              新規タスク
            </button>
          )}
          {email ? (
            <>
              <span className="app__user">{email}</span>
              <button type="button" onClick={() => void signOutUser()}>
                サインアウト
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={!isAuthConfigured()}
              onClick={() =>
                void signInWithGoogle().catch((e: unknown) =>
                  setAuthError(e instanceof Error ? e.message : String(e)),
                )
              }
            >
              Google でサインイン
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
        <Board tasks={tasks} onTransitioned={refreshBoard} onArchived={refreshBoard} />
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
  );
}
