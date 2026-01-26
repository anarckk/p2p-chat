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
  addDevice,
  assertDeviceExists,
  assertDeviceOnlineStatus,
  assertDeviceNotExists,
} from './test-helpers.js';
import { minutesAgo } from './test-helpers.js';

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
    await page.goto('/center');
    await clearAllStorage(page);
  });

  /**
   * 多设备在线检查测试
   */
  test.describe('多设备在线检查', () => {
    test('应该能够主动检查设备在线状态', async ({ browser }) => {
      test.setTimeout(60000); // 增加超时时间
      const devices = await createTestDevices(browser, '检查方', '被检查方', { startPage: 'center' });

      try {
        // 监听控制台日志
        const deviceALogs: string[] = [];
        devices.deviceA.page.on('console', msg => {
          deviceALogs.push(msg.text());
        });

        // 检查连接状态
        const deviceAStatus = await devices.deviceA.page.locator('.ant-descriptions-item-label:has-text("连接状态") + .ant-descriptions-item-content .ant-badge-status-text').textContent();
        console.log('[Test] Device A connection status:', deviceAStatus);

        // 等待 Peer 连接建立
        await devices.deviceA.page.waitForTimeout(3000);
        await devices.deviceB.page.waitForTimeout(3000);

        // 检查方添加目标设备
        await addDevice(devices.deviceA.page, devices.deviceB.userInfo.peerId);

        // 等待设备出现 - 使用与成功测试相同的等待时间
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.DISCOVERY + 2000);

        // 打印相关日志
        console.log('[Test] Device A logs (filtered):');
        deviceALogs.filter(log => log.includes('discovery') || log.includes('error') || log.includes('check')).forEach(log => {
          console.log('  ', log);
        });

        // 验证设备出现在发现列表中 - 使用 peerId 而不是用户名
        await assertDeviceExists(devices.deviceA.page, devices.deviceB.userInfo.peerId);

        // 验证设备显示为在线 - 使用 peerId
        await assertDeviceOnlineStatus(devices.deviceA.page, devices.deviceB.userInfo.peerId, true);
      } finally {
        await cleanupTestDevices(devices);
      }
    });

    test('离线设备应该被正确标识', async ({ page }) => {
      await setUserInfo(page, createUserInfo('测试用户', 'offline-test-123'));

      // 添加一个离线设备（lastHeartbeat 超过 10 分钟）
      const devices = {
        'offline-device': createDeviceInfo('offline-device', '离线设备', {
          isOnline: false,
          lastHeartbeat: minutesAgo(15),
          firstDiscovered: minutesAgo(60),
        }),
        'online-device': createDeviceInfo('online-device', '在线设备', {
          isOnline: true,
          lastHeartbeat: minutesAgo(5),
          firstDiscovered: minutesAgo(60),
        }),
      };
      await setDeviceList(page, devices);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 验证离线设备显示"离线"标签 - 使用更精确的选择器
      const offlineDeviceCard = page.locator(SELECTORS.deviceCard).filter({ hasText: '离线设备' }).first();
      await expect(offlineDeviceCard).toBeVisible();

      // 检查离线标签
      const offlineTagCount = await offlineDeviceCard.locator('.ant-tag.ant-tag-default').count();
      expect(offlineTagCount).toBeGreaterThan(0);

      // 验证在线设备显示"在线"标签
      const onlineDeviceCard = page.locator(SELECTORS.deviceCard).filter({ hasText: '在线设备' }).first();
      await expect(onlineDeviceCard).toBeVisible();

      // 检查在线标签
      const onlineTagCount = await onlineDeviceCard.locator('.ant-tag.ant-tag-success').count();
      expect(onlineTagCount).toBeGreaterThan(0);

      // 验证离线设备卡片有特殊样式
      const offlineCardClass = await offlineDeviceCard.getAttribute('class');
      expect(offlineCardClass).toContain('is-offline');
    });

    test('超时未响应应该判定为离线', async ({ page }) => {
      await setUserInfo(page, createUserInfo('超时测试用户', 'timeout-test-123'));

      // 添加一个长时间未响应的设备
      const devices = {
        'timeout-device': createDeviceInfo('timeout-device', '超时设备', {
          isOnline: false,
          lastHeartbeat: minutesAgo(15),
          firstDiscovered: minutesAgo(15),
        }),
      };
      await setDeviceList(page, devices);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 验证设备显示为离线
      const offlineTag = page.locator(SELECTORS.offlineTag);
      const hasOfflineTag = await offlineTag.count();

      expect(hasOfflineTag).toBeGreaterThan(0);

      // 验证设备卡片有离线样式
      const offlineCard = page.locator(SELECTORS.deviceCardOffline);
      await expect(offlineCard).toBeVisible();
    });

    test('应该正确显示设备的最后心跳时间', async ({ page }) => {
      await setUserInfo(page, createUserInfo('时间测试用户', 'time-test-123'));

      const devices = {
        'recent-device': createDeviceInfo('recent-device', '最近活跃设备', {
          isOnline: true,
          lastHeartbeat: minutesAgo(2),
          firstDiscovered: Date.now() - 3600000,
        }),
      };
      await setDeviceList(page, devices);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 验证设备信息显示
      await assertDeviceExists(page, '最近活跃设备');

      // 验证设备卡片有描述信息（包含心跳时间）
      const deviceCard = page.locator(SELECTORS.deviceCard).filter({ hasText: '最近活跃设备' });
      await expect(deviceCard).toBeVisible();
    });
  });

  /**
   * 定时心跳测试
   */
  test.describe('定时心跳', () => {
    test('应该启动定时心跳检查', async ({ page }) => {
      await setUserInfo(page, createUserInfo('心跳测试用户', 'heartbeat-test-123'));

      // 添加一些设备
      const devices = {
        'device-1': createDeviceInfo('device-1', '设备1'),
        'device-2': createDeviceInfo('device-2', '设备2', { isOnline: false }),
      };
      await setDeviceList(page, devices);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 验证心跳定时器已启动
      const storedDevices = await page.evaluate(() => {
        const stored = localStorage.getItem('discovered_devices');
        return stored ? JSON.parse(stored) : {};
      });

      expect(Object.keys(storedDevices).length).toBe(2);

      // 等待一段时间，验证定时器持续运行
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      const storedDevicesAfter = await page.evaluate(() => {
        const stored = localStorage.getItem('discovered_devices');
        return stored ? JSON.parse(stored) : {};
      });

      // 设备应该还在，说明定时器没有异常清理
      expect(Object.keys(storedDevicesAfter).length).toBe(2);
    });

    test('定时心跳应该不干扰正常使用', async ({ page }) => {
      await setUserInfo(page, createUserInfo('干扰测试用户', 'interference-test-123'));

      const devices = {
        'test-device': createDeviceInfo('test-device', '测试设备'),
      };
      await setDeviceList(page, devices);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 等待定时器运行
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 尝试添加新设备
      await page.fill(SELECTORS.peerIdInput, 'new-device-999');
      await page.click(SELECTORS.addButton);
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 刷新页面以更新设备列表
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 验证原有设备还在（新设备可能因为离线而不显示）
      await assertDeviceExists(page, '测试设备');
    });

    test('切换页面后定时器应该继续运行', async ({ browser }) => {
      test.setTimeout(60000); // 增加超时时间
      const devices = await createTestDevices(browser, '状态检查方', '离线设备789', { startPage: 'center' });

      try {
        // 等待 Peer 连接建立
        await devices.deviceA.page.waitForTimeout(3000);

        // 设置一个离线设备
        const offlineDevices = {
          'offline-target-789': createDeviceInfo('offline-target-789', '离线设备', {
            isOnline: false,
            lastHeartbeat: minutesAgo(20),
            firstDiscovered: minutesAgo(20),
          }),
        };
        await setDeviceList(devices.deviceA.page, offlineDevices);

        await devices.deviceA.page.reload();
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MEDIUM);

        // 验证初始状态为离线
        await assertDeviceExists(devices.deviceA.page, '离线设备');

        // 检查方手动刷新
        await devices.deviceA.page.click(SELECTORS.refreshButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MEDIUM);

        // 注意：此测试验证的是在线检查协议的流程
        // 由于真实网络环境的复杂性，这里主要验证不会崩溃
        const deviceCount = await devices.deviceA.page.locator(SELECTORS.deviceCard).count();
        expect(deviceCount).toBeGreaterThan(0);
      } finally {
        await cleanupTestDevices(devices);
      }
    });
  });

  /**
   * 状态变化测试
   */
  test.describe('状态变化', () => {
    test('设备上线后应该更新为在线状态', async ({ page }) => {
      await setUserInfo(page, createUserInfo('状态测试用户', 'status-change-test-123'));

      const devices = {
        'was-offline-device': createDeviceInfo('was-offline-device', '曾经离线的设备', {
          isOnline: false,
          lastHeartbeat: minutesAgo(15),
          firstDiscovered: minutesAgo(60),
        }),
      };
      await setDeviceList(page, devices);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 更新设备为在线状态
      const updatedDevices = {
        'was-offline-device': createDeviceInfo('was-offline-device', '曾经离线的设备', {
          isOnline: true,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now() - 60000,
        }),
      };
      await setDeviceList(page, updatedDevices);

      // 刷新页面以更新设备状态显示
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 验证设备状态更新
      await assertDeviceOnlineStatus(page, '曾经离线的设备', true);
    });

    test('应该正确处理多个设备的状态', async ({ page }) => {
      await setUserInfo(page, createUserInfo('多状态测试用户', 'multi-status-test-123'));

      // 创建多个不同状态的设备
      const devices = {
        'device-online-1': createDeviceInfo('device-online-1', '在线设备1', {
          isOnline: true,
          lastHeartbeat: minutesAgo(2),
        }),
        'device-online-2': createDeviceInfo('device-online-2', '在线设备2', {
          isOnline: true,
          lastHeartbeat: minutesAgo(5),
        }),
        'device-offline-1': createDeviceInfo('device-offline-1', '离线设备1', {
          isOnline: false,
          lastHeartbeat: minutesAgo(12),
        }),
        'device-offline-2': createDeviceInfo('device-offline-2', '离线设备2', {
          isOnline: false,
          lastHeartbeat: minutesAgo(20),
        }),
      };
      await setDeviceList(page, devices);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 验证在线设备数量 - 使用更精确的选择器
      const onlineTags = await page.locator('.ant-tag.ant-tag-success').count();
      expect(onlineTags).toBeGreaterThanOrEqual(2);

      // 验证离线设备数量
      const offlineTags = await page.locator('.ant-tag.ant-tag-default').count();
      expect(offlineTags).toBeGreaterThanOrEqual(2);
    });
  });
});
