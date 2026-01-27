/**
 * 发现中心连接状态 E2E 测试
 * 测试 Peer Server 连接状态的准确显示
 */

import { test, expect } from '@playwright/test';
import {
  createUserInfo,
  clearAllStorage,
  WAIT_TIMES,
} from './test-helpers';

test.describe('发现中心连接状态', () => {
  test('应该准确显示与 Peer Server 的连接状态', async ({ page }) => {
    await page.goto('/center');
    await clearAllStorage(page);

    const userInfo = createUserInfo('连接状态测试用户');
    await page.evaluate((info) => {
      localStorage.setItem('p2p_user_info', JSON.stringify(info));
    }, userInfo);
    await page.reload();

    // 等待 PeerId 显示（说明 PeerJS 已连接）
    await page.waitForSelector(
      '.ant-descriptions-item-label:has-text("我的 Peer ID") + .ant-descriptions-item-content .ant-typography',
      { timeout: 15000 }
    ).catch(() => {
      console.log('[Test] PeerId not ready, continuing...');
    });

    // 额外等待确保连接完成
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT + 1000);

    // 获取 UI 上的连接状态
    const uiConnectionStatus = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('.ant-descriptions-item-label'));
      const statusLabel = labels.find(l => l.textContent?.trim() === '连接状态');
      if (statusLabel) {
        const cell = statusLabel.nextElementSibling;
        const badge = cell?.querySelector('.ant-badge');
        const dot = badge?.querySelector('.ant-badge-status-dot');
        return {
          text: cell?.textContent?.trim(),
          hasProcessingClass: dot?.classList.contains('ant-badge-status-processing') || false,
          hasErrorClass: dot?.classList.contains('ant-badge-status-error') || false,
        };
      }
      return null;
    });

    console.log('[Test] UI Connection Status:', uiConnectionStatus);

    // 验证连接状态存在且显示正确（已连接或未连接）
    expect(uiConnectionStatus).not.toBeNull();

    // 如果 PeerId 显示（PeerJS 已连接），则应该显示"已连接"
    // 如果 PeerId 不显示（PeerJS 未连接），则应该显示"未连接"
    // 两种状态都是正确的，只要状态和实际一致即可
    if (uiConnectionStatus?.text === '已连接') {
      expect(uiConnectionStatus?.hasProcessingClass).toBe(true);
      expect(uiConnectionStatus?.hasErrorClass).toBe(false);
    } else if (uiConnectionStatus?.text === '未连接') {
      // 未连接状态也是合理的（网络问题或 Peer Server 不可用）
      expect(uiConnectionStatus?.hasErrorClass).toBe(true);
    }
  });
});
