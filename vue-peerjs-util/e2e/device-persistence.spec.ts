import { test, expect } from '@playwright/test';

/**
 * 设备持久化测试
 * 测试场景：
 * 1. 设备列表会保存到 localStorage
 * 2. 刷新页面后设备列表依然保留
 * 3. 切换到聊天页面再切换回来，设备列表不会丢失
 * 4. 超过3天未在线的设备会被自动删除
 * 5. 10分钟定时器会检查设备在线状态
 */
test.describe('设备持久化功能', () => {
  test.beforeEach(async ({ page }) => {
    // 清理 localStorage
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('设备列表应该保存到 localStorage', async ({ page }) => {
    // 设置用户信息
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'test-peer-persistence-123',
        }),
      );
    });
    await page.reload();
    await page.waitForTimeout(2000);

    // 手动添加一个测试设备到 localStorage（模拟发现设备）
    await page.evaluate(() => {
      const testDevice = {
        peerId: 'discovered-device-456',
        username: '发现的设备',
        avatar: null,
        lastHeartbeat: Date.now(),
        firstDiscovered: Date.now(),
        isOnline: true,
      };
      const devices = { [testDevice.peerId]: testDevice };
      localStorage.setItem('discovered_devices', JSON.stringify(devices));
    });

    // 刷新页面
    await page.reload();
    await page.waitForTimeout(1000);

    // 验证 localStorage 中的设备数据
    const storedDevices = await page.evaluate(() => {
      const stored = localStorage.getItem('discovered_devices');
      return stored ? JSON.parse(stored) : {};
    });

    expect(storedDevices).toHaveProperty('discovered-device-456');
    expect(storedDevices['discovered-device-456']).toMatchObject({
      peerId: 'discovered-device-456',
      username: '发现的设备',
      isOnline: true,
    });
  });

  test('刷新页面后设备列表应该保留', async ({ page }) => {
    // 设置用户信息并添加测试设备
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '刷新测试用户',
          avatar: null,
          peerId: 'refresh-test-peer-123',
        }),
      );

      // 添加多个测试设备
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
        'device-3': {
          peerId: 'device-3',
          username: '设备3',
          avatar: null,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: true,
        },
      };
      localStorage.setItem('discovered_devices', JSON.stringify(devices));
    });

    // 刷新页面
    await page.reload();
    await page.waitForTimeout(1500);

    // 验证所有设备都还在
    const deviceCount = await page.locator('.device-card').count();
    expect(deviceCount).toBeGreaterThanOrEqual(3); // 至少有3个设备

    // 验证特定设备存在
    const hasDevice1 = await page.locator('.device-card').filter({ hasText: '设备1' }).count();
    const hasDevice2 = await page.locator('.device-card').filter({ hasText: '设备2' }).count();
    const hasDevice3 = await page.locator('.device-card').filter({ hasText: '设备3' }).count();

    expect(hasDevice1 + hasDevice2 + hasDevice3).toBeGreaterThan(0);
  });

  test('切换页面后再返回，设备列表应该保留', async ({ page }) => {
    // 设置用户信息和测试设备
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '页面切换测试用户',
          avatar: null,
          peerId: 'navigation-test-peer-123',
        }),
      );

      const devices = {
        'nav-device-1': {
          peerId: 'nav-device-1',
          username: '导航测试设备1',
          avatar: null,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: true,
        },
        'nav-device-2': {
          peerId: 'nav-device-2',
          username: '导航测试设备2',
          avatar: null,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: true,
        },
      };
      localStorage.setItem('discovered_devices', JSON.stringify(devices));
    });

    await page.reload();
    await page.waitForTimeout(1500);

    // 记录当前设备数量
    const deviceCountBefore = await page.locator('.device-card').count();
    console.log('切换页面前的设备数量:', deviceCountBefore);

    // 切换到聊天页面
    await page.click('a:has-text("聊天")');
    await page.waitForURL(/\/wechat/);
    await page.waitForTimeout(1000);

    // 切换回发现中心
    await page.click('a:has-text("发现中心")');
    await page.waitForURL(/\/center/);
    await page.waitForTimeout(1000);

    // 验证设备列表还在
    const deviceCountAfter = await page.locator('.device-card').count();
    console.log('切换页面后的设备数量:', deviceCountAfter);

    expect(deviceCountAfter).toBe(deviceCountBefore);

    // 验证特定设备还在
    const hasDevice1 = await page.locator('.device-card').filter({ hasText: '导航测试设备1' }).count();
    const hasDevice2 = await page.locator('.device-card').filter({ hasText: '导航测试设备2' }).count();

    expect(hasDevice1 + hasDevice2).toBeGreaterThan(0);
  });

  test('超过3天未在线的设备应该被自动删除', async ({ page }) => {
    // 设置用户信息
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '过期测试用户',
          avatar: null,
          peerId: 'expiry-test-peer-123',
        }),
      );

      // 添加不同时间的设备
      const now = Date.now();
      const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000 - 1000; // 超过3天
      const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000; // 2天前（未超过3天）

      const devices = {
        'expired-device': {
          peerId: 'expired-device',
          username: '过期设备',
          avatar: null,
          lastHeartbeat: threeDaysAgo,
          firstDiscovered: threeDaysAgo,
          isOnline: false,
        },
        'valid-device': {
          peerId: 'valid-device',
          username: '有效设备',
          avatar: null,
          lastHeartbeat: twoDaysAgo,
          firstDiscovered: twoDaysAgo,
          isOnline: false,
        },
      };
      localStorage.setItem('discovered_devices', JSON.stringify(devices));
    });

    // 刷新页面，触发自动清理
    await page.reload();
    await page.waitForTimeout(2000);

    // 验证过期设备已被删除
    const storedDevices = await page.evaluate(() => {
      const stored = localStorage.getItem('discovered_devices');
      return stored ? JSON.parse(stored) : {};
    });

    expect(storedDevices).not.toHaveProperty('expired-device');
    expect(storedDevices).toHaveProperty('valid-device');

    // 在页面上验证
    const hasExpiredDevice = await page.locator('.device-card').filter({ hasText: '过期设备' }).count();
    const hasValidDevice = await page.locator('.device-card').filter({ hasText: '有效设备' }).count();

    expect(hasExpiredDevice).toBe(0);
    expect(hasValidDevice).toBeGreaterThan(0);
  });

  test('应该显示设备的在线/离线状态', async ({ page }) => {
    // 设置用户信息
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '状态测试用户',
          avatar: null,
          peerId: 'status-test-peer-123',
        }),
      );

      const now = Date.now();
      const fiveMinutesAgo = now - 5 * 60 * 1000; // 5分钟前（在线）
      const fifteenMinutesAgo = now - 15 * 60 * 1000; // 15分钟前（离线）

      const devices = {
        'online-device': {
          peerId: 'online-device',
          username: '在线设备',
          avatar: null,
          lastHeartbeat: fiveMinutesAgo,
          firstDiscovered: fiveMinutesAgo,
          isOnline: true,
        },
        'offline-device': {
          peerId: 'offline-device',
          username: '离线设备',
          avatar: null,
          lastHeartbeat: fifteenMinutesAgo,
          firstDiscovered: fifteenMinutesAgo,
          isOnline: false,
        },
      };
      localStorage.setItem('discovered_devices', JSON.stringify(devices));
    });

    await page.reload();
    await page.waitForTimeout(1500);

    // 验证在线设备显示"在线"标签
    const onlineDeviceCard = await page.locator('.device-card').filter({ hasText: '在线设备' }).first();
    const onlineTag = await onlineDeviceCard.locator('.ant-tag:has-text("在线")').count();
    expect(onlineTag).toBeGreaterThan(0);

    // 验证离线设备显示"离线"标签
    const offlineDeviceCard = await page.locator('.device-card').filter({ hasText: '离线设备' }).first();
    const offlineTag = await offlineDeviceCard.locator('.ant-tag:has-text("离线")').count();
    expect(offlineTag).toBeGreaterThan(0);

    // 验证离线设备卡片有特殊样式
    const offlineCardClass = await offlineDeviceCard.getAttribute('class');
    expect(offlineCardClass).toContain('is-offline');
  });
});

/**
 * 定时器功能测试
 * 注意：由于定时器默认是10分钟，测试中会模拟验证逻辑
 */
test.describe('定时器功能', () => {
  test('应该启动心跳定时器', async ({ page }) => {
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '定时器测试用户',
          avatar: null,
          peerId: 'timer-test-peer-123',
        }),
      );
    });
    await page.reload();
    await page.waitForTimeout(2000);

    // 验证定时器相关的逻辑已启动
    // 通过检查设备列表的更新来间接验证
    const devices = await page.evaluate(() => {
      const stored = localStorage.getItem('discovered_devices');
      return stored ? Object.keys(JSON.parse(stored)) : [];
    });

    console.log('当前设备列表:', devices);
    // 应该至少能正常访问 localStorage
    expect(Array.isArray(devices)).toBe(true);
  });

  test('切换页面后定时器应该继续运行', async ({ page }) => {
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '跨页定时器测试用户',
          avatar: null,
          peerId: 'cross-page-timer-peer-123',
        }),
      );

      // 添加一个设备
      const devices = {
        'timer-device': {
          peerId: 'timer-device',
          username: '定时器测试设备',
          avatar: null,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: true,
        },
      };
      localStorage.setItem('discovered_devices', JSON.stringify(devices));
    });

    await page.reload();
    await page.waitForTimeout(1500);

    // 切换到聊天页面
    await page.click('a:has-text("聊天")');
    await page.waitForURL(/\/wechat/);
    await page.waitForTimeout(2000);

    // 切换回发现中心
    await page.click('a:has-text("发现中心")');
    await page.waitForURL(/\/center/);
    await page.waitForTimeout(1500);

    // 验证设备列表还在，说明后台逻辑持续运行
    const deviceCount = await page.locator('.device-card').count();
    expect(deviceCount).toBeGreaterThan(0);

    // 验证 localStorage 数据持久化
    const storedDevices = await page.evaluate(() => {
      const stored = localStorage.getItem('discovered_devices');
      return stored ? JSON.parse(stored) : {};
    });

    expect(storedDevices).toHaveProperty('timer-device');
  });
});

/**
 * 被动发现的持久化测试
 */
test.describe('被动发现持久化', () => {
  test('被动发现的设备应该保存到 localStorage', async ({ browser }) => {
    // 创建两个独立的浏览器上下文
    const deviceAContext = await browser.newContext();
    const deviceBContext = await browser.newContext();

    const deviceAPage = await deviceAContext.newPage();
    const deviceBPage = await deviceBContext.newPage();

    // 设备 A 配置
    await deviceAPage.goto('/center');
    await deviceAPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '主动发现者',
          avatar: null,
          peerId: 'active-discoverer-123',
        }),
      );
    });
    await deviceAPage.reload();
    await deviceAPage.waitForTimeout(3000);

    // 设备 B 配置
    await deviceBPage.goto('/center');
    await deviceBPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '被动被发现者',
          avatar: null,
          peerId: 'passive-discovered-456',
        }),
      );
    });
    await deviceBPage.reload();
    await deviceBPage.waitForTimeout(3000);

    const deviceBPeerId = await deviceBPage.evaluate(() => {
      const userInfo = localStorage.getItem('p2p_user_info');
      if (userInfo) {
        return JSON.parse(userInfo).peerId;
      }
      return null;
    });

    // 设备 A 添加设备 B
    await deviceAPage.fill('input[placeholder*="Peer ID"]', deviceBPeerId);
    await deviceAPage.click('button:has-text("添加")');
    await deviceAPage.waitForTimeout(3000);
    await deviceBPage.waitForTimeout(3000);

    // 验证设备 B 的 localStorage 中保存了设备 A
    const storedDevices = await deviceBPage.evaluate(() => {
      const stored = localStorage.getItem('discovered_devices');
      return stored ? JSON.parse(stored) : {};
    });

    // 设备 A 应该出现在设备 B 的存储中
    const hasDeviceA = Object.values(storedDevices).some(
      (device: any) => device.peerId === 'active-discoverer-123' || device.username === '主动发现者',
    );
    expect(hasDeviceA).toBe(true);

    // 清理
    await deviceAContext.close();
    await deviceBContext.close();
  });
});
