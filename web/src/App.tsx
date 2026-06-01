import { useEffect, useState } from 'react';
import type { Task } from '@handoff/shared';
import { fetchBoard } from './api-client';
import { Board } from './components/Board';

// #01 は初回取得のみ。10〜15秒ポーリングは #08 で TanStack Query により追加する。
export function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBoard()
      .then((loaded) => {
        setTasks(loaded);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  // レーンの骨格は常に表示し、取得エラーは非ブロッキングのバナーで知らせる。
  return (
    <main className="app">
      <header className="app__header">
        <h1 className="app__title">HANDOFF</h1>
        <p className="app__subtitle">人間とAIの共同タスクボード</p>
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
