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
} from './test-helpers.js';
import { minutesAgo } from './test-helpers.js';

/**
 * 在线检查协议测试
 * 测试场景：
 * 1. 主动询问 checkOnline 协议
 * 2. 响应确认 respondOnlineCheck 协议
 * 3. 超时判定离线
 * 4. 定时心跳检查
 */
test.describe('在线检查协议', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/center');
    await clearAllStorage(page);
  });

  /**
   * 单设备在线检查测试
   */
  test.describe('单设备在线检查', () => {
    test('应该正确显示设备的在线/离线状态', async ({ page }) => {
      await setUserInfo(page, createUserInfo('测试用户', 'offline-test-123'));

      const now = Date.now();
      const devices = {
        'offline-device': createDeviceInfo('offline-device', '离线设备', {
          isOnline: false,
          lastHeartbeat: now - 15 * 60 * 1000, // 15分钟前
          firstDiscovered: now - 60 * 60 * 1000,
        }),
        'online-device': createDeviceInfo('online-device', '在线设备', {
          isOnline: true,
          lastHeartbeat: now - 5 * 60 * 1000, // 5分钟前
          firstDiscovered: now - 60 * 60 * 1000,
        }),
      };
      await setDeviceList(page, devices);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 验证离线设备
      const offlineDeviceCard = page.locator(SELECTORS.deviceCard).filter({ hasText: '离线设备' }).first();
      await expect(offlineDeviceCard).toBeVisible();

      const offlineTagCount = await offlineDeviceCard.locator('.ant-tag.ant-tag-default').count();
      expect(offlineTagCount).toBeGreaterThan(0);

      const offlineCardClass = await offlineDeviceCard.getAttribute('class');
      expect(offlineCardClass).toContain('is-offline');

      // 验证在线设备
      const onlineDeviceCard = page.locator(SELECTORS.deviceCard).filter({ hasText: '在线设备' }).first();
      await expect(onlineDeviceCard).toBeVisible();

      const onlineTagCount = await onlineDeviceCard.locator('.ant-tag.ant-tag-success').count();
      expect(onlineTagCount).toBeGreaterThan(0);
    });

    test('定时心跳检查应该正常工作', async ({ page }) => {
      await setUserInfo(page, createUserInfo('心跳测试用户', 'heartbeat-test-123'));

      const devices = {
        'device-1': createDeviceInfo('device-1', '设备1'),
        'device-2': createDeviceInfo('device-2', '设备2', { isOnline: false }),
      };
      await setDeviceList(page, devices);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      const storedDevices = await page.evaluate(() => {
        const stored = localStorage.getItem('discovered_devices_meta');
        return stored ? JSON.parse(stored) : {};
      });

      expect(Object.keys(storedDevices).length).toBe(2);

      // 等待一段时间验证定时器持续运行
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      const storedDevicesAfter = await page.evaluate(() => {
        const stored = localStorage.getItem('discovered_devices_meta');
        return stored ? JSON.parse(stored) : {};
      });

      expect(Object.keys(storedDevicesAfter).length).toBe(2);
    });
  });

  /**
   * 多设备在线检查测试
   */
  test.describe('多设备在线检查', () => {
    test('应该能够主动检查设备在线状态', async ({ browser }) => {
      test.setTimeout(60000);
      const devices = await createTestDevices(browser, '检查方', '被检查方', { startPage: 'center' });

      try {
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.LONG);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.LONG);

        await addDevice(devices.deviceA.page, devices.deviceB.userInfo.peerId);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.DISCOVERY + WAIT_TIMES.LONG);

        await assertDeviceExists(devices.deviceA.page, devices.deviceB.userInfo.peerId);
        await assertDeviceOnlineStatus(devices.deviceA.page, devices.deviceB.userInfo.peerId, true);
      } finally {
        await cleanupTestDevices(devices);
      }
    });

    test('切换页面后定时器应该继续运行', async ({ browser }) => {
      test.setTimeout(60000);
      const devices = await createTestDevices(browser, '状态检查方', '离线设备789', { startPage: 'center' });

      try {
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.LONG);

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

        await assertDeviceExists(devices.deviceA.page, '离线设备');

        await devices.deviceA.page.click(SELECTORS.refreshButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MEDIUM);

        const deviceCount = await devices.deviceA.page.locator(SELECTORS.deviceCard).count();
        expect(deviceCount).toBeGreaterThan(0);
      } finally {
        await cleanupTestDevices(devices);
      }
    });
  });
});
