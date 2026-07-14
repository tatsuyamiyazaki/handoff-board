import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { setApiBase } from './api-client';
import { desktopBridge } from './desktop/bridge';
import './styles.css';

// デスクトップ版は描画前に設定を読み、API ベース URL を注入する。
async function bootstrap(): Promise<void> {
  const bridge = desktopBridge();
  if (bridge) {
    const settings = await bridge.getSettings();
    setApiBase(settings.apiBaseUrl);
  }

  const rootEl = document.getElementById('root');
  if (!rootEl) throw new Error('#root not found');

  const queryClient = new QueryClient();

  createRoot(rootEl).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void bootstrap();
