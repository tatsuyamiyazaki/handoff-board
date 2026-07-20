import { test, expect } from '@playwright/test';

const LANES = ['To Do', 'In Progress', 'In Review', 'Blocked', 'Done'];

test('本番エントリがサインイン前のシェルを表示する', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'HANDOFF', level: 1 })).toBeVisible();
  await expect(
    page.getByText('サインインすると、あなたが作成したタスクと AI が作成したタスクのボードが表示されます。'),
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

// App 全体の配線の煙テスト: 偽認証でサインイン済みにし、API をスタブして
// 認証状態 → useBoard 取得 → BoardControls/Board 描画の実配線を検証する（ADR-0011 の OR スコープ表示経路）。
test('サインイン済みの App がボードを取得して描画する', async ({ page }) => {
  const task = {
    id: 'e2e-1',
    title: 'レビュー待ちのタスク',
    status: 'in-review',
    owner: 'claude-code',
    priority: 'P2',
    action_type: 'other',
    handoff_note: 'メモ',
    blocked_reason: null,
    tags: [],
    department: 'engineering',
    role: null,
    project: null,
    milestone: null,
    created_by: 'claude-code:dev',
    created_by_type: 'machine',
    review_cycles: 0,
    review_cycle_limit: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    activity: [],
  };
  await page.route('**/api/board', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ success: true, data: [task], error: null }),
    }),
  );

  await page.goto('/e2e/app-harness.html');
  await expect(page.getByText('tester@example.com')).toBeVisible();
  const lane = page.getByRole('region', { name: 'In Review' });
  await expect(lane.getByText('レビュー待ちのタスク')).toBeVisible();
  const reviewStat = page.locator('.stat', { hasText: 'レビュー中' });
  await expect(reviewStat.locator('.stat__value')).toHaveText('1');
});
