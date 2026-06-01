import { defineConfig, devices } from '@playwright/test';

// E2E は web dev サーバーを起動して検証する。
// chromium 未インストール環境では `pnpm e2e` が失敗するが、設定とテストは残す（#01の方針）。
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5173' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
