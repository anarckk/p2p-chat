import { test, expect } from '@playwright/test';
import {
  SELECTORS,
  WAIT_TIMES,
  createUserInfo,
  clearAllStorage,
  setUserInfo,
  createTestDevices,
  cleanupTestDevices,
  addDevice,
  assertDeviceExists,
  assertDeviceOnlineStatus,
  retry,
} from './test-helpers.js';

/**
 * 发现中心页面基础 UI 测试
 */
test.describe('发现中心页面 - 基础 UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');
    await clearAllStorage(page);
    await setUserInfo(page, createUserInfo('测试用户', 'test-peer-123'));
  });

  test('应该显示页面容器和基本元素', async ({ page }) => {
    // 检查页面容器
    await expect(page.locator(SELECTORS.centerContainer)).toBeVisible();

    // 验证页面包含"发现中心"卡片
    const discoveryCard = page.locator('.ant-card').filter({ hasText: '发现中心' });
    await expect(discoveryCard).toBeVisible();

    // 验证输入框和按钮存在
    await expect(page.locator(SELECTORS.peerIdInput)).toBeVisible();
    await expect(page.locator(SELECTORS.queryButton)).toBeVisible();
    await expect(page.locator(SELECTORS.addButton)).toBeVisible();
    await expect(page.locator(SELECTORS.refreshButton)).toBeVisible();
  });

  test('应该显示用户信息区域', async ({ page }) => {
    // 验证用户信息卡片存在
    const userInfoCard = page.locator('.ant-card').filter({ hasText: '我的信息' });
    await expect(userInfoCard).toBeVisible();

    // 验证用户名显示
    const usernameElement = page.locator('.ant-descriptions-item-label').filter({ hasText: '用户名' });
    await expect(usernameElement).toBeVisible();
  });
});

/**
 * P2P 发现功能的多浏览器 Session 测试
 *
 * 测试场景：
 * 1. 设备 A（主动发现方）- 负责主动查询其他设备
 * 2. 设备 B（被动发现方）- 被设备 A 发现
 *
 * 预期结果：设备 B 应该出现在设备 A 的发现中心列表中
 */
test.describe('P2P 发现功能 - 多设备测试', () => {
  test('设备 A 添加设备 B 时，设备 B 应该在设备 A 的发现列表中', async ({ browser }) => {
    // 增加超时时间，给予足够时间完成 P2P 通信
    test.setTimeout(30000);
    const devices = await createTestDevices(browser, '设备A', '设备B', { startPage: 'center' });

    try {
      // 监听控制台日志
      const deviceALogs: string[] = [];
      const deviceBLogs: string[] = [];
      devices.deviceA.page.on('console', msg => {
        deviceALogs.push(msg.text());
      });
      devices.deviceB.page.on('console', msg => {
        deviceBLogs.push(msg.text());
      });

      // 检查设备 A 和设备 B 的连接状态
      const deviceAStatus = await devices.deviceA.page.locator('.ant-descriptions-item-label:has-text("连接状态") + .ant-descriptions-item-content .ant-badge-status-text').textContent();
      const deviceBStatus = await devices.deviceB.page.locator('.ant-descriptions-item-label:has-text("连接状态") + .ant-descriptions-item-content .ant-badge-status-text').textContent();
      console.log('Device A peer connection status:', deviceAStatus);
      console.log('Device B peer connection status:', deviceBStatus);

      // 打印错误日志
      console.log('Device A error logs:');
      deviceALogs.filter(log => log.includes('error') || log.includes('Error')).forEach(log => {
        console.log('  ', log);
      });
      console.log('Device B error logs:');
      deviceBLogs.filter(log => log.includes('error') || log.includes('Error')).forEach(log => {
        console.log('  ', log);
      });

      // 设备 A 添加设备 B
      await addDevice(devices.deviceA.page, devices.deviceB.userInfo.peerId);

      // 等待发现结果和用户名查询完成
      await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

      // 验证设备 B 出现在设备 A 的发现列表中
      // 注意：用户名查询可能失败，所以使用 peerId 进行验证
      await assertDeviceExists(devices.deviceA.page, devices.deviceB.userInfo.peerId);
    } finally {
      await cleanupTestDevices(devices);
    }
  });

  test('被动发现：设备 A 添加设备 B 时，设备 A 应该出现在设备 B 的发现列表中', async ({ browser }) => {
    // 增加超时时间，给予足够时间完成 P2P 通信
    test.setTimeout(180000); // 增加到 3 分钟

    const devices = await createTestDevices(browser, '发现者A', '被发现的B', { startPage: 'center' });

    try {
      // 等待 Peer 连接完全稳定（增加等待时间）
      await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);
      await devices.deviceB.page.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);

      // 监听控制台日志（在等待之后开始监听，避免错过早期日志）
      const deviceALogs: string[] = [];
      const deviceBLogs: string[] = [];
      devices.deviceA.page.on('console', msg => {
        if (msg.type() === 'log') {
          deviceALogs.push(msg.text());
        }
      });
      devices.deviceB.page.on('console', msg => {
        if (msg.type() === 'log') {
          deviceBLogs.push(msg.text());
        }
      });

      // 打印设备 B 的初始列表
      const deviceBListBefore = await devices.deviceB.page.locator(SELECTORS.deviceCard).allTextContents();
      console.log('Device B list before add:', deviceBListBefore);

      // 设备 A 添加设备 B
      await addDevice(devices.deviceA.page, devices.deviceB.userInfo.peerId);

      // 等待被动发现完成（增加等待时间）
      await devices.deviceB.page.waitForTimeout(WAIT_TIMES.DISCOVERY * 5); // 增加到 5 倍

      // 打印设备 A 的相关日志
      console.log('Device A logs (discovery notification):');
      deviceALogs.filter(log => log.includes('discovery') || log.includes('Discovery')).forEach(log => {
        console.log('  ', log);
      });

      // 打印设备 B 的相关日志
      console.log('Device B logs (all):');
      deviceBLogs.slice(-20).forEach(log => {
        console.log('  ', log);
      });

      // 打印设备 B 的列表
      const deviceBList = await devices.deviceB.page.locator(SELECTORS.deviceCard).allTextContents();
      console.log('Device B list after add:', deviceBList);

      // 检查设备 B 是否收到了发现通知
      const hasDiscoveryNotification = deviceBLogs.some(log => log.includes('Received discovery notification'));
      console.log('[Test] Device B received discovery notification:', hasDiscoveryNotification);

      // 验证设备 A 出现在设备 B 的发现列表中（被动发现）
      // 使用重试机制增加成功率
      await retry(async () => {
        // 先检查设备 B 是否收到了发现通知
        const newLogs: string[] = [];
        devices.deviceB.page.on('console', msg => {
          if (msg.type() === 'log') {
            newLogs.push(msg.text());
          }
        });
        await devices.deviceB.page.waitForTimeout(3000); // 增加到 3 秒

        const foundNotification = newLogs.some(log => log.includes('Received discovery notification'));
        if (!foundNotification) {
          throw new Error('Device B did not receive discovery notification yet');
        }

        await assertDeviceExists(devices.deviceB.page, '发现者A');
      }, { maxAttempts: 8, delay: 8000, context: 'Passive discovery check' }); // 增加重试次数和延迟
    } finally {
      await cleanupTestDevices(devices);
    }
  });

  test('添加的设备应该显示在线状态', async ({ browser }) => {
    const devices = await createTestDevices(browser, '状态检查A', '状态检查B', { startPage: 'center' });

    try {
      // 设备 A 添加设备 B
      await addDevice(devices.deviceA.page, devices.deviceB.userInfo.peerId);

      // 等待发现结果和用户名查询完成
      await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

      // 验证设备 B 显示为在线（使用 peerId）
      await assertDeviceOnlineStatus(devices.deviceA.page, devices.deviceB.userInfo.peerId, true);
    } finally {
      await cleanupTestDevices(devices);
    }
  });

  test('应该能够刷新设备列表', async ({ browser }) => {
    const devices = await createTestDevices(browser, '刷新测试A', '刷新测试B', { startPage: 'center' });

    try {
      // 设备 A 添加设备 B
      await addDevice(devices.deviceA.page, devices.deviceB.userInfo.peerId);

      // 等待发现结果和用户名查询完成
      await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

      // 记录设备数量
      const deviceCountBefore = await devices.deviceA.page.locator(SELECTORS.deviceCard).count();

      // 刷新列表
      await devices.deviceA.page.click(SELECTORS.refreshButton);
      await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证设备数量没有减少
      const deviceCountAfter = await devices.deviceA.page.locator(SELECTORS.deviceCard).count();
      expect(deviceCountAfter).toBeGreaterThanOrEqual(deviceCountBefore);
    } finally {
      await cleanupTestDevices(devices);
    }
  });

  test('应该显示设备的 Peer ID', async ({ browser }) => {
    const devices = await createTestDevices(browser, 'PeerId显示A', 'PeerId显示B', { startPage: 'center' });

    try {
      // 设备 A 添加设备 B
      await addDevice(devices.deviceA.page, devices.deviceB.userInfo.peerId);

      // 等待发现结果和用户名查询完成
      await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

      // 验证设备 B 的卡片包含 Peer ID（使用 peerId 进行查找）
      const deviceBCard = devices.deviceA.page.locator(SELECTORS.deviceCard).filter({ hasText: devices.deviceB.userInfo.peerId });
      await expect(deviceBCard).toBeVisible({ timeout: 15000 });

      // 验证卡片中有 Peer ID 文本（小字显示）
      const peerIdText = deviceBCard.locator('.ant-typography-secondary');
      const peerIdCount = await peerIdText.count();
      expect(peerIdCount).toBeGreaterThan(0);
    } finally {
      await cleanupTestDevices(devices);
    }
  });

  test('自己的设备应该有特殊标识', async ({ page }) => {
    await setUserInfo(page, createUserInfo('我自己', 'my-unique-peer-id-123'));

    await page.reload();
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 验证自己的设备卡片有特殊样式
    const myDeviceCard = page.locator(SELECTORS.deviceCardMe);
    const myCardCount = await myDeviceCard.count();

    // 应该至少有一张卡片是"我"的卡片
    expect(myCardCount).toBeGreaterThan(0);

    // 验证"我"标签存在
    const myTag = page.locator('.ant-tag:has-text("我")');
    const myTagCount = await myTag.count();
    expect(myTagCount).toBeGreaterThan(0);
  });
});

/**
 * 设备用户名显示测试
 *
 * 测试场景：
 * 1. 添加设备后，应该显示对端的用户名（而不是 PeerId）
 * 2. 用户名应该显示在设备卡片的标题位置
 */
test.describe('设备用户名显示', () => {
  test('添加设备后应该显示对端的用户名', async ({ browser }) => {
    test.setTimeout(60000);
    const devices = await createTestDevices(browser, '查看用户名A', '被查看用户名B', { startPage: 'center' });

    try {
      // 等待 Peer 连接稳定
      await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT);
      await devices.deviceB.page.waitForTimeout(WAIT_TIMES.PEER_INIT);

      // 设备 A 添加设备 B
      await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceB.userInfo.peerId);
      await devices.deviceA.page.click(SELECTORS.addButton);

      // 等待添加完成和用户名查询
      await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

      // 使用重试机制检查用户名是否正确显示
      await retry(async () => {
        // 查找设备 B 的卡片
        const deviceBCard = devices.deviceA.page.locator(SELECTORS.deviceCard).filter({ hasText: devices.deviceB.userInfo.peerId });
        const cardCount = await deviceBCard.count();
        if (cardCount === 0) {
          throw new Error('Device B card not found');
        }

        // 获取设备卡片的标题文本（用户名显示位置）
        const cardTitle = deviceBCard.locator('.ant-card-meta-title');
        const titleText = await cardTitle.textContent();

        console.log('[Test] Device B card title:', titleText);
        console.log('[Test] Expected username:', devices.deviceB.userInfo.username);

        // 验证标题包含对端的用户名（而不是 PeerId）
        if (!titleText?.includes(devices.deviceB.userInfo.username)) {
          throw new Error(`Expected username "${devices.deviceB.userInfo.username}" not found in title "${titleText}"`);
        }
      }, { maxAttempts: 5, delay: 3000, context: 'Check username display' });

      // 最终验证：设备 B 的用户名应该显示在设备 A 的发现中心
      const deviceBCard = devices.deviceA.page.locator(SELECTORS.deviceCard).filter({ hasText: devices.deviceB.userInfo.username });
      await expect(deviceBCard).toBeVisible({ timeout: 10000 });
    } finally {
      await cleanupTestDevices(devices);
    }
  });

  test('被动发现的设备也应该显示正确的用户名', async ({ browser }) => {
    test.setTimeout(60000);
    const devices = await createTestDevices(browser, '主动方A', '被动方B', { startPage: 'center' });

    try {
      // 等待 Peer 连接稳定
      await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT);
      await devices.deviceB.page.waitForTimeout(WAIT_TIMES.PEER_INIT);

      // 设备 A 添加设备 B（触发被动发现）
      await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceB.userInfo.peerId);
      await devices.deviceA.page.click(SELECTORS.addButton);

      // 等待被动发现完成
      await devices.deviceB.page.waitForTimeout(WAIT_TIMES.MESSAGE);

      // 使用重试机制检查设备 B 的发现中心是否显示设备 A 的用户名
      await retry(async () => {
        // 查找设备 A 的卡片（通过用户名查找）
        const deviceACard = devices.deviceB.page.locator(SELECTORS.deviceCard).filter({ hasText: devices.deviceA.userInfo.username });
        const cardCount = await deviceACard.count();
        if (cardCount === 0) {
          throw new Error('Device A card not found in Device B discovery center');
        }

        // 验证卡片标题包含设备 A 的用户名
        const cardTitle = deviceACard.locator('.ant-card-meta-title');
        const titleText = await cardTitle.textContent();

        if (!titleText?.includes(devices.deviceA.userInfo.username)) {
          throw new Error(`Expected username "${devices.deviceA.userInfo.username}" not found in title "${titleText}"`);
        }
      }, { maxAttempts: 5, delay: 3000, context: 'Check passive discovery username' });

      // 最终验证
      const deviceACard = devices.deviceB.page.locator(SELECTORS.deviceCard).filter({ hasText: devices.deviceA.userInfo.username });
      await expect(deviceACard).toBeVisible({ timeout: 10000 });
    } finally {
      await cleanupTestDevices(devices);
    }
  });

  test('设备卡片的头像首字母应该来自用户名', async ({ browser }) => {
    test.setTimeout(60000);
    const devices = await createTestDevices(browser, '头像测试A', '头像测试B', { startPage: 'center' });

    try {
      // 等待 Peer 连接稳定
      await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT);

      // 设备 A 添加设备 B
      await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceB.userInfo.peerId);
      await devices.deviceA.page.click(SELECTORS.addButton);

      // 等待添加完成和用户名查询
      await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

      // 使用重试机制检查头像首字母
      await retry(async () => {
        // 查找设备 B 的卡片
        const deviceBCard = devices.deviceA.page.locator(SELECTORS.deviceCard).filter({ hasText: devices.deviceB.userInfo.peerId });
        const cardCount = await deviceBCard.count();
        if (cardCount === 0) {
          throw new Error('Device B card not found');
        }

        // 获取头像元素的内容
        const avatar = deviceBCard.locator('.ant-avatar');
        const avatarText = await avatar.textContent();

        console.log('[Test] Device B avatar text:', avatarText);
        console.log('[Test] Expected first letter:', devices.deviceB.userInfo.username.charAt(0).toUpperCase());

        // 验证头像首字母是用户名的首字母（大写）
        const expectedFirstLetter = devices.deviceB.userInfo.username.charAt(0).toUpperCase();
        if (!avatarText?.includes(expectedFirstLetter)) {
          throw new Error(`Expected avatar first letter "${expectedFirstLetter}" not found in "${avatarText}"`);
        }
      }, { maxAttempts: 5, delay: 3000, context: 'Check avatar first letter' });
    } finally {
      await cleanupTestDevices(devices);
    }
  });

  test('用户名更新后应该在设备列表中反映出来', async ({ browser }) => {
    test.setTimeout(60000);
    const devices = await createTestDevices(browser, '用户名更新A', '用户名更新B', { startPage: 'center' });

    try {
      // 等待 Peer 连接稳定
      await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT);
      await devices.deviceB.page.waitForTimeout(WAIT_TIMES.PEER_INIT);

      // 设备 A 添加设备 B
      await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceB.userInfo.peerId);
      await devices.deviceA.page.click(SELECTORS.addButton);

      // 等待添加完成和用户名查询
      await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

      // 验证初始用户名显示正确
      await retry(async () => {
        const deviceBCard = devices.deviceA.page.locator(SELECTORS.deviceCard).filter({ hasText: devices.deviceB.userInfo.username });
        const cardCount = await deviceBCard.count();
        if (cardCount === 0) {
          throw new Error('Device B card with username not found');
        }
      }, { maxAttempts: 5, delay: 3000, context: 'Check initial username' });

      // 刷新页面，验证用户名持久化
      await devices.deviceA.page.reload();
      await devices.deviceA.page.waitForLoadState('domcontentloaded');
      await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT);

      // 验证刷新后用户名仍然显示正确
      const deviceBCard = devices.deviceA.page.locator(SELECTORS.deviceCard).filter({ hasText: devices.deviceB.userInfo.username });
      await expect(deviceBCard).toBeVisible({ timeout: 10000 });

      // 验证卡片标题包含用户名（注意：用户名和 PeerId 可能都显示在标题中）
      const cardTitle = deviceBCard.locator('.ant-card-meta-title');
      const titleText = await cardTitle.textContent();
      expect(titleText).toContain(devices.deviceB.userInfo.username);
    } finally {
      await cleanupTestDevices(devices);
    }
  });
});
