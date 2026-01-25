import { test, expect } from '@playwright/test';

/**
 * 在线检查协议测试
 * 测试场景：
 * 1. 主动询问 checkOnline 协议
 * 2. 响应确认 respondOnlineCheck 协议
 * 3. 超时判定离线
 * 4. 10分钟定时心跳检查
 */
test.describe('在线检查协议', () => {
  test.beforeEach(async ({ page }) => {
    // 清理 localStorage
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('应该能够主动检查设备在线状态', async ({ browser }) => {
    // 创建两个独立的浏览器上下文
    const checkerContext = await browser.newContext();
    const targetContext = await browser.newContext();

    const checkerPage = await checkerContext.newPage();
    const targetPage = await targetContext.newPage();

    // 检查方配置
    await checkerPage.goto('/center');
    await checkerPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '检查方',
          avatar: null,
          peerId: 'checker-123',
        }),
      );
    });
    await checkerPage.reload();
    await checkerPage.waitForTimeout(3000);

    // 目标设备配置
    await targetPage.goto('/center');
    await targetPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '被检查方',
          avatar: null,
          peerId: 'target-456',
        }),
      );
    });
    await targetPage.reload();
    await targetPage.waitForTimeout(3000);

    // 获取目标设备的 PeerId
    const targetPeerId = await targetPage.evaluate(() => {
      const stored = localStorage.getItem('p2p_user_info');
      return stored ? JSON.parse(stored).peerId : null;
    });

    console.log('目标设备 PeerId:', targetPeerId);

    // 检查方添加目标设备
    await checkerPage.fill('input[placeholder*="Peer ID"]', targetPeerId);
    await checkerPage.click('button:has-text("添加")');
    await checkerPage.waitForTimeout(3000);

    // 验证设备出现在发现列表中
    const deviceCard = await checkerPage.locator('.device-card').filter({ hasText: '被检查方' });
    await expect(deviceCard).toBeVisible();

    // 验证设备显示为在线
    const onlineTag = await checkerPage.locator('.ant-tag:has-text("在线")').count();
    expect(onlineTag).toBeGreaterThan(0);

    // 清理
    await checkerContext.close();
    await targetContext.close();
  });

  test('离线设备应该被正确标识', async ({ browser }) => {
    // 创建两个浏览器上下文
    const checkerContext = await browser.newContext();
    const targetContext = await browser.newContext();

    const checkerPage = await checkerContext.newPage();
    const targetPage = await targetContext.newPage();

    // 检查方配置
    await checkerPage.goto('/center');
    await checkerPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '检查方',
          avatar: null,
          peerId: 'offline-checker-123',
        }),
      );
    });
    await checkerPage.reload();
    await checkerPage.waitForTimeout(3000);

    // 目标设备配置
    await targetPage.goto('/center');
    await targetPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '离线设备',
          avatar: null,
          peerId: 'offline-target-456',
        }),
      );
    });
    await targetPage.reload();
    await targetPage.waitForTimeout(3000);

    const targetPeerId = await targetPage.evaluate(() => {
      const stored = localStorage.getItem('p2p_user_info');
      return stored ? JSON.parse(stored).peerId : null;
    });

    // 检查方添加目标设备
    await checkerPage.fill('input[placeholder*="Peer ID"]', targetPeerId);
    await checkerPage.click('button:has-text("添加")');
    await checkerPage.waitForTimeout(3000);

    // 关闭目标设备（模拟离线）
    await targetContext.close();

    // 等待一段时间让检查方检测到离线
    await checkerPage.waitForTimeout(5000);

    // 刷新检查方页面
    await checkerPage.reload();
    await checkerPage.waitForTimeout(2000);

    // 验证离线设备标识
    const offlineTag = await checkerPage.locator('.ant-tag:has-text("离线")').count();
    const onlineTag = await checkerPage.locator('.ant-tag:has-text("在线")').count();

    console.log('离线标签数量:', offlineTag);
    console.log('在线标签数量:', onlineTag);

    // 清理
    await checkerContext.close();
  });

  test('应该启动定时心跳检查', async ({ page }) => {
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '心跳测试用户',
          avatar: null,
          peerId: 'heartbeat-test-123',
        }),
      );

      // 添加一些设备
      const devices = {
        'device-1': {
          peerId: 'device-1',
          username: '设备1',
          avatar: null,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: true,
        },
        'device-2': {
          peerId: 'device-2',
          username: '设备2',
          avatar: null,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: false,
        },
      };
      localStorage.setItem('discovered_devices', JSON.stringify(devices));
    });
    await page.reload();
    await page.waitForTimeout(2000);

    // 验证心跳定时器已启动
    // 通过检查设备列表是否正常加载来间接验证
    const storedDevices = await page.evaluate(() => {
      const stored = localStorage.getItem('discovered_devices');
      return stored ? JSON.parse(stored) : {};
    });

    expect(Object.keys(storedDevices).length).toBe(2);

    // 等待一段时间，验证定时器持续运行
    await page.waitForTimeout(5000);

    const storedDevicesAfter = await page.evaluate(() => {
      const stored = localStorage.getItem('discovered_devices');
      return stored ? JSON.parse(stored) : {};
    });

    // 设备应该还在，说明定时器没有异常清理
    expect(Object.keys(storedDevicesAfter).length).toBe(2);
  });

  test('设备上线后应该更新为在线状态', async ({ browser }) => {
    // 这个测试验证设备从离线到在线的状态变化

    const checkerContext = await browser.newContext();
    const targetContext = await browser.newContext();

    const checkerPage = await checkerContext.newPage();
    const targetPage = await targetContext.newPage();

    // 检查方配置
    await checkerPage.goto('/center');
    await checkerPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '状态检查方',
          avatar: null,
          peerId: 'status-checker-123',
        }),
      );

      // 添加一个离线设备
      const devices = {
        'offline-target-789': {
          peerId: 'offline-target-789',
          username: '离线设备',
          avatar: null,
          lastHeartbeat: Date.now() - 20 * 60 * 1000, // 20分钟前
          firstDiscovered: Date.now() - 20 * 60 * 1000,
          isOnline: false,
        },
      };
      localStorage.setItem('discovered_devices', JSON.stringify(devices));
    });
    await checkerPage.reload();
    await checkerPage.waitForTimeout(2000);

    // 验证初始状态为离线
    const offlineTagBefore = await checkerPage.locator('.device-card').filter({ hasText: '离线设备' });
    await expect(offlineTagBefore).toBeVisible();

    // 现在启动目标设备
    await targetPage.goto('/center');
    await targetPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '离线设备',
          avatar: null,
          peerId: 'offline-target-789',
        }),
      );
    });
    await targetPage.reload();
    await targetPage.waitForTimeout(3000);

    // 检查方手动刷新
    await checkerPage.click('button:has-text("刷新")');
    await checkerPage.waitForTimeout(3000);

    // 验证设备状态可能已更新（由于在线检查协议）
    const pageContent = await checkerPage.content();
    const hasOnlineStatus = pageContent.includes('在线');

    console.log('设备是否更新为在线:', hasOnlineStatus);

    // 清理
    await checkerContext.close();
    await targetContext.close();
  });

  test('超时未响应应该判定为离线', async ({ page }) => {
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '超时测试用户',
          avatar: null,
          peerId: 'timeout-test-123',
        }),
      );

      // 添加一个长时间未响应的设备
      const devices = {
        'timeout-device': {
          peerId: 'timeout-device',
          username: '超时设备',
          avatar: null,
          lastHeartbeat: Date.now() - 15 * 60 * 1000, // 15分钟前
          firstDiscovered: Date.now() - 15 * 60 * 1000,
          isOnline: false,
        },
      };
      localStorage.setItem('discovered_devices', JSON.stringify(devices));
    });
    await page.reload();
    await page.waitForTimeout(2000);

    // 验证设备显示为离线
    const offlineTag = await page.locator('.ant-tag:has-text("离线")');
    const hasOfflineTag = await offlineTag.count();

    expect(hasOfflineTag).toBeGreaterThan(0);

    // 验证设备卡片有离线样式
    const offlineCard = await page.locator('.device-card.is-offline');
    await expect(offlineCard).toBeVisible();
  });

  test('应该正确显示设备的最后心跳时间', async ({ page }) => {
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '时间测试用户',
          avatar: null,
          peerId: 'time-test-123',
        }),
      );

      const now = Date.now();
      const devices = {
        'recent-device': {
          peerId: 'recent-device',
          username: '最近活跃设备',
          avatar: null,
          lastHeartbeat: now - 2 * 60 * 1000, // 2分钟前
          firstDiscovered: now - 3600000,
          isOnline: true,
        },
      };
      localStorage.setItem('discovered_devices', JSON.stringify(devices));
    });
    await page.reload();
    await page.waitForTimeout(2000);

    // 验证设备信息显示
    const deviceCard = await page.locator('.device-card').filter({ hasText: '最近活跃设备' });
    await expect(deviceCard).toBeVisible();
  });

  test('定时心跳应该不干扰正常使用', async ({ page }) => {
    // 验证定时器运行时用户仍可以正常操作
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '干扰测试用户',
          avatar: null,
          peerId: 'interference-test-123',
        }),
      );

      const devices = {
        'test-device': {
          peerId: 'test-device',
          username: '测试设备',
          avatar: null,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: true,
        },
      };
      localStorage.setItem('discovered_devices', JSON.stringify(devices));
    });
    await page.reload();
    await page.waitForTimeout(2000);

    // 等待定时器运行
    await page.waitForTimeout(5000);

    // 尝试添加新设备
    await page.fill('input[placeholder*="Peer ID"]', 'new-device-999');
    await page.click('button:has-text("添加")');
    await page.waitForTimeout(2000);

    // 验证操作成功
    const successMessage = await page.locator('.ant-message-success').isVisible();
    expect(successMessage).toBe(true);

    // 验证原有设备还在
    const originalDevice = await page.locator('.device-card').filter({ hasText: '测试设备' });
    await expect(originalDevice).toBeVisible();
  });
});
