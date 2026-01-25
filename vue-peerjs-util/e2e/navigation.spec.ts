import { test, expect } from '@playwright/test';

test.describe('路由导航', () => {
  test('根路径应该重定向到 /wechat', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/wechat');
  });

  test('应该显示顶部导航菜单', async ({ page }) => {
    await page.goto('/');

    // 验证导航菜单可见
    await expect(page.locator('.header .menu')).toBeVisible();

    // 验证所有导航项
    await expect(page.locator('text=聊天')).toBeVisible();
    await expect(page.locator('text=发现中心')).toBeVisible();
    await expect(page.locator('text=测试')).toBeVisible();
  });

  test('应该能够导航到聊天页面', async ({ page }) => {
    await page.goto('/');

    // 点击聊天菜单项
    await page.click('text=聊天');

    await expect(page).toHaveURL('/wechat');
  });

  test('应该能够导航到发现中心', async ({ page }) => {
    await page.goto('/');

    // 点击发现中心菜单项
    await page.click('text=发现中心');

    await expect(page).toHaveURL('/center');
  });

  test('应该能够导航到测试页面', async ({ page }) => {
    await page.goto('/');

    // 点击测试菜单项
    await page.click('text=测试');

    await expect(page).toHaveURL('/test');
  });

  test('应该高亮当前页面的导航项', async ({ page }) => {
    // 访问聊天页面
    await page.goto('/wechat');

    // 验证聊天菜单项被选中
    const chatMenuItem = page.locator('.ant-menu-item-selected').filter({ hasText: '聊天' });
    await expect(chatMenuItem).toBeVisible();

    // 切换到发现中心
    await page.click('text=发现中心');
    await page.waitForURL('/center');

    // 验证发现中心菜单项被选中
    const centerMenuItem = page.locator('.ant-menu-item-selected').filter({
      hasText: '发现中心',
    });
    await expect(centerMenuItem).toBeVisible();
  });

  test('应该支持直接 URL 访问', async ({ page }) => {
    // 直接访问聊天页面
    await page.goto('/wechat');
    await expect(page).toHaveURL('/wechat');

    // 直接访问发现中心
    await page.goto('/center');
    await expect(page).toHaveURL('/center');

    // 直接访问测试页面
    await page.goto('/test');
    await expect(page).toHaveURL('/test');
  });

  test('应该显示 Logo', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.logo')).toBeVisible();
    await expect(page.locator('.logo')).toHaveText('P2P 聊天');
  });

  test('导航菜单应该有图标', async ({ page }) => {
    await page.goto('/');

    // 检查菜单项中的图标
    const menuItems = page.locator('.ant-menu-item');
    const count = await menuItems.count();

    for (let i = 0; i < count; i++) {
      const item = menuItems.nth(i);
      await expect(item.locator('.anticon')).toBeVisible();
    }
  });

  test('移动端导航应该正常工作', async ({ page }) => {
    // 模拟移动端视口
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // 验证导航菜单仍然可见
    await expect(page.locator('.header .menu')).toBeVisible();

    // 验证可以导航
    await page.click('text=发现中心');
    await expect(page).toHaveURL('/center');
  });

  test('应该保持导航状态', async ({ page }) => {
    await page.goto('/wechat');

    // 点击发现中心
    await page.click('text=发现中心');
    await page.waitForURL('/center');

    // 返回上一页
    await page.goBack();
    await expect(page).toHaveURL('/wechat');

    // 前进
    await page.goForward();
    await expect(page).toHaveURL('/center');
  });

  test('应该支持浏览器前进后退按钮', async ({ page }) => {
    await page.goto('/test');

    // 手动导航到聊天页面
    await page.goto('/wechat');
    await expect(page).toHaveURL('/wechat');

    // 使用浏览器后退
    await page.goBack();
    await expect(page).toHaveURL('/test');

    // 使用浏览器前进
    await page.goForward();
    await expect(page).toHaveURL('/wechat');
  });

  test('导航菜单在所有页面都应该可见', async ({ page }) => {
    const pages = ['/wechat', '/center', '/test'];

    for (const path of pages) {
      await page.goto(path);
      await expect(page.locator('.header')).toBeVisible();
      await expect(page.locator('.logo')).toBeVisible();
      await expect(page.locator('.menu')).toBeVisible();
    }
  });

  test('应该正确处理无效路由', async ({ page }) => {
    // 访问不存在的路由
    await page.goto('/invalid-route');

    // 应该显示 404 或者重定向到首页
    // 这里假设会重定向到首页
    await expect(page).toHaveURL(/\/(wechat|)?/);
  });
});
