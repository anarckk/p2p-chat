import { test, expect } from '@playwright/test';

test.describe('通用应用测试', () => {
  test('应该成功加载应用', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/P2P 聊天/);
  });

  test('应该正确渲染根组件', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#app')).toBeVisible();
  });

  test('应该使用中文本地化', async ({ page }) => {
    await page.goto('/');

    // 验证中文文本
    await expect(page.locator('text=聊天')).toBeVisible();
    await expect(page.locator('text=发现中心')).toBeVisible();
  });

  test('页面应该有正确的样式', async ({ page }) => {
    await page.goto('/');

    // 验证全局样式已加载
    const body = page.locator('body');
    await expect(body).toHaveCSS('margin', '0px');
  });
});
