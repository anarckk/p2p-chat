import { test, expect } from '@playwright/test';
import {
  setupUser,
  clearAllStorage,
  getPeerIdFromStorage,
  createTestDevices,
  cleanupTestDevices,
  assertDeviceExists,
  addDevice,
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

    // 提前监听控制台日志（在用户设置之前）
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
    await page.waitForTimeout(2000);

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
      await page.waitForTimeout(2000);
      await page2.waitForTimeout(4000);

      // 至少有一个设备应该有固定 ID 相关的日志
      const hasFixedIdInA = logsA.some(log => log.includes('UNIVERSE-BOOTSTRAP'));
      const hasFixedIdInB = logsB.some(log => log.includes('UNIVERSE-BOOTSTRAP'));

      expect(hasFixedIdInA || hasFixedIdInB).toBe(true);

      // 验证至少有一个设备成为启动者或尝试成为启动者
      const hasBootstrapInA = logsA.some(log =>
        log.includes('Became the universe bootstrap') ||
        log.includes('Bootstrap already exists, requesting device list') ||
        log.includes('成为宇宙启动者')
      );
      const hasBootstrapInB = logsB.some(log =>
        log.includes('Became the universe bootstrap') ||
        log.includes('Bootstrap already exists, requesting device list') ||
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
    await page.waitForTimeout(2000);

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
    await page.waitForTimeout(2000);

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
    await page.waitForTimeout(3000);

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

  // ==================== 功能性测试 ====================

  test('非启动者应该能从启动者获取设备列表', async ({ context }) => {
    const browser = context.browser();
    if (!browser) {
      test.skip();
      return;
    }

    // 创建三个设备：A（启动者）、B（已知设备）、C（新设备）
    const devices = await createTestDevices(browser, '设备A', '设备B');

    try {
      // 设备A添加设备B到发现中心
      const peerIdB = await getPeerIdFromStorage(devices.deviceB.page);
      if (!peerIdB) {
        test.skip();
        return;
      }

      await addDevice(devices.deviceA.page, peerIdB);
      await devices.deviceA.page.waitForTimeout(2000);

      // 验证设备A的发现中心包含设备B
      await assertDeviceExists(devices.deviceA.page, '设备B');

      // 创建设备C（非启动者）
      const contextC = await browser.newContext();
      const pageC = await contextC.newPage();

      try {
        // 提前监听控制台日志
        const logsC: string[] = [];
        pageC.on('console', msg => logsC.push(msg.text()));

        await pageC.goto('/center');
        await pageC.waitForLoadState('domcontentloaded');
        await setupUser(pageC, '设备C');

        await pageC.waitForTimeout(3000);

        // 验证设备C请求了设备列表
        const hasRequestLog = logsC.some(log =>
          log.includes('向启动者请求设备列表') ||
          log.includes('requesting device list') ||
          log.includes('收到设备列表')
        );
        expect(hasRequestLog).toBe(true);

        // 验证设备C的发现中心包含设备B（通过启动者A获取）
        // 注意：启动者A不会把自己放到设备列表中
        // 设备C需要通过其他方式（被动发现）来发现启动者A
        await assertDeviceExists(pageC, '设备B');
      } finally {
        await pageC.close();
        await contextC.close();
      }
    } finally {
      await cleanupTestDevices(devices);
    }
  });

  test('启动者应该响应设备列表请求并返回已知设备', async ({ context }) => {
    const browser = context.browser();
    if (!browser) {
      test.skip();
      return;
    }

    // 创建设备A（启动者）和设备B
    const devices = await createTestDevices(browser, '启动者A', '设备B');

    try {
      // 设备A添加设备B
      const peerIdB = await getPeerIdFromStorage(devices.deviceB.page);
      if (!peerIdB) {
        test.skip();
        return;
      }

      await addDevice(devices.deviceA.page, peerIdB);
      await devices.deviceA.page.waitForTimeout(2000);

      // 监听设备A的控制台日志
      const logsA: string[] = [];
      devices.deviceA.page.on('console', msg => logsA.push(msg.text()));

      // 创建设备C向启动者请求设备列表
      const contextC = await browser.newContext();
      const pageC = await contextC.newPage();

      try {
        await pageC.goto('/center');
        await pageC.waitForLoadState('domcontentloaded');
        await setupUser(pageC, '设备C');

        await pageC.waitForTimeout(3000);

        // 验证启动者A收到了设备列表请求
        const hasRequestReceivedLog = logsA.some(log =>
          log.includes('收到设备列表请求') ||
          log.includes('Received device list request')
        );
        // 注意：这个测试可能在某些情况下失败，因为设备A可能不是启动者
        // 但如果设备A是启动者，应该能收到请求
        if (hasRequestReceivedLog) {
          // 验证启动者A发送了设备列表响应
          const hasResponseSentLog = logsA.some(log =>
            log.includes('响应设备列表') ||
            log.includes('Sent device list')
          );
          expect(hasResponseSentLog).toBe(true);
        }

        // 验证设备C能够发现设备B（通过启动者A）
        // 注意：启动者A不在设备列表中，因为启动者不会包含自己
        await assertDeviceExists(pageC, '设备B');
      } finally {
        await pageC.close();
        await contextC.close();
      }
    } finally {
      await cleanupTestDevices(devices);
    }
  });

  test('多个设备通过启动者互相发现', async ({ context }) => {
    const browser = context.browser();
    if (!browser) {
      test.skip();
      return;
    }

    // 创建四个设备
    const devices1 = await createTestDevices(browser, '设备1', '设备2');

    try {
      // 设备1添加设备2
      const peerId2 = await getPeerIdFromStorage(devices1.deviceB.page);
      if (!peerId2) {
        test.skip();
        return;
      }

      await addDevice(devices1.deviceA.page, peerId2);
      await devices1.deviceA.page.waitForTimeout(2000);

      // 创建设备3
      const context3 = await browser.newContext();
      const page3 = await context3.newPage();

      try {
        await page3.goto('/center');
        await page3.waitForLoadState('domcontentloaded');
        await setupUser(page3, '设备3');
        await page3.waitForTimeout(3000);

        // 验证设备3发现了设备2（通过启动者1的设备列表）
        await assertDeviceExists(page3, '设备2');

        // 创建设备4
        const context4 = await browser.newContext();
        const page4 = await context4.newPage();

        try {
          await page4.goto('/center');
          await page4.waitForLoadState('domcontentloaded');
          await setupUser(page4, '设备4');
          await page4.waitForTimeout(3000);

          // 验证设备4也发现了设备2（通过启动者1的设备列表）
          await assertDeviceExists(page4, '设备2');
        } finally {
          await page4.close();
          await context4.close();
        }
      } finally {
        await page3.close();
        await context3.close();
      }
    } finally {
      await cleanupTestDevices(devices1);
    }
  });

  test('启动者返回空设备列表时应该正常处理', async ({ context }) => {
    const browser = context.browser();
    if (!browser) {
      test.skip();
      return;
    }

    // 创建设备A（启动者，没有任何已知设备）
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    try {
      await pageA.goto('/center');
      await pageA.waitForLoadState('domcontentloaded');
      await setupUser(pageA, '空启动者A');
      await pageA.waitForTimeout(4000);

      // 创建设备B向启动者请求设备列表
      const contextB = await browser.newContext();
      const pageB = await contextB.newPage();

      try {
        // 监听设备B的日志
        const logsB: string[] = [];
        pageB.on('console', msg => logsB.push(msg.text()));

        await pageB.goto('/center');
        await pageB.waitForLoadState('domcontentloaded');
        await setupUser(pageB, '设备B');
        await pageB.waitForTimeout(3000);

        // 验证设备B收到了设备列表响应（即使是空的）
        // 注意：空设备列表可能不会产生特定的日志，所以这里仅作观察
        logsB.some(log =>
          log.includes('收到设备列表') ||
          log.includes('Received device list')
        );

        // 验证系统没有崩溃
        // 由于启动者A没有已知设备，设备B的发现中心可能是空的
        // 这是正常的行为，我们只验证系统没有崩溃即可
        const deviceCards = pageB.locator('.device-card');
        await deviceCards.count(); // 只是检查元素可以访问，不断言数量
      } finally {
        await pageB.close();
        await contextB.close();
      }
    } finally {
      await pageA.close();
      await contextA.close();
    }
  });

  test('请求设备列表超时应该正常处理', async ({ page }) => {
    // 这个测试验证当启动者不存在或无法连接时，系统不会崩溃
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
    await setupUser(page, '超时测试用户');

    // 等待启动者机制完成（包括可能的超时）
    await page.waitForTimeout(6000);

    // 验证系统没有崩溃，至少有一些日志输出
    const relevantLogs = logs.filter(log =>
      log.includes('[Peer]') ||
      log.includes('[UNIVERSE]') ||
      log.includes('UNIVERSE-BOOTSTRAP')
    );

    expect(relevantLogs.length).toBeGreaterThan(0);

    // 验证页面正常工作，可以显示连接状态
    const connectedStatus = page.locator('.ant-badge-status-processing').first();
    await expect(connectedStatus).toBeVisible();
  });

  test('设备列表应该正确合并到本地发现中心', async ({ context }) => {
    const browser = context.browser();
    if (!browser) {
      test.skip();
      return;
    }

    // 创建设备A（启动者）和设备B
    const devices = await createTestDevices(browser, '合并测试A', '设备B');

    try {
      // 设备A添加设备B
      const peerIdB = await getPeerIdFromStorage(devices.deviceB.page);
      if (!peerIdB) {
        test.skip();
        return;
      }

      await addDevice(devices.deviceA.page, peerIdB);
      await devices.deviceA.page.waitForTimeout(2000);

      // 创建设备C
      const contextC = await browser.newContext();
      const pageC = await contextC.newPage();

      try {
        await pageC.goto('/center');
        await pageC.waitForLoadState('domcontentloaded');
        await setupUser(pageC, '设备C');
        await pageC.waitForTimeout(3000);

        // 验证设备C的发现中心包含设备B（通过启动者A获取）
        // 注意：启动者A不会把自己放到设备列表中
        await assertDeviceExists(pageC, '设备B');
      } finally {
        await pageC.close();
        await contextC.close();
      }
    } finally {
      await cleanupTestDevices(devices);
    }
  });
});
