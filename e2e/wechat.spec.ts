import { test, expect } from '@playwright/test';
import {
  WAIT_TIMES,
  clearAllStorage,
  createUserInfo,
  setUserInfo,
} from './test-helpers.js';

test.describe('WeChat 页面', () => {
  test.beforeEach(async ({ page }) => {
    // 设置默认用户信息，避免弹窗干扰
    await page.goto('/wechat');
    await clearAllStorage(page);
    await setUserInfo(page, createUserInfo('测试用户', 'test-peer-id-12345'));
    await page.reload();
    await page.waitForTimeout(WAIT_TIMES.LONG);
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
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 检查空状态 - 可能是 empty-contacts 或相关的空状态文本
    const pageContent = await page.content();
    const hasEmptyState = pageContent.includes('暂无聊天') || pageContent.includes('点击 + 号');
    expect(hasEmptyState).toBe(true);
  });
});
