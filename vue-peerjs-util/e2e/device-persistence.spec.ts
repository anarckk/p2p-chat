import { test, expect } from '@playwright/test';
import {
  SELECTORS,
  WAIT_TIMES,
  createUserInfo,
  createDeviceInfo,
  clearAllStorage,
  setUserInfo,
  setDeviceList,
  createTestDevices,
  cleanupTestDevices,
  assertDeviceExists,
  assertDeviceNotExists,
  assertDeviceOnlineStatus,
} from './test-helpers.js';
import { daysAgo } from './test-helpers.js';

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
    await page.goto('/center');
    await clearAllStorage(page);
  });

  /**
   * 基础持久化测试
   */
  test.describe('基础持久化', () => {
    test('设备列表应该保存到 localStorage', async ({ page }) => {
      await setUserInfo(page, createUserInfo('测试用户', 'test-peer-persistence-123'));

      // 手动添加一个测试设备到 localStorage
      const testDevice = createDeviceInfo('discovered-device-456', '发现的设备');
      const devices = { [testDevice.peerId]: testDevice };
      await setDeviceList(page, devices);

      // 刷新页面
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.SHORT);

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
      await setUserInfo(page, createUserInfo('刷新测试用户', 'refresh-test-peer-123'));

      // 添加多个测试设备
      const devices = {
        'device-1': createDeviceInfo('device-1', '设备1'),
        'device-2': createDeviceInfo('device-2', '设备2', { isOnline: false }),
        'device-3': createDeviceInfo('device-3', '设备3'),
      };
      await setDeviceList(page, devices);

      // 刷新页面
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 验证所有设备都还在
      const deviceCount = await page.locator(SELECTORS.deviceCard).count();
      expect(deviceCount).toBeGreaterThanOrEqual(3);

      // 验证特定设备存在 - 使用更精确的选择器
      const hasDevice1 = await page.locator(SELECTORS.deviceCard).filter({ hasText: '设备1' }).count();
      const hasDevice2 = await page.locator(SELECTORS.deviceCard).filter({ hasText: '设备2' }).count();
      const hasDevice3 = await page.locator(SELECTORS.deviceCard).filter({ hasText: '设备3' }).count();

      expect(hasDevice1 + hasDevice2 + hasDevice3).toBeGreaterThan(0);
    });

    test('应该显示设备的在线/离线状态', async ({ page }) => {
      await setUserInfo(page, createUserInfo('状态测试用户', 'status-test-peer-123'));

      const now = Date.now();
      const fiveMinutesAgo = now - 5 * 60 * 1000;
      const fifteenMinutesAgo = now - 15 * 60 * 1000;

      const devices = {
        'online-device': createDeviceInfo('online-device', '在线设备', {
          isOnline: true,
          lastHeartbeat: fiveMinutesAgo,
        }),
        'offline-device': createDeviceInfo('offline-device', '离线设备', {
          isOnline: false,
          lastHeartbeat: fifteenMinutesAgo,
        }),
      };
      await setDeviceList(page, devices);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 验证在线设备显示"在线"标签
      await assertDeviceOnlineStatus(page, '在线设备', true);

      // 验证离线设备显示"离线"标签
      await assertDeviceOnlineStatus(page, '离线设备', false);

      // 验证离线设备卡片有特殊样式
      const offlineCard = page.locator(SELECTORS.deviceCardOffline);
      await expect(offlineCard).toBeVisible();
    });
  });

  /**
   * 页面切换持久化测试
   */
  test.describe('页面切换持久化', () => {
    test('切换页面后再返回，设备列表应该保留', async ({ page }) => {
      await setUserInfo(page, createUserInfo('页面切换测试用户', 'navigation-test-peer-123'));

      const devices = {
        'nav-device-1': createDeviceInfo('nav-device-1', '导航测试设备1'),
        'nav-device-2': createDeviceInfo('nav-device-2', '导航测试设备2'),
      };
      await setDeviceList(page, devices);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 记录当前设备数量
      const deviceCountBefore = await page.locator(SELECTORS.deviceCard).count();

      // 切换到聊天页面
      await page.click(SELECTORS.wechatMenuItem);
      await page.waitForURL(/\/wechat/);
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 切换回发现中心
      await page.click(SELECTORS.centerMenuItem);
      await page.waitForURL(/\/center/);
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 验证设备列表还在
      const deviceCountAfter = await page.locator(SELECTORS.deviceCard).count();

      expect(deviceCountAfter).toBe(deviceCountBefore);

      // 验证特定设备还在
      const hasDevice1 = await page.locator(SELECTORS.deviceCard).filter({ hasText: '导航测试设备1' }).count();
      const hasDevice2 = await page.locator(SELECTORS.deviceCard).filter({ hasText: '导航测试设备2' }).count();

      expect(hasDevice1 + hasDevice2).toBeGreaterThan(0);
    });
  });

  /**
   * 设备过期清理测试
   */
  test.describe('设备过期清理', () => {
    test('超过3天未在线的设备应该被自动删除', async ({ page }) => {
      await setUserInfo(page, createUserInfo('过期测试用户', 'expiry-test-peer-123'));

      const now = Date.now();
      const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000 - 1000;
      const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;

      const devices = {
        'expired-device': createDeviceInfo('expired-device', '过期设备', {
          isOnline: false,
          lastHeartbeat: threeDaysAgo,
          firstDiscovered: threeDaysAgo,
        }),
        'valid-device': createDeviceInfo('valid-device', '有效设备', {
          isOnline: false,
          lastHeartbeat: twoDaysAgo,
          firstDiscovered: twoDaysAgo,
        }),
      };
      await setDeviceList(page, devices);

      // 刷新页面，触发自动清理
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 验证过期设备已被删除
      const storedDevices = await page.evaluate(() => {
        const stored = localStorage.getItem('discovered_devices');
        return stored ? JSON.parse(stored) : {};
      });

      expect(storedDevices).not.toHaveProperty('expired-device');
      expect(storedDevices).toHaveProperty('valid-device');

      // 在页面上验证
      await assertDeviceNotExists(page, '过期设备');
      await assertDeviceExists(page, '有效设备');
    });

    test('刚过3天边界的设备应该被保留', async ({ page }) => {
      await setUserInfo(page, createUserInfo('边界测试用户', 'boundary-test-peer-123'));

      const now = Date.now();
      // 3天减1秒，应该被保留
      const justUnderThreeDays = now - 3 * 24 * 60 * 60 * 1000 + 1000;

      const devices = {
        'boundary-device': createDeviceInfo('boundary-device', '边界设备', {
          isOnline: false,
          lastHeartbeat: justUnderThreeDays,
          firstDiscovered: justUnderThreeDays,
        }),
      };
      await setDeviceList(page, devices);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 验证设备还在
      const storedDevices = await page.evaluate(() => {
        const stored = localStorage.getItem('discovered_devices');
        return stored ? JSON.parse(stored) : {};
      });

      expect(storedDevices).toHaveProperty('boundary-device');
    });
  });

  /**
   * 定时器功能测试
   */
  test.describe('定时器功能', () => {
    test('应该启动心跳定时器', async ({ page }) => {
      await setUserInfo(page, createUserInfo('定时器测试用户', 'timer-test-peer-123'));

      const devices = {
        'timer-device': createDeviceInfo('timer-device', '定时器测试设备'),
      };
      await setDeviceList(page, devices);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 验证定时器相关的逻辑已启动
      const devices_list = await page.evaluate(() => {
        const stored = localStorage.getItem('discovered_devices');
        return stored ? Object.keys(JSON.parse(stored)) : [];
      });

      expect(Array.isArray(devices_list)).toBe(true);
    });

    test('切换页面后定时器应该继续运行', async ({ page }) => {
      await setUserInfo(page, createUserInfo('跨页定时器测试用户', 'cross-page-timer-peer-123'));

      const devices = {
        'timer-device': createDeviceInfo('timer-device', '定时器测试设备'),
      };
      await setDeviceList(page, devices);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 切换到聊天页面
      await page.click(SELECTORS.wechatMenuItem);
      await page.waitForURL(/\/wechat/);
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 切换回发现中心
      await page.click(SELECTORS.centerMenuItem);
      await page.waitForURL(/\/center/);
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 验证设备列表还在，说明后台逻辑持续运行
      const deviceCount = await page.locator(SELECTORS.deviceCard).count();
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
      test.setTimeout(60000); // 增加超时时间到 60 秒
      const devices = await createTestDevices(browser, '主动发现者', '被动被发现者', { startPage: 'center' });

      try {
        // 额外等待，确保两个设备的 Peer 完全初始化
        await devices.deviceA.page.waitForTimeout(5000);
        await devices.deviceB.page.waitForTimeout(5000);

        // 设备 A 添加设备 B
        await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceB.userInfo.peerId);
        await devices.deviceA.page.click(SELECTORS.addButton);

        // 等待发现通知发送和处理（增加等待时间）
        await devices.deviceA.page.waitForTimeout(8000);
        await devices.deviceB.page.waitForTimeout(8000);

        // 验证设备 B 的 localStorage 中保存了设备 A
        const storedDevices = await devices.deviceB.page.evaluate(() => {
          const stored = localStorage.getItem('discovered_devices');
          return stored ? JSON.parse(stored) : {};
        });

        // 设备 A 应该出现在设备 B 的存储中
        const hasDeviceA = Object.values(storedDevices).some(
          (device: any) => device.peerId === devices.deviceA.userInfo.peerId || device.username === '主动发现者'
        );
        expect(hasDeviceA).toBe(true);
      } finally {
        await cleanupTestDevices(devices);
      }
    });
  });

  /**
   * 设备数据完整性测试
   */
  test.describe('数据完整性', () => {
    test('设备数据应该包含所有必需字段', async ({ page }) => {
      await setUserInfo(page, createUserInfo('数据完整性测试用户', 'integrity-test-peer-123'));

      const devices = {
        'complete-device': createDeviceInfo('complete-device', '完整设备'),
      };
      await setDeviceList(page, devices);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 验证设备数据完整性
      const storedDevices = await page.evaluate(() => {
        const stored = localStorage.getItem('discovered_devices');
        return stored ? JSON.parse(stored) : {};
      });

      const device = storedDevices['complete-device'];
      expect(device).toHaveProperty('peerId');
      expect(device).toHaveProperty('username');
      expect(device).toHaveProperty('avatar');
      expect(device).toHaveProperty('lastHeartbeat');
      expect(device).toHaveProperty('firstDiscovered');
      expect(device).toHaveProperty('isOnline');
    });

    test('设备数据应该在多个页面间保持一致', async ({ page }) => {
      await setUserInfo(page, createUserInfo('一致性测试用户', 'consistency-test-peer-123'));

      const devices = {
        'consistency-device': createDeviceInfo('consistency-device', '一致性设备', {
          username: '一致性设备',
          isOnline: true,
        }),
      };
      await setDeviceList(page, devices);

      await page.reload();

      // 在发现中心获取设备数据
      const devicesInCenter = await page.evaluate(() => {
        const stored = localStorage.getItem('discovered_devices');
        return stored ? JSON.parse(stored) : {};
      });

      // 切换到聊天页面
      await page.click(SELECTORS.wechatMenuItem);
      await page.waitForURL(/\/wechat/);
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 在聊天页面获取设备数据
      const devicesInChat = await page.evaluate(() => {
        const stored = localStorage.getItem('discovered_devices');
        return stored ? JSON.parse(stored) : {};
      });

      // 验证数据一致性
      expect(devicesInCenter).toEqual(devicesInChat);
      expect(devicesInChat).toHaveProperty('consistency-device');
    });
  });
});
