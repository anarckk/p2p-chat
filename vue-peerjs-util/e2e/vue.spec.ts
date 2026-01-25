import { test, expect } from '@playwright/test';

test.describe('通用应用测试', () => {
  test('应该成功加载应用', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/P2P 聊天/);
    await expect(page.locator('#app')).toBeVisible();
  });

  test('应该显示顶部导航和 Logo', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(500);

    // 验证 Logo
    await expect(page.locator('.logo')).toContainText('P2P 聊天');

    // 验证导航菜单可见
    await expect(page.locator('.menu')).toBeVisible();
  });
});
