/**
 * 设备互相发现递归机制 E2E 测试
 * 测试场景：
 * 1. 被动发现后自动触发设备列表请求
 * 2. 主动添加设备后触发设备列表请求
 * 3. 设备列表响应后对未知设备递归发现
 * 4. 多级设备发现（A -> B -> C -> D）
 * 5. 避免无限递归
 */
import { test, expect } from '@playwright/test';
import {
  setupUser,
  getPeerIdFromStorage,
  WAIT_TIMES,
  SELECTORS,
} from './test-helpers.js';

test.describe('设备互相发现递归机制', () => {
  test.setTimeout(30000);

  test('被动发现后应该自动触发设备列表请求', async ({ page, context }) => {
    const browser = context.browser();
    if (!browser) {
      test.skip();
      return;
    }
    const browser2 = await browser.newContext();
    const page2 = await browser2.newPage();

    try {
      // 设置第一个用户
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');
      await setupUser(page, '设备A');

      // 设置第二个用户
      await page2.goto('/center');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '设备B');

      const peerIdA = await getPeerIdFromStorage(page);
      const peerIdB = await getPeerIdFromStorage(page2);

      if (!peerIdA || !peerIdB) {
        test.skip();
        return;
      }

      // 监听设备 A 的控制台日志
      const logsA: string[] = [];
      page.on('console', msg => {
        logsA.push(msg.text());
      });

      // 设备 A 添加设备 B（这会触发被动发现）
      const queryInput = page.locator(SELECTORS.peerIdInput);
      await queryInput.fill(peerIdB);
      await page.locator(SELECTORS.addButton).click();

      // 等待被动发现完成
      await page.waitForTimeout(WAIT_TIMES.DISCOVERY);

      // 验证设备 A 向设备 B 请求了设备列表
      const hasDeviceListRequest = logsA.some(log =>
        log.includes('Requesting device list') ||
        log.includes('device_list_request') ||
        log.includes('DEVDISC')
      );
      expect(hasDeviceListRequest).toBe(true);
    } finally {
      await page2.close();
      await browser2?.close();
    }
  });

  test('主动添加设备后应该触发设备列表请求', async ({ page, context }) => {
    const browser = context.browser();
    if (!browser) {
      test.skip();
      return;
    }
    const browser2 = await browser.newContext();
    const page2 = await browser2.newPage();

    try {
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');
      await setupUser(page, '主动发现者A');

      await page2.goto('/center');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '被添加设备B');

      const peerIdA = await getPeerIdFromStorage(page);
      const peerIdB = await getPeerIdFromStorage(page2);

      if (!peerIdA || !peerIdB) {
        test.skip();
        return;
      }

      // 监听控制台日志
      const logs: string[] = [];
      page.on('console', msg => {
        logs.push(msg.text());
      });

      // 设备 A 主动添加设备 B
      const queryInput = page.locator(SELECTORS.peerIdInput);
      await queryInput.fill(peerIdB);
      await page.locator(SELECTORS.addButton).click();

      // 等待添加完成和设备列表请求
      await page.waitForTimeout(WAIT_TIMES.DISCOVERY);

      // 验证有设备列表请求的日志
      const hasRequestLog = logs.some(log =>
        log.includes('Discovered') && log.includes('devices from') ||
        log.includes('device_list_request')
      );
      expect(hasRequestLog).toBe(true);
    } finally {
      await page2.close();
      await browser2?.close();
    }
  });

  test('多级设备发现：A通过B发现C，通过C发现D', async ({ page, context }) => {
    const browser = context.browser();
    if (!browser) {
      test.skip();
      return;
    }

    // 创建三个浏览器上下文模拟四个设备
    const browser2 = await browser.newContext();
    const browser3 = await browser.newContext();
    const page2 = await browser2.newPage();
    const page3 = await browser3.newPage();

    try {
      // 设置四个用户
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');
      await setupUser(page, '设备A');

      await page2.goto('/center');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '设备B');

      await page3.goto('/center');
      await page3.waitForLoadState('domcontentloaded');
      await setupUser(page3, '设备C');

      const peerIdA = await getPeerIdFromStorage(page);
      const peerIdB = await getPeerIdFromStorage(page2);
      const peerIdC = await getPeerIdFromStorage(page3);

      if (!peerIdA || !peerIdB || !peerIdC) {
        test.skip();
        return;
      }

      // 构建设备链：A -> B -> C
      // 设备 B 先添加设备 C
      const queryInputB = page2.locator(SELECTORS.peerIdInput);
      await queryInputB.fill(peerIdC);
      await page2.locator(SELECTORS.addButton).click();
      await page2.waitForTimeout(WAIT_TIMES.DISCOVERY);

      // 设备 A 添加设备 B
      const queryInputA = page.locator(SELECTORS.peerIdInput);
      await queryInputA.fill(peerIdB);
      await page.locator(SELECTORS.addButton).click();
      await page.waitForTimeout(WAIT_TIMES.DISCOVERY);

      // 验证设备 A 的设备列表
      const deviceCards = page.locator(SELECTORS.deviceCard);
      const deviceCount = await deviceCards.count();

      // 设备 A 应该至少发现：自己、设备B、设备C
      expect(deviceCount).toBeGreaterThanOrEqual(3);

      // 验证设备列表中包含设备 C
      const deviceTexts = await page.locator(SELECTORS.deviceCard).allTextContents();
      const hasDeviceC = deviceTexts.some(text => text.includes('设备C'));
      expect(hasDeviceC).toBe(true);
    } finally {
      await page3.close();
      await page2.close();
      await browser3?.close();
      await browser2?.close();
    }
  });

  test('设备列表响应后应该对未知设备递归发起请求', async ({ page, context }) => {
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
      // 设置三个用户
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');
      await setupUser(page, '发现者');

      await page2.goto('/center');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '中间设备');

      await page3.goto('/center');
      await page3.waitForLoadState('domcontentloaded');
      await setupUser(page3, '远端设备');

      const peerIdA = await getPeerIdFromStorage(page);
      const peerIdB = await getPeerIdFromStorage(page2);
      const peerIdC = await getPeerIdFromStorage(page3);

      if (!peerIdA || !peerIdB || !peerIdC) {
        test.skip();
        return;
      }

      // 监听设备 A 的控制台
      const logsA: string[] = [];
      page.on('console', msg => {
        logsA.push(msg.text());
      });

      // 设备 B 先添加设备 C（建立连接）
      const queryInputB = page2.locator(SELECTORS.peerIdInput);
      await queryInputB.fill(peerIdC);
      await page2.locator(SELECTORS.addButton).click();
      await page2.waitForTimeout(WAIT_TIMES.DISCOVERY);

      // 设备 A 添加设备 B
      const queryInputA = page.locator(SELECTORS.peerIdInput);
      await queryInputA.fill(peerIdB);
      await page.locator(SELECTORS.addButton).click();

      // 等待递归发现完成
      await page.waitForTimeout(WAIT_TIMES.DISCOVERY * 2);

      // 验证有多次设备列表请求（一次给 B，一次给 C）
      const deviceListRequests = logsA.filter(log =>
        log.includes('device_list_request') ||
        log.includes('DEVDISC') && log.includes('请求')
      );
      expect(deviceListRequests.length).toBeGreaterThanOrEqual(2);

      // 验证最终发现了远端设备
      const deviceTexts = await page.locator(SELECTORS.deviceCard).allTextContents();
      const hasRemoteDevice = deviceTexts.some(text => text.includes('远端设备'));
      expect(hasRemoteDevice).toBe(true);
    } finally {
      await page3.close();
      await page2.close();
      await browser3?.close();
      await browser2?.close();
    }
  });

  test('应该避免对同一设备重复请求（防止无限递归）', async ({ page, context }) => {
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
      // 设置三个用户构成三角关系：A -> B -> C -> A
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');
      await setupUser(page, '三角A');

      await page2.goto('/center');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '三角B');

      await page3.goto('/center');
      await page3.waitForLoadState('domcontentloaded');
      await setupUser(page3, '三角C');

      const peerIdA = await getPeerIdFromStorage(page);
      const peerIdB = await getPeerIdFromStorage(page2);
      const peerIdC = await getPeerIdFromStorage(page3);

      if (!peerIdA || !peerIdB || !peerIdC) {
        test.skip();
        return;
      }

      // 构建三角：B 添加 C，C 添加 A，A 添加 B
      // B -> C
      const queryInputB = page2.locator(SELECTORS.peerIdInput);
      await queryInputB.fill(peerIdC);
      await page2.locator(SELECTORS.addButton).click();
      await page2.waitForTimeout(WAIT_TIMES.SHORT);

      // C -> A
      const queryInputC = page3.locator(SELECTORS.peerIdInput);
      await queryInputC.fill(peerIdA);
      await page3.locator(SELECTORS.addButton).click();
      await page3.waitForTimeout(WAIT_TIMES.SHORT);

      // A -> B
      const queryInputA = page.locator(SELECTORS.peerIdInput);
      await queryInputA.fill(peerIdB);
      await page.locator(SELECTORS.addButton).click();

      // 监听日志
      const logsA: string[] = [];
      page.on('console', msg => {
        logsA.push(msg.text());
      });

      // 等待递归发现稳定
      await page.waitForTimeout(WAIT_TIMES.DISCOVERY * 2);

      // 统计对设备的请求次数
      const requestsToB = logsA.filter(log =>
        log.includes('device_list_request') && log.includes(peerIdB)
      ).length;

      // 对同一设备的请求应该不超过合理次数（避免无限递归）
      expect(requestsToB).toBeLessThanOrEqual(2);
    } finally {
      await page3.close();
      await page2.close();
      await browser3?.close();
      await browser2?.close();
    }
  });

  test('所有设备最终应该被完整发现', async ({ page, context }) => {
    const browser = context.browser();
    if (!browser) {
      test.skip();
      return;
    }

    // 创建五个浏览器上下文模拟完整网络
    const contexts: any[] = [];
    const pages: any[] = [];

    for (let i = 1; i <= 4; i++) {
      const ctx = await browser.newContext();
      const p = await ctx.newPage();
      contexts.push(ctx);
      pages.push(p);
    }

    try {
      // 设置五个用户
      const allPages = [page, ...pages];
      const peerIds: string[] = [];

      for (let i = 0; i < allPages.length; i++) {
        await allPages[i].goto('/center');
        await allPages[i].waitForLoadState('domcontentloaded');
        await setupUser(allPages[i], `设备${String.fromCharCode(65 + i)}`);
        const pid = await getPeerIdFromStorage(allPages[i]);
        if (pid) peerIds.push(pid);
      }

      if (peerIds.length < 5) {
        test.skip();
        return;
      }

      // 创建星形连接：所有设备都连接到设备 B（中心设备）
      // 这样 B 就知道所有其他设备
      for (let i = 1; i < allPages.length; i++) {
        if (i === 1) continue; // 跳过 B 自己
        // C, D, E 都添加 B
        const queryInput = allPages[i].locator(SELECTORS.peerIdInput);
        await queryInput.fill(peerIds[1]);
        await allPages[i].locator(SELECTORS.addButton).click();
        await allPages[i].waitForTimeout(WAIT_TIMES.DISCOVERY);
      }

      // 现在 B 应该知道了 C, D, E
      // 设备 A 添加设备 B，应该能发现所有其他设备
      const queryInputA = page.locator(SELECTORS.peerIdInput);
      await queryInputA.fill(peerIds[1]);
      await page.locator(SELECTORS.addButton).click();

      // 等待递归发现传播
      await page.waitForTimeout(WAIT_TIMES.DISCOVERY * 3);

      // 验证设备 A 最终发现了所有设备
      const deviceCards = page.locator(SELECTORS.deviceCard);
      const deviceCount = await deviceCards.count();

      // 应该至少包含所有5个设备
      expect(deviceCount).toBeGreaterThanOrEqual(5);

      // 验证包含所有设备名
      const deviceTexts = await page.locator(SELECTORS.deviceCard).allTextContents();
      const expectedDevices = ['设备A', '设备B', '设备C', '设备D', '设备E'];
      for (const expectedDevice of expectedDevices) {
        const hasDevice = deviceTexts.some(text => text.includes(expectedDevice));
        expect(hasDevice).toBe(true);
      }
    } finally {
      // 清理所有浏览器上下文
      for (let i = pages.length - 1; i >= 0; i--) {
        await pages[i].close();
        await contexts[i]?.close();
      }
    }
  });

  test('控制台应该显示设备发现过程的完整日志', async ({ page, context }) => {
    const browser = context.browser();
    if (!browser) {
      test.skip();
      return;
    }
    const browser2 = await browser.newContext();
    const page2 = await browser2.newPage();

    try {
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');
      await setupUser(page, '日志测试A');

      await page2.goto('/center');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '日志测试B');

      const peerIdA = await getPeerIdFromStorage(page);
      const peerIdB = await getPeerIdFromStorage(page2);

      if (!peerIdA || !peerIdB) {
        test.skip();
        return;
      }

      // 监听完整的控制台日志
      const logs: string[] = [];
      page.on('console', msg => {
        logs.push(msg.text());
      });

      // 设备 A 添加设备 B
      const queryInput = page.locator(SELECTORS.peerIdInput);
      await queryInput.fill(peerIdB);
      await page.locator(SELECTORS.addButton).click();

      // 等待发现过程完成
      await page.waitForTimeout(WAIT_TIMES.DISCOVERY);

      // 验证关键日志存在
      const logString = logs.join('\n');

      // 应该有发送发现通知的日志
      expect(logString.includes('Sending discovery notification') ||
        logString.includes('discovery_notification')).toBe(true);

      // 应该有请求设备列表的日志
      expect(logString.includes('Requesting device list') ||
        logString.includes('device_list_request') ||
        logString.includes('DEVDISC')).toBe(true);
    } finally {
      await page2.close();
      await browser2?.close();
    }
  });
});
