import { test, expect } from '@playwright/test';

const LANES = ['needs-ai', 'needs-human', 'in-progress', 'done', 'blocked'];

// #01 受け入れ条件「ボードが開き5レーンが見える」。
// API 未起動でもレーン骨格は描画されるため、5レーンの存在を検証する。
test('カンバンが開き、5つの status レーンが見える', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'HANDOFF', level: 1 })).toBeVisible();
  for (const status of LANES) {
    await expect(page.getByRole('region', { name: status })).toBeVisible();
  }
});
