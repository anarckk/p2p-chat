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

  test('我发送的消息时间不应该有蓝色背景', async ({ page }) => {
    // 点击添加聊天按钮
    await page.locator('button[aria-label="plus"]').click();
    await page.waitForTimeout(300);

    // 输入 Peer ID
    const testPeerId = 'peer-test-style-check-' + Date.now();
    await page.locator('input[placeholder*="Peer ID"]').fill(testPeerId);

    // 点击创建按钮
    await page.locator('.ant-modal .ant-btn-primary').click();
    await page.waitForTimeout(500);

    // 输入并发送消息
    await page.locator('input[placeholder="输入消息..."]').fill('测试消息样式');
    await page.locator('button[aria-label="send"]').click();
    await page.waitForTimeout(500);

    // 检查 message-meta 的背景色
    const messageMeta = page.locator('.message-item.is-self .message-meta').first();
    await expect(messageMeta).toBeVisible();

    // 获取背景色
    const backgroundColor = await messageMeta.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    // 背景色应该是 transparent 或 rgba(0, 0, 0, 0)
    // 当前代码会有问题，背景色是 rgb(24, 144, 255) 蓝色
    const isTransparent = backgroundColor === 'transparent' || backgroundColor === 'rgba(0, 0, 0, 0)';
    expect(isTransparent).toBeTruthy();
  });
});
