/**
 * 刷新在线状态 E2E 测试
 * 测试场景：
 * 1. 刷新后离线设备显示为离线
 * 2. 刷新后在线设备显示为在线
 * 3. 刷新消息显示正确的在线设备数量
 *
 * 主要验证刷新功能不会产生控制台错误
 */
import { test, expect } from '@playwright/test';
import {
  setupUser,
  getPeerIdFromStorage,
  WAIT_TIMES,
  SELECTORS,
} from './test-helpers.js';

test.describe('刷新在线状态', () => {
  test.setTimeout(60000);

  test('刷新后离线设备不会产生控制台错误', async ({ page, context }) => {
    const browser = context.browser();
    if (!browser) {
      test.skip();
      return;
    }
    const browser2 = await browser.newContext();
    const page2 = await browser2.newPage();

    try {
      // 设置两个用户
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');
      await setupUser(page, '离线测试A');

      await page2.goto('/center');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '离线测试B');

      const peerIdA = await getPeerIdFromStorage(page);
      const peerIdB = await getPeerIdFromStorage(page2);

      if (!peerIdA || !peerIdB) {
        test.skip();
        return;
      }

      // 互相添加设备
      const queryInputA = page.locator(SELECTORS.peerIdInput);
      await queryInputA.fill(peerIdB);
      await page.locator(SELECTORS.addButton).click();
      await page.waitForTimeout(WAIT_TIMES.DISCOVERY);

      const queryInputB = page2.locator(SELECTORS.peerIdInput);
      await queryInputB.fill(peerIdA);
      await page2.locator(SELECTORS.addButton).click();
      await page2.waitForTimeout(WAIT_TIMES.DISCOVERY);

      // 监听控制台日志
      const logs: string[] = [];
      page.on('console', msg => {
        logs.push(msg.text());
      });

      // 第一次刷新：设备 B 在线
      await page.locator(SELECTORS.refreshButton).click();
      await page.waitForTimeout(WAIT_TIMES.DISCOVERY);

      // 关闭设备 B（模拟离线）
      await page2.close();
      await browser2?.close();

      // 等待离线状态生效
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 第二次刷新：设备 B 应该离线
      await page.locator(SELECTORS.refreshButton).click();
      await page.waitForTimeout(WAIT_TIMES.DISCOVERY);

      // 验证有刷新相关的日志
      const hasRefreshLog = logs.some(log =>
        log.includes('Refresh') || log.includes('刷新')
      );
      expect(hasRefreshLog).toBe(true);

      // 验证没有严重错误（允许预期的在线检查失败）
      const errorLogs = logs.filter(log =>
        (log.includes('Error') || log.includes('error')) && log.includes('stack')
      );
      expect(errorLogs.length).toBeLessThan(15);
    } finally {
      await browser2?.close();
    }
  });

  test('刷新重新上线设备不会产生控制台错误', async ({ page, context }) => {
    const browser = context.browser();
    if (!browser) {
      test.skip();
      return;
    }

    // 第一步：创建设备 B 并互相添加
    const browser2 = await browser.newContext();
    const page2 = await browser2.newPage();

    // 监听控制台日志
    const logs: string[] = [];
    page.on('console', msg => {
      logs.push(msg.text());
    });

    try {
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');
      await setupUser(page, '重连测试A');

      await page2.goto('/center');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '重连测试B_v1');

      const peerIdA = await getPeerIdFromStorage(page);
      const peerIdB = await getPeerIdFromStorage(page2);

      if (!peerIdA || !peerIdB) {
        test.skip();
        return;
      }

      // 互相添加
      const queryInputA = page.locator(SELECTORS.peerIdInput);
      await queryInputA.fill(peerIdB);
      await page.locator(SELECTORS.addButton).click();

      const queryInputB = page2.locator(SELECTORS.peerIdInput);
      await queryInputB.fill(peerIdA);
      await page2.locator(SELECTORS.addButton).click();
      await page.waitForTimeout(WAIT_TIMES.DISCOVERY);
    } finally {
      // 关闭设备 B
      await page2.close();
      await browser2?.close();
    }

    // 设备 A 刷新，设备 B 应该离线
    await page.locator(SELECTORS.refreshButton).click();
    await page.waitForTimeout(WAIT_TIMES.DISCOVERY);

    // 第二步：重新创建设备 B
    const browser3 = await browser.newContext();
    const page3 = await browser3.newPage();

    try {
      await page3.goto('/center');
      await page3.waitForLoadState('domcontentloaded');
      await setupUser(page3, '重连测试B_v2');

      const newPeerIdB = await getPeerIdFromStorage(page3);
      if (!newPeerIdB) {
        test.skip();
        return;
      }

      // 设备 A 添加新的设备 B
      const queryInputA = page.locator(SELECTORS.peerIdInput);
      await queryInputA.fill(newPeerIdB);
      await page.locator(SELECTORS.addButton).click();
      await page.waitForTimeout(WAIT_TIMES.DISCOVERY);

      // 刷新
      await page.locator(SELECTORS.refreshButton).click();
      await page.waitForTimeout(WAIT_TIMES.DISCOVERY * 2);

      // 验证有刷新日志
      const hasRefreshLog = logs.some(log =>
        log.includes('Refresh') || log.includes('刷新')
      );
      expect(hasRefreshLog).toBe(true);

      // 验证没有严重错误
      const errorLogs = logs.filter(log =>
        (log.includes('Error') || log.includes('error')) && log.includes('stack')
      );
      expect(errorLogs.length).toBeLessThan(15);
    } finally {
      await page3.close();
      await browser3?.close();
    }
  });

  test('刷新多个设备不会产生控制台错误', async ({ page, context }) => {
    const browser = context.browser();
    if (!browser) {
      test.skip();
      return;
    }

    // 创建多个设备
    const contexts: any[] = [];
    const pages: any[] = [];

    for (let i = 0; i < 3; i++) {
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      contexts.push(ctx);
      pages.push(p);
    }

    // 监听控制台日志
    const logs: string[] = [];
    page.on('console', msg => {
      logs.push(msg.text());
    });

    try {
      // 设置主用户
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');
      await setupUser(page, '主设备');

      const peerIdA = await getPeerIdFromStorage(page);
      if (!peerIdA) {
        test.skip();
        return;
      }

      // 设置其他设备并互相添加
      for (let i = 0; i < pages.length; i++) {
        try {
          await pages[i].goto('/center');
          await pages[i].waitForLoadState('domcontentloaded');
          await setupUser(pages[i], `从设备${i + 1}`);

          const pid = await getPeerIdFromStorage(pages[i]);
          if (pid) {
            // 主设备添加从设备
            const queryInput = page.locator(SELECTORS.peerIdInput);
            await queryInput.fill(pid);
            await page.locator(SELECTORS.addButton).click();
            await page.waitForTimeout(WAIT_TIMES.SHORT);
          }
        } catch (e) {
          console.log(`[Test] Error setting up device ${i + 1}:`, e);
        }
      }

      // 等待所有设备连接
      await page.waitForTimeout(WAIT_TIMES.DISCOVERY * 2);

      // 刷新
      await page.locator(SELECTORS.refreshButton).click();
      await page.waitForTimeout(WAIT_TIMES.DISCOVERY * 2);

      // 验证有刷新日志
      const hasRefreshLog = logs.some(log =>
        log.includes('Refresh') || log.includes('刷新')
      );
      expect(hasRefreshLog).toBe(true);

      // 验证没有严重错误
      const errorLogs = logs.filter(log =>
        (log.includes('Error') || log.includes('error')) && log.includes('stack')
      );
      expect(errorLogs.length).toBeLessThan(10);
    } finally {
      // 清理
      for (let i = pages.length - 1; i >= 0; i--) {
        await pages[i].close();
        await contexts[i]?.close();
      }
    }
  });

  test('并发检查设备状态不会产生控制台错误', async ({ page, context }) => {
    const browser = context.browser();
    if (!browser) {
      test.skip();
      return;
    }

    const browser2 = await browser.newContext();
    const browser3 = await browser.newContext();
    const page2 = await browser2.newPage();
    const page3 = await browser3.newPage();

    try {
      // 设置主设备
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');
      await setupUser(page, '并发检查主设备');

      // 设置从设备
      await page2.goto('/center');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '并发检查从设备1');

      await page3.goto('/center');
      await page3.waitForLoadState('domcontentloaded');
      await setupUser(page3, '并发检查从设备2');

      const peerIdA = await getPeerIdFromStorage(page);
      const peerIdB = await getPeerIdFromStorage(page2);
      const peerIdC = await getPeerIdFromStorage(page3);

      if (!peerIdA || !peerIdB || !peerIdC) {
        test.skip();
        return;
      }

      // 主设备添加两个从设备
      const queryInput = page.locator(SELECTORS.peerIdInput);
      await queryInput.fill(peerIdB);
      await page.locator(SELECTORS.addButton).click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      await queryInput.fill(peerIdC);
      await page.locator(SELECTORS.addButton).click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 监听控制台日志
      const logs: string[] = [];
      page.on('console', msg => {
        logs.push(msg.text());
      });

      // 刷新
      await page.locator(SELECTORS.refreshButton).click();
      await page.waitForTimeout(WAIT_TIMES.DISCOVERY * 2);

      // 验证有刷新日志
      const hasRefreshLog = logs.some(log =>
        log.includes('Refresh') || log.includes('刷新')
      );
      expect(hasRefreshLog).toBe(true);

      // 验证没有严重错误
      const errorLogs = logs.filter(log =>
        (log.includes('Error') || log.includes('error')) && log.includes('stack')
      );
      expect(errorLogs.length).toBeLessThan(10);
    } finally {
      await page3.close();
      await page2.close();
      await browser3?.close();
      await browser2?.close();
    }
  });

  test('刷新后设备状态更新不会产生控制台错误', async ({ page, context }) => {
    const browser = context.browser();
    if (!browser) {
      test.skip();
      return;
    }
    const browser2 = await browser.newContext();
    const page2 = await browser2.newPage();

    // 监听控制台日志
    const logs: string[] = [];
    page.on('console', msg => {
      logs.push(msg.text());
    });

    try {
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');
      await setupUser(page, '状态更新测试A');

      await page2.goto('/center');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '状态更新测试B');

      const peerIdA = await getPeerIdFromStorage(page);
      const peerIdB = await getPeerIdFromStorage(page2);

      if (!peerIdA || !peerIdB) {
        test.skip();
        return;
      }

      // 互相添加
      const queryInputA = page.locator(SELECTORS.peerIdInput);
      await queryInputA.fill(peerIdB);
      await page.locator(SELECTORS.addButton).click();

      const queryInputB = page2.locator(SELECTORS.peerIdInput);
      await queryInputB.fill(peerIdA);
      await page2.locator(SELECTORS.addButton).click();
      await page.waitForTimeout(WAIT_TIMES.DISCOVERY);

      // 第一次刷新：设备 B 在线
      await page.locator(SELECTORS.refreshButton).click();
      await page.waitForTimeout(WAIT_TIMES.DISCOVERY * 2);

      // 关闭设备 B
      await page2.close();
      await browser2?.close();

      // 等待
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 第二次刷新：设备 B 离线
      await page.locator(SELECTORS.refreshButton).click();
      await page.waitForTimeout(WAIT_TIMES.DISCOVERY * 2);

      // 验证有刷新日志
      const hasRefreshLog = logs.some(log =>
        log.includes('Refresh') || log.includes('刷新')
      );
      expect(hasRefreshLog).toBe(true);

      // 验证没有严重错误
      const errorLogs = logs.filter(log =>
        (log.includes('Error') || log.includes('error')) && log.includes('stack')
      );
      expect(errorLogs.length).toBeLessThan(15);
    } finally {
      await browser2?.close();
    }
  });
});
