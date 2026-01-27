import { test, expect } from '@playwright/test';
import {
  clearAllStorage,
  createUserInfo,
  setUserInfo,
} from './test-helpers.js';

test.describe('WeChat 页面', () => {
  // 基于 PeerJS 5秒内标准，优化超时时间
  test.setTimeout(15000);
  test.beforeEach(async ({ page, context }) => {
    // 使用 context 清除 cookies 和缓存
    await context.clearCookies();
    await context.clearPermissions();

    // 先导航到页面再清理 localStorage
    await page.goto('/wechat');
    // 等待页面加载后再清理存储
    await page.waitForLoadState('domcontentloaded');
    await clearAllStorage(page);
    // 设置用户信息
    await page.evaluate((info) => {
      localStorage.setItem('p2p_user_info', JSON.stringify(info));
    }, createUserInfo('测试用户', 'test-peer-id-12345'));
    // 重新加载页面
    await page.reload();
    // 基于 PeerJS 5秒内标准优化等待时间
    await page.waitForTimeout(1000);
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
    // 优化：从 3000 减少到 800
    await page.waitForTimeout(800);

    // 检查空状态 - 使用更精确的选择器
    const emptyState = page.locator('.empty-contacts');
    await expect(emptyState).toBeVisible();
  });
});
