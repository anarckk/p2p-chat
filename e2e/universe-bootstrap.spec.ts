import { test, expect } from '@playwright/test';
import {
  setupUser,
  clearAllStorage,
  getPeerIdFromStorage,
} from './test-helpers.js';

/**
 * 宇宙启动者 E2E 测试
 *
 * 宇宙启动者机制的核心特征：
 * - 使用固定的 PeerId: UNIVERSE-BOOTSTRAP-PEER-ID-001
 * - 第一个注册该 ID 的设备成为启动者
 * - 其他设备检测到已有启动者时，向启动者请求设备列表
 *
 * 测试场景：
 * 1. 验证设备尝试使用固定 ID 成为启动者
 * 2. 验证多个设备场景下的启动者选举行为
 * 3. 验证固定 ID 相关的控制台日志
 */
test.describe('宇宙启动者', () => {
  test.setTimeout(120000);

  test('第一个设备应该尝试使用固定 ID 成为启动者', async ({ page }) => {
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
    await setupUser(page, '启动者测试用户');

    // 等待 Peer 连接成功
    const peerId = await getPeerIdFromStorage(page);
    if (!peerId) {
      test.skip();
      return;
    }

    // 验证连接状态
    const connectedStatus = page.locator('.ant-badge-status-processing').first();
    await expect(connectedStatus).toBeVisible();

    // 等待 tryBecomeBootstrap 完成
    await page.waitForTimeout(4000);

    // 验证关键日志：应该包含固定 ID 相关的信息
    const hasFixedIdLog = logs.some(log =>
      log.includes('UNIVERSE-BOOTSTRAP-PEER-ID-001')
    );
    expect(hasFixedIdLog).toBe(true);

    // 验证启动者成功日志
    const hasBootstrapSuccessLog = logs.some(log =>
      log.includes('Became the universe bootstrap') ||
      log.includes('成为宇宙启动者')
    );
    expect(hasBootstrapSuccessLog).toBe(true);
  });

  test('多设备场景下应该有设备成功成为启动者', async ({ page, context }) => {
    const browser2 = await context.browser()?.newContext();
    if (!browser2) {
      test.skip();
      return;
    }
    const page2 = await browser2.newPage();

    try {
      // 提前监听控制台日志（在页面加载之前）
      const logsA: string[] = [];
      const logsB: string[] = [];
      page.on('console', msg => logsA.push(msg.text()));
      page2.on('console', msg => logsB.push(msg.text()));

      // 两个设备几乎同时启动
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');
      await setupUser(page, '设备A');

      await page2.goto('/center');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '设备B');

      const peerIdA = await getPeerIdFromStorage(page);
      const peerIdB = await getPeerIdFromStorage(page2);

      if (!peerIdA || !peerIdB) {
        test.skip();
        return;
      }

      // 等待启动者机制完成
      await page.waitForTimeout(4000);
      await page2.waitForTimeout(4000);

      // 至少有一个设备应该有固定 ID 相关的日志
      const hasFixedIdInA = logsA.some(log => log.includes('UNIVERSE-BOOTSTRAP'));
      const hasFixedIdInB = logsB.some(log => log.includes('UNIVERSE-BOOTSTRAP'));

      expect(hasFixedIdInA || hasFixedIdInB).toBe(true);

      // 验证至少有一个设备成为启动者或尝试成为启动者
      const hasBootstrapInA = logsA.some(log =>
        log.includes('Became the universe bootstrap') ||
        log.includes('Bootstrap already exists') ||
        log.includes('成为宇宙启动者')
      );
      const hasBootstrapInB = logsB.some(log =>
        log.includes('Became the universe bootstrap') ||
        log.includes('Bootstrap already exists') ||
        log.includes('成为宇宙启动者')
      );

      expect(hasBootstrapInA || hasBootstrapInB).toBe(true);
    } finally {
      await page2.close();
      await browser2?.close();
    }
  });

  test('固定 ID 相关日志应该在启动时输出', async ({ page }) => {
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

    // 等待启动者机制完成
    await page.waitForTimeout(4000);

    // 验证固定 ID 相关的日志存在
    const relevantLogs = logs.filter(log =>
      log.includes('UNIVERSE-BOOTSTRAP') ||
      log.includes('Became the universe bootstrap') ||
      log.includes('[Peer-Bootstrap]') ||
      log.includes('成为宇宙启动者')
    );

    expect(relevantLogs.length).toBeGreaterThan(0);

    // 验证日志内容中包含固定 ID
    const hasFixedIdInLogs = relevantLogs.some(log =>
      log.includes('UNIVERSE-BOOTSTRAP-PEER-ID-001')
    );
    expect(hasFixedIdInLogs).toBe(true);
  });

  test('启动者应该监听设备列表请求（通过日志验证）', async ({ page }) => {
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
    await setupUser(page, '启动者功能测试');

    // 等待启动者机制完成
    await page.waitForTimeout(4000);

    // 验证启动者监听日志
    const hasListeningLog = logs.some(log =>
      log.includes('[Peer-Bootstrap] Listening for device list requests')
    );

    if (hasListeningLog) {
      // 如果成功成为启动者，应该有监听日志
      expect(hasListeningLog).toBe(true);
    } else {
      // 如果未能成为启动者（已有其他启动者），应该有请求日志
      const hasRequestLog = logs.some(log =>
        log.includes('requesting device list') ||
        log.includes('向启动者请求设备列表')
      );
      expect(hasRequestLog).toBe(true);
    }
  });

  test('控制台应该有宇宙启动者协议相关的完整日志', async ({ page }) => {
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
    await setupUser(page, '完整日志测试');

    // 等待启动者机制完成
    await page.waitForTimeout(5000);

    // 收集所有宇宙启动者相关的日志
    const universeLogs = logs.filter(log =>
      log.includes('[Peer]') ||
      log.includes('[Peer-Bootstrap]') ||
      log.includes('[UNIVERSE]') ||
      log.includes('UNIVERSE-BOOTSTRAP')
    );

    // 验证至少有一些宇宙启动者相关的日志
    expect(universeLogs.length).toBeGreaterThan(0);

    // 验证日志中包含固定 ID
    const hasFixedId = universeLogs.some(log =>
      log.includes('UNIVERSE-BOOTSTRAP-PEER-ID-001')
    );
    expect(hasFixedId).toBe(true);
  });
});
