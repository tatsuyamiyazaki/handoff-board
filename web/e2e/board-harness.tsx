import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Board } from '../src/components/Board';
import '../src/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root が見つかりません');

createRoot(root).render(
  <StrictMode>
    <main className="app">
      <h1 className="app__title">HANDOFF</h1>
      <Board tasks={[]} />
    </main>
  </StrictMode>,
);
