import { test, expect } from '@playwright/test';
import {
  SELECTORS,
  WAIT_TIMES,
  createTestDevices,
  cleanupTestDevices,
  setUserInfo,
  setDeviceList,
  createUserInfo,
  createDeviceInfo,
  minutesAgo,
} from './test-helpers.js';

/**
 * 聊天离线状态测试
 *
 * 测试场景：设备下线后，发现中心和聊天列表都要显示离线状态
 */
test.describe('聊天离线状态测试', () => {
  test('设备下线后，发现中心和聊天列表都要显示离线状态', async ({ page }) => {
    test.setTimeout(30000);

    // 设置用户信息
    await setUserInfo(page, createUserInfo('测试用户A', 'offline-test-a'), { navigateTo: '/center' });
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 创建离线设备（超过心跳时间）
    const offlineDeviceId = 'offline-device-peer-123';
    const offlineDevices = {
      [offlineDeviceId]: createDeviceInfo(offlineDeviceId, '离线设备UserB', {
        isOnline: false,
        lastHeartbeat: minutesAgo(15),
        firstDiscovered: minutesAgo(60),
      }),
    };

    await setDeviceList(page, offlineDevices);

    // 刷新页面以加载设备列表
    await page.reload();
    await page.waitForTimeout(WAIT_TIMES.RELOAD);

    // 验证离线设备显示离线状态
    const deviceCard = page.locator('.device-card').filter({ hasText: '离线设备UserB' });
    await expect(deviceCard).toBeVisible();
    // 使用 is-offline class 验证离线状态
    const cardClass = await deviceCard.getAttribute('class');
    expect(cardClass).toContain('is-offline');
    // 验证离线标签存在
    const offlineTagCount = await deviceCard.locator(SELECTORS.offlineTag).count();
    expect(offlineTagCount).toBeGreaterThan(0);
    console.log('[Test] ✓ 离线设备正确显示离线状态');
  });

  test('设备下线后重新上线，状态应该正确更新', async ({ page }) => {
    test.setTimeout(30000);

    // 设置用户信息
    await setUserInfo(page, createUserInfo('测试用户B', 'offline-test-b'), { navigateTo: '/center' });
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 创建离线设备
    const offlineDeviceId = 'offline-device-peer-456';
    const offlineDevices = {
      [offlineDeviceId]: createDeviceInfo(offlineDeviceId, '测试设备UserA', {
        isOnline: false,
        lastHeartbeat: minutesAgo(15),
        firstDiscovered: minutesAgo(60),
      }),
    };

    await setDeviceList(page, offlineDevices);
    await page.reload();
    await page.waitForTimeout(WAIT_TIMES.RELOAD);

    // 验证离线状态
    const deviceCard = page.locator('.device-card').filter({ hasText: '测试设备UserA' });
    await expect(deviceCard).toBeVisible();
    // 使用 is-offline class 验证离线状态
    const cardClass = await deviceCard.getAttribute('class');
    expect(cardClass).toContain('is-offline');
    // 验证离线标签存在
    const offlineTagCount = await deviceCard.locator(SELECTORS.offlineTag).count();
    expect(offlineTagCount).toBeGreaterThan(0);
    console.log('[Test] ✓ 设备显示离线');

    // 模拟设备重新上线（更新 lastHeartbeat 为当前时间）
    await page.evaluate((peerId) => {
      const stored = localStorage.getItem('discovered_devices_meta');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed[peerId]) {
          parsed[peerId].lastHeartbeat = Date.now();
          localStorage.setItem('discovered_devices_meta', JSON.stringify(parsed));
        }
      }
    }, offlineDeviceId);

    await page.reload();
    await page.waitForTimeout(WAIT_TIMES.RELOAD);

    // 验证在线状态
    const deviceCardOnline = page.locator('.device-card').filter({ hasText: '测试设备UserA' });
    await expect(deviceCardOnline).toBeVisible();
    // 验证在线标签存在
    const onlineTagCount = await deviceCardOnline.locator(SELECTORS.onlineTag).count();
    expect(onlineTagCount).toBeGreaterThan(0);
    // 验证没有 is-offline class
    const cardClassOnline = await deviceCardOnline.getAttribute('class');
    expect(cardClassOnline).not.toContain('is-offline');
    console.log('[Test] ✓ 设备重新上线后显示在线');
  });
});
