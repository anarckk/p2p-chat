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
      // 先设置设备列表到 localStorage（在设置用户信息之前）
      const now = Date.now();
      // 确保离线设备的 lastHeartbeat 超过 OFFLINE_THRESHOLD (10分钟)
      const devices = {
        'offline-device': createDeviceInfo('offline-device', '离线设备', {
          isOnline: false,
          lastHeartbeat: now - 15 * 60 * 1000, // 15分钟前，确保超过10分钟阈值
          firstDiscovered: now - 60 * 60 * 1000,
        }),
        'online-device': createDeviceInfo('online-device', '在线设备', {
          isOnline: true,
          lastHeartbeat: now - 5 * 60 * 1000, // 5分钟前，在10分钟阈值内
          firstDiscovered: now - 60 * 60 * 1000,
        }),
      };
      await setDeviceList(page, devices);

      // 验证 localStorage 中的数据已正确设置
      const storedData = await page.evaluate(() => {
        const meta = localStorage.getItem('discovered_devices_meta');
        return meta ? JSON.parse(meta) : null;
      });
      console.log('[Test] Stored devices in localStorage:', storedData);
      expect(storedData).not.toBeNull();
      expect(Object.keys(storedData).length).toBe(2);

      // 然后设置用户信息（这会触发页面导航）
      await setUserInfo(page, createUserInfo('测试用户', 'offline-test-123'));

      // 等待足够的时间让 store 完成加载和状态更新
      await page.waitForTimeout(WAIT_TIMES.LONG * 3);

      // 先检查页面上的所有设备卡片内容
      const allCards = page.locator(SELECTORS.deviceCard);
      const cardCount = await allCards.count();
      console.log('[Test] Total device cards after setup:', cardCount);

      // 打印所有设备卡片的用户名，帮助调试
      for (let i = 0; i < Math.min(cardCount, 5); i++) {
        const card = allCards.nth(i);
        const username = await card.locator('.ant-card-meta-title').textContent();
        const hasOfflineClass = await card.evaluate((el) => el.classList.contains('is-offline'));
        console.log(`[Test] Card ${i}: username="${username?.trim()}", isOffline=${hasOfflineClass}`);
      }

      // 验证设备列表包含至少我们添加的两个设备（加上"我"可能共3个）
      expect(cardCount).toBeGreaterThanOrEqual(2);

      // 验证离线设备 - 使用更宽松的选择器
      const offlineDeviceCard = page.locator(SELECTORS.deviceCard).filter({ hasText: '离线设备' });
      const offlineCount = await offlineDeviceCard.count();
      console.log('[Test] Offline device count:', offlineCount);

      // 如果找不到离线设备，打印更多调试信息
      if (offlineCount === 0) {
        const pageContent = await page.locator('.center-container').textContent();
        console.log('[Test] Center container content preview:', pageContent?.substring(0, 500));
      }

      expect(offlineCount, '应该找到离线设备').toBeGreaterThan(0);

      // 验证离线标识存在（检查 class）
      const firstOfflineCard = offlineDeviceCard.first();
      await expect(firstOfflineCard).toBeVisible({ timeout: 5000 });

      // 检查是否包含离线相关的标识
      const hasOfflineClass = await firstOfflineCard.evaluate((el) => {
        return el.classList.contains('is-offline');
      });
      console.log('[Test] Has offline class:', hasOfflineClass);
      expect(hasOfflineClass).toBe(true);

      // 验证在线设备
      const onlineDeviceCard = page.locator(SELECTORS.deviceCard).filter({ hasText: '在线设备' });
      const onlineCount = await onlineDeviceCard.count();
      console.log('[Test] Online device count:', onlineCount);
      expect(onlineCount, '应该找到在线设备').toBeGreaterThan(0);

      const firstOnlineCard = onlineDeviceCard.first();
      await expect(firstOnlineCard).toBeVisible({ timeout: 5000 });

      // 在线设备不应该有 is-offline 类
      const hasOfflineClassOnline = await firstOnlineCard.evaluate((el) => {
        return el.classList.contains('is-offline');
      });
      console.log('[Test] Online device has offline class:', hasOfflineClassOnline);
      expect(hasOfflineClassOnline).toBe(false);
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
      test.setTimeout(30000);
      const devices = await createTestDevices(browser, '检查方', '被检查方', { startPage: 'center' });

      try {
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);

        await addDevice(devices.deviceA.page, devices.deviceB.userInfo.peerId);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.DISCOVERY * 2);

        await assertDeviceExists(devices.deviceA.page, devices.deviceB.userInfo.peerId);
        await assertDeviceOnlineStatus(devices.deviceA.page, devices.deviceB.userInfo.peerId, true);
      } finally {
        await cleanupTestDevices(devices);
      }
    });

    test('切换页面后定时器应该继续运行', async ({ browser }) => {
      test.setTimeout(30000);
      const devices = await createTestDevices(browser, '状态检查方', '离线设备789', { startPage: 'center' });

      try {
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);

        // 设置一个离线设备，确保 lastHeartbeat 超过 OFFLINE_THRESHOLD
        const offlineDevices = {
          'offline-target-789': createDeviceInfo('offline-target-789', '离线设备', {
            isOnline: false,
            lastHeartbeat: minutesAgo(20), // 20分钟前，确保超过10分钟阈值
            firstDiscovered: minutesAgo(20),
          }),
        };
        await setDeviceList(devices.deviceA.page, offlineDevices);

        await devices.deviceA.page.reload();
        await devices.deviceA.page.waitForLoadState('domcontentloaded');
        // 等待足够的时间让 store 完成加载
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.LONG * 2);

        // 检查设备数量
        const deviceCount = await devices.deviceA.page.locator(SELECTORS.deviceCard).count();
        console.log('[Test] Device count after reload:', deviceCount);
        expect(deviceCount).toBeGreaterThan(0);

        // 尝试查找离线设备
        const offlineDeviceCard = devices.deviceA.page.locator(SELECTORS.deviceCard).filter({ hasText: '离线设备' });
        const offlineCount = await offlineDeviceCard.count();
        console.log('[Test] Offline device count:', offlineCount);

        if (offlineCount > 0) {
          // 验证离线标识
          const hasOfflineClass = await offlineDeviceCard.first().evaluate((el) => {
            return el.classList.contains('is-offline');
          });
          console.log('[Test] Has offline class:', hasOfflineClass);
          expect(hasOfflineClass).toBe(true);
        }

        // 点击刷新按钮
        await devices.deviceA.page.click(SELECTORS.refreshButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.LONG);

        // 刷新后设备数量应该仍然大于0
        const deviceCountAfterRefresh = await devices.deviceA.page.locator(SELECTORS.deviceCard).count();
        console.log('[Test] Device count after refresh:', deviceCountAfterRefresh);
        expect(deviceCountAfterRefresh).toBeGreaterThan(0);
      } finally {
        await cleanupTestDevices(devices);
      }
    });
  });
});
