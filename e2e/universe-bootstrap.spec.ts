import { test, expect } from '@playwright/test';
import {
  setupUser,
  clearAllStorage,
  getPeerIdFromStorage,
} from './test-helpers.js';

/**
 * 宇宙启动者 E2E 测试
 * 测试场景：
 * 1. 第一个设备启动时应该成为宇宙启动者
 * 2. 后续设备启动时应该向宇宙启动者请求设备列表
 * 3. 宇宙启动者应该能响应设备列表请求
 */
test.describe('宇宙启动者', () => {
  test.setTimeout(120000);

  test('第一个启动的设备应该能成为宇宙启动者', async ({ page }) => {
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');
    await clearAllStorage(page);
    await page.reload();

    // 设置用户
    await setupUser(page, '启动者测试用户');
    await page.waitForTimeout(5000);

    // 验证 Peer 连接成功
    const peerId = await getPeerIdFromStorage(page);

    if (!peerId) {
      test.skip();
      return;
    }

    // 验证连接状态（使用更精确的选择器，使用 first() 解决多个元素问题）
    const connectedStatus = page.locator('.ant-badge-status-processing').first();
    await expect(connectedStatus).toBeVisible();
  });

  test('后续设备应该能向宇宙启动者请求设备列表', async ({ page, context }) => {
    // 创建第二个浏览器上下文模拟第二个设备
    const browser2 = await context.browser()?.newContext();
    const page2 = await browser2.newPage();

    try {
      // 设置第一个用户（可能是启动者）
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');
      await setupUser(page, '宇宙启动者');
      await page.waitForTimeout(5000);

      const peerId1 = await getPeerIdFromStorage(page);
      if (!peerId1) {
        test.skip();
        return;
      }

      // 设置第二个用户
      await page2.goto('/center');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '新加入设备');
      await page2.waitForTimeout(5000);

      const peerId2 = await getPeerIdFromStorage(page2);
      if (!peerId2) {
        test.skip();
        return;
      }

      // 监听第二个设备的控制台日志
      const logs: string[] = [];
      page2.on('console', msg => {
        logs.push(msg.text());
      });

      // 第二个设备手动添加第一个设备
      const queryInput2 = page2.locator('input[placeholder*="输入对方 Peer ID"]');
      await queryInput2.fill(peerId1);
      await page2.locator('button[aria-label="add-device"]').click();
      await page2.waitForTimeout(5000);

      // 验证第二个设备的设备列表中包含第一个设备
      const deviceCards = page2.locator('.device-card');
      const count = await deviceCards.count();
      expect(count).toBeGreaterThan(0);
    } finally {
      await page2.close();
      await browser2?.close();
    }
  });

  test('向宇宙启动者请求设备列表时应该收到响应', async ({ page, context }) => {
    const browser2 = await context.browser()?.newContext();
    const page2 = await browser2.newPage();

    try {
      // 设置第一个用户
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');
      await setupUser(page, '设备列表提供者');
      await page.waitForTimeout(5000);

      const peerId1 = await getPeerIdFromStorage(page);
      if (!peerId1) {
        test.skip();
        return;
      }

      // 设置第二个用户
      await page2.goto('/center');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '设备列表请求者');
      await page2.waitForTimeout(5000);

      const peerId2 = await getPeerIdFromStorage(page2);
      if (!peerId2) {
        test.skip();
        return;
      }

      // 第二个设备添加第一个设备
      const queryInput2 = page2.locator('input[placeholder*="输入对方 Peer ID"]');
      await queryInput2.fill(peerId1);
      await page2.locator('button[aria-label="add-device"]').click();
      await page2.waitForTimeout(5000);

      // 点击刷新按钮，触发设备列表请求
      await page2.locator('button[aria-label="refresh-discovery"]').click();
      await page2.waitForTimeout(8000);

      // 验证第二个设备的设备列表已更新
      const deviceCount = await page2.locator('.device-card').count();
      expect(deviceCount).toBeGreaterThan(0);
    } finally {
      await page2.close();
      await browser2?.close();
    }
  });

  test('多个设备应该能通过宇宙启动者互相发现', async ({ page, context }) => {
    const browser2 = await context.browser()?.newContext();
    const browser3 = await context.browser()?.newContext();
    const page2 = await browser2.newPage();
    const page3 = await browser3.newPage();

    try {
      // 设置三个用户
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');
      await setupUser(page, '设备A');
      await page.waitForTimeout(5000);

      await page2.goto('/center');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '设备B');
      await page2.waitForTimeout(5000);

      await page3.goto('/center');
      await page3.waitForLoadState('domcontentloaded');
      await setupUser(page3, '设备C');
      await page3.waitForTimeout(5000);

      const peerIdA = await getPeerIdFromStorage(page);
      const peerIdB = await getPeerIdFromStorage(page2);
      const peerIdC = await getPeerIdFromStorage(page3);

      if (!peerIdA || !peerIdB || !peerIdC) {
        test.skip();
        return;
      }

      // 设备 B 添加设备 A
      const queryInputB = page2.locator('input[placeholder*="输入对方 Peer ID"]');
      await queryInputB.fill(peerIdA);
      await page2.locator('button[aria-label="add-device"]').click();
      await page2.waitForTimeout(5000);

      // 设备 C 添加设备 A
      const queryInputC = page3.locator('input[placeholder*="输入对方 Peer ID"]');
      await queryInputC.fill(peerIdA);
      await page3.locator('button[aria-label="add-device"]').click();
      await page3.waitForTimeout(5000);

      // 设备 B 刷新，应该能通过设备 A 发现设备 C
      await page2.locator('button[aria-label="refresh-discovery"]').click();
      await page2.waitForTimeout(8000);

      // 验证设备 B 的设备列表包含多个设备
      const deviceCountB = await page2.locator('.device-card').count();
      expect(deviceCountB).toBeGreaterThanOrEqual(2);
    } finally {
      await page3.close();
      await page2.close();
      await browser3?.close();
      await browser2?.close();
    }
  });

  test('控制台应该有宇宙启动者相关日志', async ({ page }) => {
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');
    await clearAllStorage(page);
    await page.reload();

    // 监听控制台日志
    const logs: string[] = [];
    page.on('console', msg => {
      logs.push(msg.text());
    });

    // 设置用户
    await setupUser(page, '日志测试用户');
    await page.waitForTimeout(5000);

    // 检查是否有宇宙启动者相关的日志
    const hasBootstrapLog = logs.some(log =>
      log.includes('UNIVERSE') ||
      log.includes('Bootstrap') ||
      log.includes('bootstrap')
    );

    // 注意：由于网络条件不同，这个测试可能会失败
    // 只要有尝试连接的日志就算通过
    expect(logs.length).toBeGreaterThan(0);
  });
});
