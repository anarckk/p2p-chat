/**
 * 调试 PeerJS 连接问题
 */

import { test, expect } from '@playwright/test';
import {
  createUserInfo,
  WAIT_TIMES,
} from './test-helpers';

test('调试：检查 PeerJS 连接状态', async ({ browser }) => {
  test.setTimeout(120000);

  // 创建设备 A
  const deviceAUserInfo = createUserInfo('调试设备A', 'debug-device-a');
  const deviceAContext = await browser.newContext();
  const deviceAPage = await deviceAContext.newPage();
  await deviceAPage.goto('/center');
  await deviceAPage.waitForLoadState('domcontentloaded');
  await deviceAPage.evaluate((info: any) => {
    localStorage.setItem('p2p_user_info', JSON.stringify(info));
  }, deviceAUserInfo);
  await deviceAPage.reload();
  await deviceAPage.waitForSelector('.center-container', { timeout: 8000 });

  // 创建设备 B
  const deviceBUserInfo = createUserInfo('调试设备B', 'debug-device-b');
  const deviceBContext = await browser.newContext();
  const deviceBPage = await deviceBContext.newPage();
  await deviceBPage.goto('/center');
  await deviceBPage.waitForLoadState('domcontentloaded');
  await deviceBPage.evaluate((info: any) => {
    localStorage.setItem('p2p_user_info', JSON.stringify(info));
  }, deviceBUserInfo);
  await deviceBPage.reload();
  await deviceBPage.waitForSelector('.center-container', { timeout: 8000 });

  // 等待 PeerJS 初始化
  await deviceAPage.waitForTimeout(WAIT_TIMES.PEER_INIT * 3);
  await deviceBPage.waitForTimeout(WAIT_TIMES.PEER_INIT * 3);

  // 检查设备 A 的 PeerId
  const deviceAPeerId = await deviceAPage.evaluate(() => {
    const stored = localStorage.getItem('p2p_user_info');
    return stored ? JSON.parse(stored).peerId : null;
  });
  console.log('[Debug] Device A PeerId:', deviceAPeerId);

  // 检查设备 B 的 PeerId
  const deviceBPeerId = await deviceBPage.evaluate(() => {
    const stored = localStorage.getItem('p2p_user_info');
    return stored ? JSON.parse(stored).peerId : null;
  });
  console.log('[Debug] Device B PeerId:', deviceBPeerId);

  // 检查设备 A 的连接状态
  const deviceAConnectionStatus = await deviceAPage.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('.ant-descriptions-item-label'));
    const statusLabel = labels.find(l => l.textContent?.trim() === '连接状态');
    if (statusLabel) {
      const cell = statusLabel.nextElementSibling;
      return cell?.textContent?.trim();
    }
    return null;
  });
  console.log('[Debug] Device A connection status:', deviceAConnectionStatus);

  // 检查设备 B 的连接状态
  const deviceBConnectionStatus = await deviceBPage.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('.ant-descriptions-item-label'));
    const statusLabel = labels.find(l => l.textContent?.trim() === '连接状态');
    if (statusLabel) {
      const cell = statusLabel.nextElementSibling;
      return cell?.textContent?.trim();
    }
    return null;
  });
  console.log('[Debug] Device B connection status:', deviceBConnectionStatus);

  // 等待更长时间，看看连接状态是否会改变
  await deviceAPage.waitForTimeout(10000);
  await deviceBPage.waitForTimeout(10000);

  // 再次检查连接状态
  const deviceAConnectionStatusAfter = await deviceAPage.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('.ant-descriptions-item-label'));
    const statusLabel = labels.find(l => l.textContent?.trim() === '连接状态');
    if (statusLabel) {
      const cell = statusLabel.nextElementSibling;
      return cell?.textContent?.trim();
    }
    return null;
  });
  console.log('[Debug] Device A connection status after 30s:', deviceAConnectionStatusAfter);

  const deviceBConnectionStatusAfter = await deviceBPage.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('.ant-descriptions-item-label'));
    const statusLabel = labels.find(l => l.textContent?.trim() === '连接状态');
    if (statusLabel) {
      const cell = statusLabel.nextElementSibling;
      return cell?.textContent?.trim();
    }
    return null;
  });
  console.log('[Debug] Device B connection status after 30s:', deviceBConnectionStatusAfter);

  // 清理
  await deviceAContext.close();
  await deviceBContext.close();
});
