import { test, expect } from '@playwright/test';
import {
  SELECTORS,
  WAIT_TIMES,
  createUserInfo,
  createTestDevices,
  cleanupTestDevices,
} from './test-helpers.js';

/**
 * P2P 连接基础测试
 * 测试两个设备之间能否建立基本的 P2P 连接
 */
test.describe('P2P 连接基础测试', () => {
  test('设备 A 应该能连接到设备 B', async ({ browser }) => {
    const devices = await createTestDevices(browser, '设备A', '设备B', { startPage: 'center' });

    try {
      console.log('[Test] Device A PeerId:', devices.deviceA.userInfo.peerId);
      console.log('[Test] Device B PeerId:', devices.deviceB.userInfo.peerId);

      // 额外等待确保两个设备的 Peer 连接都稳定
      await devices.deviceA.page.waitForTimeout(5000);
      await devices.deviceB.page.waitForTimeout(5000);

      // 检查两个设备的连接状态
      const deviceAConnectionStatus = await devices.deviceA.page
        .locator('.ant-descriptions-item-label:has-text("连接状态") + .ant-descriptions-item-content .ant-badge-status-processing')
        .count();
      const deviceBConnectionStatus = await devices.deviceB.page
        .locator('.ant-descriptions-item-label:has-text("连接状态") + .ant-descriptions-item-content .ant-badge-status-processing')
        .count();

      console.log('[Test] Device A connection status count:', deviceAConnectionStatus);
      console.log('[Test] Device B connection status count:', deviceBConnectionStatus);

      // 至少有一个设备应该显示已连接状态
      expect(deviceAConnectionStatus + deviceBConnectionStatus).toBeGreaterThan(0);
    } finally {
      await cleanupTestDevices(devices);
    }
  });
});
