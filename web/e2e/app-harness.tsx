// App 全体の配線（認証状態 → useBoard 取得 → BoardControls/Board 描画）を e2e で検証するハーネス。
// 認証だけ偽装し（即サインイン）、API は spec 側の page.route でスタブする。
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App, type AppAuth } from '../src/App';
import '../src/styles.css';

/** 即座にサインイン済みになる偽認証。Firebase を介さず App の配線だけを検証する。 */
const fakeAuth: AppAuth = {
  isConfigured: () => true,
  onUserChange: (callback) => {
    callback('tester@example.com');
    return () => {};
  },
  signIn: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
};

const root = document.getElementById('root');
if (!root) throw new Error('#root が見つかりません');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <App auth={fakeAuth} />
    </QueryClientProvider>
  </StrictMode>,
);
