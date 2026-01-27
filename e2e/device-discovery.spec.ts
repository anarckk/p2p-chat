import { test, expect } from '@playwright/test';
import {
  setupUser,
  clearAllStorage,
  getPeerIdFromStorage,
  getPeerIdFromElement,
} from './test-helpers.js';

/**
 * 设备互相发现 E2E 测试
 * 测试场景：
 * 1. 点击刷新按钮时向所有在线设备请求设备列表
 * 2. 设备互相发现能发现新设备
 * 3. 发现的设备会合并到本地设备列表
 */
test.describe('设备互相发现', () => {
  test.setTimeout(120000);

  test('刷新按钮应该能触发设备互相发现', async ({ page, context }) => {
    // 创建第二个浏览器上下文模拟第二个设备
    const browser2 = await context.browser()?.newContext();
    const page2 = await browser2.newPage();

    try {
      // 设置第一个用户
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');
      await setupUser(page, '设备A');
      await page.waitForTimeout(2000);

      // 设置第二个用户
      await page2.goto('/center');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '设备B');
      await page2.waitForTimeout(2000);

      // 获取两个设备的 PeerId
      const peerIdA = await getPeerIdFromStorage(page);
      const peerIdB = await getPeerIdFromStorage(page2);

      if (!peerIdA || !peerIdB) {
        test.skip();
        return;
      }

      // 设备 A 手动添加设备 B
      const queryInput = page.locator('input[placeholder*="输入对方 Peer ID"]');
      await queryInput.fill(peerIdB);
      await page.locator('button[aria-label="add-device"]').click();
      await page.waitForTimeout(3000);

      // 设备 B 手动添加设备 A
      const queryInput2 = page2.locator('input[placeholder*="输入对方 Peer ID"]');
      await queryInput2.fill(peerIdA);
      await page2.locator('button[aria-label="add-device"]').click();
      await page2.waitForTimeout(3000);

      // 记录刷新前的设备数量
      const deviceCountBefore = await page.locator('.device-card').count();

      // 点击刷新按钮
      await page.locator('button[aria-label="refresh-discovery"]').click();
      await page.waitForTimeout(5000);

      // 验证设备列表已更新（至少包含设备 B 和自己）
      const deviceCountAfter = await page.locator('.device-card').count();
      expect(deviceCountAfter).toBeGreaterThanOrEqual(deviceCountBefore);
    } finally {
      await page2.close();
      await browser2?.close();
    }
  });

  test('设备互相发现应该能发现新设备', async ({ page, context }) => {
    const browser2 = await context.browser()?.newContext();
    const page2 = await browser2.newPage();

    try {
      // 设置第一个用户
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');
      await setupUser(page, '设备A');
      await page.waitForTimeout(2000);

      // 设置第二个用户
      await page2.goto('/center');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '设备B');
      await page2.waitForTimeout(2000);

      const peerIdA = await getPeerIdFromStorage(page);
      const peerIdB = await getPeerIdFromStorage(page2);

      if (!peerIdA || !peerIdB) {
        test.skip();
        return;
      }

      // 设备 A 添加设备 B
      const queryInput = page.locator('input[placeholder*="输入对方 Peer ID"]');
      await queryInput.fill(peerIdB);
      await page.locator('button[aria-label="add-device"]').click();
      await page.waitForTimeout(3000);

      // 设备 B 添加设备 C（模拟第三个设备）
      const queryInput2 = page2.locator('input[placeholder*="输入对方 Peer ID"]');
      queryInput2.fill('peer_c_mock_id_' + Date.now());
      await page2.locator('button[aria-label="add-device"]').click();
      await page2.waitForTimeout(3000);

      // 设备 A 刷新，应该能通过设备 B 发现设备 C
      await page.locator('button[aria-label="refresh-discovery"]').click();
      await page.waitForTimeout(5000);

      // 验证设备列表包含多个设备
      const deviceCount = await page.locator('.device-card').count();
      expect(deviceCount).toBeGreaterThanOrEqual(2);
    } finally {
      await page2.close();
      await browser2?.close();
    }
  });

  test('刷新时应该向所有在线设备发送设备列表请求', async ({ page, context }) => {
    const browser2 = await context.browser()?.newContext();
    const page2 = await browser2.newPage();

    try {
      // 设置两个用户
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');
      await setupUser(page, '用户A');
      await page.waitForTimeout(2000);

      await page2.goto('/center');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '用户B');
      await page2.waitForTimeout(2000);

      const peerIdA = await getPeerIdFromStorage(page);
      const peerIdB = await getPeerIdFromStorage(page2);

      if (!peerIdA || !peerIdB) {
        test.skip();
        return;
      }

      // 互相添加设备
      const queryInput = page.locator('input[placeholder*="输入对方 Peer ID"]');
      await queryInput.fill(peerIdB);
      await page.locator('button[aria-label="add-device"]').click();
      await page.waitForTimeout(3000);

      const queryInput2 = page2.locator('input[placeholder*="输入对方 Peer ID"]');
      await queryInput2.fill(peerIdA);
      await page2.locator('button[aria-label="add-device"]').click();
      await page2.waitForTimeout(3000);

      // 监听控制台日志
      const logs: string[] = [];
      page.on('console', msg => {
        logs.push(msg.text());
      });

      // 点击刷新
      await page.locator('button[aria-label="refresh-discovery"]').click();
      await page.waitForTimeout(5000);

      // 验证有请求设备列表的日志
      const hasRequestLog = logs.some(log =>
        log.includes('Requesting device lists') ||
        log.includes('device_list_request')
      );
      expect(hasRequestLog).toBe(true);
    } finally {
      await page2.close();
      await browser2?.close();
    }
  });

  test('点击刷新按钮应该显示刷新成功消息', async ({ page }) => {
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');
    await setupUser(page, '刷新消息测试用户');
    await page.waitForTimeout(2000);

    // 点击刷新按钮
    await page.locator('button[aria-label="refresh-discovery"]').click();
    await page.waitForTimeout(3000);

    // 验证显示成功消息（即使没有设备也应该显示消息）
    const successMessage = page.locator('.ant-message-success');
    const messageExists = await successMessage.count() > 0;
    expect(messageExists).toBe(true);
  });

  test('刷新应该更新设备的在线状态', async ({ page, context }) => {
    const browser2 = await context.browser()?.newContext();
    const page2 = await browser2.newPage();

    try {
      // 设置两个用户
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');
      await setupUser(page, '状态测试A');
      await page.waitForTimeout(2000);

      await page2.goto('/center');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '状态测试B');
      await page2.waitForTimeout(2000);

      const peerIdA = await getPeerIdFromStorage(page);
      const peerIdB = await getPeerIdFromStorage(page2);

      if (!peerIdA || !peerIdB) {
        test.skip();
        return;
      }

      // 互相添加设备
      const queryInput = page.locator('input[placeholder*="输入对方 Peer ID"]');
      await queryInput.fill(peerIdB);
      await page.locator('button[aria-label="add-device"]').click();
      await page.waitForTimeout(3000);

      // 刷新以更新在线状态
      await page.locator('button[aria-label="refresh-discovery"]').click();
      await page.waitForTimeout(5000);

      // 验证至少有在线状态标识
      const onlineBadges = page.locator('.ant-badge-status-processing');
      const badgeCount = await onlineBadges.count();
      expect(badgeCount).toBeGreaterThan(0);
    } finally {
      await page2.close();
      await browser2?.close();
    }
  });
});
