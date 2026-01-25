import { test, expect } from '@playwright/test';

test.describe('发现中心页面', () => {
  test.beforeEach(async ({ page }) => {
    // 设置默认用户信息
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'test-peer-123',
        }),
      );
    });
    await page.reload();
    await page.waitForTimeout(1500);
  });

  test('应该显示页面内容', async ({ page }) => {
    // 检查页面容器
    await expect(page.locator('.center-container')).toBeVisible();
  });

  test('应该显示发现中心相关元素', async ({ page }) => {
    // 验证页面包含"发现中心"文本
    const pageContent = await page.content();
    expect(pageContent).toContain('发现中心');
  });
});
