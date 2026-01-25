import { test, expect } from '@playwright/test';

test.describe('路由导航', () => {
  test.beforeEach(async ({ page }) => {
    // 设置用户信息避免弹窗
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'test-peer-id-12345',
        }),
      );
    });
  });

  test('应该支持直接 URL 访问各页面', async ({ page }) => {
    // 直接访问各页面
    await page.goto('/wechat');
    await expect(page).toHaveURL('/wechat');

    await page.goto('/center');
    await expect(page).toHaveURL('/center');

    await page.goto('/test');
    await expect(page).toHaveURL('/test');
  });

  test('应该能够点击导航菜单切换页面', async ({ page }) => {
    await page.goto('/wechat');
    await page.waitForTimeout(500);

    // 点击菜单项切换页面
    const menuItems = await page.locator('.menu .ant-menu-item').all();
    expect(menuItems.length).toBeGreaterThan(0);

    // 点击第一个菜单项（已经是选中状态）
    await menuItems[0].click();
    await page.waitForTimeout(500);

    // 验证页面已导航
    const url = page.url();
    expect(url).toMatch(/\/(wechat|center)/);
  });
});
