import { test, expect } from '@playwright/test';

const LANES = ['To Do', 'In Progress', 'In Review', 'Blocked', 'Done'];

test('本番エントリがサインイン前のシェルを表示する', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'HANDOFF', level: 1 })).toBeVisible();
  await expect(
    page.getByText('サインインすると、あなたが作成したタスクのボードが表示されます。'),
  ).toBeVisible();
});

// Firebase 認証や API から独立した harness で、実コンポーネントと CSS の配置を検証する。
test('カンバンが開き、5つのワークフローレーンが同じ行に見える', async ({ page }) => {
  await page.goto('/e2e/board-harness.html');
  await expect(page.getByRole('heading', { name: 'HANDOFF', level: 1 })).toBeVisible();
  const topCoordinates: number[] = [];
  for (const lane of LANES) {
    const region = page.getByRole('region', { name: lane });
    await expect(region).toBeVisible();
    const box = await region.boundingBox();
    expect(box).not.toBeNull();
    topCoordinates.push(Math.round(box!.y));
  }
  expect(new Set(topCoordinates).size).toBe(1);
});
