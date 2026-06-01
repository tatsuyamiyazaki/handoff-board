import { useEffect, useState } from 'react';
import type { Task } from '@handoff/shared';
import { fetchBoard } from './api-client';
import { Board } from './components/Board';
import {
  isAuthConfigured,
  onUserChange,
  signInWithGoogle,
  signOutUser,
} from './auth/firebase-auth';

// #02: Firebase Google サインインを追加。ログイン状態が変わるたびにボードを再取得する。
// 10〜15秒ポーリングは #08 で TanStack Query により追加する。
export function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  // ログイン状態を購読（未構成なら即 null 通知）。
  useEffect(() => onUserChange(setEmail), []);

  // 初回 + ログイン状態変化時にボードを取得。
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
              onClick={() => void signInWithGoogle().catch((e: unknown) =>
                setError(e instanceof Error ? e.message : String(e)),
              )}
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
    </main>
  );
}
