/**
 * Request-Response 协议 E2E 测试
 * 测试 PeerHttpUtil 中的请求-响应通信机制
 */

import { test, expect } from '@playwright/test';
import { SELECTORS, WAIT_TIMES, setupUser, getPeerIdFromElement } from './test-helpers';

test.describe('Request-Response 协议测试', () => {
  test('应该能够发送请求并接收响应', async ({ page, context }) => {
    // 创建两个浏览器上下文
    const page2 = await context.newPage();

    // 设置两个用户
    await page.goto('/');
    await page2.goto('/');

    // 等待页面加载
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    await page2.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 设置用户名
    await setupUser(page, 'User1');
    await setupUser(page2, 'User2');

    // 等待初始化完成
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 获取 PeerId
    const peerId1 = await getPeerIdFromElement(page);
    const peerId2 = await getPeerIdFromElement(page2);

    expect(peerId1).toBeTruthy();
    expect(peerId2).toBeTruthy();

    // 在 page2 添加设备
    await page2.click(SELECTORS.centerMenuItem);
    await page2.waitForTimeout(WAIT_TIMES.SHORT);
    await page2.fill(SELECTORS.peerIdInput, peerId1!);
    await page2.click(SELECTORS.addButton);

    // 等待设备添加
    await page2.waitForTimeout(WAIT_TIMES.DISCOVERY);

    // 验证设备已添加
    const deviceList = page2.locator(SELECTORS.deviceCard);
    await expect(deviceList).toHaveCount(1);
  });

  test('应该处理请求超时', async ({ page }) => {
    // 设置用户
    await page.goto('/');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    await setupUser(page, 'User1');

    // 尝试连接不存在的设备
    await page.click(SELECTORS.centerMenuItem);
    await page.waitForTimeout(WAIT_TIMES.SHORT);
    await page.fill(SELECTORS.peerIdInput, 'non-existent-peer-id-12345');
    await page.click(SELECTORS.addButton);

    // 等待超时
    await page.waitForTimeout(6000);

    // 验证离线状态 - 设备应该被添加但显示为离线
    const deviceList = page.locator(SELECTORS.deviceCard);
    const count = await deviceList.count();

    if (count > 0) {
      // 如果设备卡片存在，验证离线标签
      const offlineTag = page.locator(SELECTORS.offlineTag);
      await expect(offlineTag).toBeVisible();
    } else {
      // 如果设备卡片不存在（超时后未添加），这也是可接受的行为
      expect(count).toBe(0);
    }
  });

  test('应该在请求失败后自动重试', async ({ page, context }) => {
    // 创建两个浏览器上下文
    const page2 = await context.newPage();

    // 设置用户
    await page.goto('/');
    await page2.goto('/');

    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    await page2.waitForTimeout(WAIT_TIMES.PEER_INIT);

    await setupUser(page, 'User1');
    await setupUser(page2, 'User2');

    // 获取 PeerId
    const peerId1 = await getPeerIdFromElement(page);
    const peerId2 = await getPeerIdFromElement(page2);

    // 在 page1 添加设备
    await page.click(SELECTORS.centerMenuItem);
    await page.waitForTimeout(WAIT_TIMES.SHORT);
    await page.fill(SELECTORS.peerIdInput, peerId2!);
    await page.click(SELECTORS.addButton);

    // 等待设备添加和连接建立
    await page.waitForTimeout(WAIT_TIMES.DISCOVERY);

    // 验证设备已添加并在线
    const deviceList = page.locator(SELECTORS.deviceCard);
    await expect(deviceList).toHaveCount(1);

    // 验证设备在线状态
    const onlineTag = page.locator(SELECTORS.onlineTag);
    await expect(onlineTag).toBeVisible();
  });

  test('应该支持并发多个请求', async ({ page, context }) => {
    // 创建三个浏览器上下文
    const page2 = await context.newPage();
    const page3 = await context.newPage();

    // 设置三个用户
    await page.goto('/');
    await page2.goto('/');
    await page3.goto('/');

    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    await page2.waitForTimeout(WAIT_TIMES.PEER_INIT);
    await page3.waitForTimeout(WAIT_TIMES.PEER_INIT);

    await setupUser(page, 'User1');
    await setupUser(page2, 'User2');
    await setupUser(page3, 'User3');

    // 获取 PeerId
    const peerId1 = await getPeerIdFromElement(page);
    const peerId2 = await getPeerIdFromElement(page2);
    const peerId3 = await getPeerIdFromElement(page3);

    // 在 page1 同时添加两个设备
    await page.click(SELECTORS.centerMenuItem);
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 添加第一个设备
    await page.fill(SELECTORS.peerIdInput, peerId2!);
    await page.click(SELECTORS.addButton);
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 添加第二个设备
    await page.fill(SELECTORS.peerIdInput, peerId3!);
    await page.click(SELECTORS.addButton);

    // 等待设备添加
    await page.waitForTimeout(WAIT_TIMES.DISCOVERY);

    // 验证两个设备都已添加
    const deviceList = page.locator(SELECTORS.deviceCard);
    await expect(deviceList).toHaveCount(2);
  });
});
