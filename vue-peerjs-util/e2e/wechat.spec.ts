import { test, expect } from '@playwright/test';

test.describe('WeChat 页面', () => {
  test.beforeEach(async ({ page }) => {
    // 设置默认用户信息，避免弹窗干扰
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
    await page.reload();
    await page.waitForTimeout(1500);
  });

  test('应该显示页面布局', async ({ page }) => {
    // 检查页面容器
    await expect(page.locator('.wechat-container')).toBeVisible();
  });

  test('应该显示空联系人状态', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.removeItem('p2p_contacts');
    });
    await page.reload();
    await page.waitForTimeout(1000);

    // 检查空状态 - 可能是 empty-contacts 或相关的空状态文本
    const pageContent = await page.content();
    const hasEmptyState = pageContent.includes('暂无聊天') || pageContent.includes('点击 + 号');
    expect(hasEmptyState).toBe(true);
  });
});
