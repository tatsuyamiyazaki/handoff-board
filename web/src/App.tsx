import { useEffect, useState } from 'react';
import type { Task } from '@handoff/shared';
import { fetchBoard } from './api-client';
import { Board } from './components/Board';
import { CreateTaskDialog } from './components/CreateTaskDialog';
import {
  isAuthConfigured,
  onUserChange,
  signInWithGoogle,
  signOutUser,
} from './auth/firebase-auth';

// #02 Firebase サインイン、#03 タスク作成ダイアログ。
// 10〜15秒ポーリングは #08 で TanStack Query により追加する。
export function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => onUserChange(setEmail), []);

  useEffect(() => {
    fetchBoard()
      .then((loaded) => {
        setTasks(loaded);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [email]);

  return (
    <main className="app">
      <header className="app__header">
        <div>
          <h1 className="app__title">HANDOFF</h1>
          <p className="app__subtitle">人間とAIの共同タスクボード</p>
        </div>
        <div className="app__auth">
          <button type="button" onClick={() => setShowCreate(true)}>
            新規タスク
          </button>
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
                  setError(e instanceof Error ? e.message : String(e)),
                )
              }
            >
              Google でサインイン
            </button>
          )}
        </div>
      </header>
      {error && (
        <p role="alert" className="app__error">
          {error}
        </p>
      )}
      <Board tasks={tasks} />
      {showCreate && (
        <CreateTaskDialog
          onClose={() => setShowCreate(false)}
          onCreated={(task) => {
            setTasks((prev) => [...prev, task]);
            setShowCreate(false);
          }}
        />
      )}
    </main>
  );
}
