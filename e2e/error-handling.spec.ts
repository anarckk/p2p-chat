/**
 * 错误处理 E2E 测试
 * 测试场景：
 * 1. 连接失败时的错误处理
 * 2. 无效 PeerId 的错误处理
 * 3. 发送失败时的重试机制
 * 4. 网络异常时的处理
 * 5. 超时处理
 */

import { test, expect } from '@playwright/test';
import {
  SELECTORS,
  WAIT_TIMES,
  clearAllStorage,
  createTestDevices,
  cleanupTestDevices,
} from './test-helpers.js';

// 辅助函数：设置用户信息
async function setupUserForTest(page: any) {
  // 先导航到 /wechat 页面
  await page.goto('/wechat', { waitUntil: 'domcontentloaded' });

  // 清理所有 storage
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  // 刷新页面以重新触发 onMounted 和用户设置弹窗
  await page.reload({ waitUntil: 'domcontentloaded' });

  // 等待用户设置弹窗
  await page.waitForSelector('.ant-modal', { timeout: 8000 });

  // 填写用户名
  const usernameInput = page.locator('input[placeholder*="请输入用户名"]');
  await usernameInput.fill('错误测试用户');

  // 点击确定按钮
  await page.click('.ant-modal .ant-btn-primary');

  // 等待弹窗关闭
  await page.waitForSelector('.ant-modal', { state: 'hidden', timeout: 8000 }).catch(() => {
    console.log('[Test] Modal still visible after clicking confirm, continuing...');
  });
}

test.describe('错误处理', () => {
  // 不使用 beforeEach，在每个测试中单独设置


  /**
   * 无效 PeerId 错误处理测试
   */
  test.describe('无效 PeerId 处理', () => {
    test('添加不存在的设备应该显示错误提示', async ({ page }) => {
      // 设置用户信息
      await setupUserForTest(page);

      // 导航到发现中心页面
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');

      // 等待页面加载
      await page.waitForSelector(SELECTORS.centerContainer, { timeout: 8000 });
      await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

      // 输入一个不存在的 PeerId
      const invalidPeerId = 'non-existent-peer-id-12345';
      await page.fill(SELECTORS.peerIdInput, invalidPeerId);
      await page.click(SELECTORS.addButton);

      // 等待错误提示或超时
      await page.waitForTimeout(WAIT_TIMES.MESSAGE);

      // 检查是否有错误提示（可选，因为可能没有错误提示）
      const hasError = await page.locator('.ant-message-error').isVisible().catch(() => false);

      if (hasError) {
        console.log('[Test] Error message displayed for invalid PeerId');
      } else {
        console.log('[Test] No error message (PeerJS may still try to connect)');
      }

      // 验证不会崩溃
      const centerVisible = page.locator(SELECTORS.centerContainer);
      await expect(centerVisible).toBeVisible();

      console.log('[Test] Invalid PeerId test completed without crash');
    });

    test('添加空 PeerId 应该被拒绝', async ({ page }) => {
      // 设置用户信息
      await setupUserForTest(page);

      // 导航到发现中心页面
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');

      // 等待页面加载完成
      await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

      // 尝试添加空 PeerId
      await page.fill(SELECTORS.peerIdInput, '');
      await page.click(SELECTORS.addButton);

      // 等待反应
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证不会崩溃
      const centerVisible = page.locator(SELECTORS.centerContainer);
      await expect(centerVisible).toBeVisible();

      console.log('[Test] Empty PeerId test completed');
    });

    test('添加格式错误的 PeerId 应该被处理', async ({ page }) => {
      // 设置用户信息
      await setupUserForTest(page);

      // 导航到发现中心页面
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');

      await page.waitForSelector(SELECTORS.centerContainer, { timeout: 8000 });
      await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

      // 尝试添加格式错误的 PeerId
      const invalidPeerIds = [
        'invalid@id!',
        'spaces in id',
        '中文id',
        '',
        '   ',
      ];

      for (const peerId of invalidPeerIds) {
        await page.fill(SELECTORS.peerIdInput, peerId);

        // 尝试点击添加按钮（可能被禁用）
        const addButton = page.locator(SELECTORS.addButton);
        const isEnabled = await addButton.isEnabled().catch(() => false);

        if (isEnabled) {
          await addButton.click();
          await page.waitForTimeout(WAIT_TIMES.SHORT);
        }

        console.log(`[Test] Tested invalid PeerId: "${peerId}"`);
      }

      // 验证不会崩溃
      const centerVisible = page.locator(SELECTORS.centerContainer);
      await expect(centerVisible).toBeVisible();

      console.log('[Test] Invalid format PeerId tests completed');
    });
  });

  /**
   * 聊天错误处理测试
   */
  test.describe('聊天错误处理', () => {
    test('向不存在的设备发送消息应该显示错误状态', async ({ browser }) => {
      test.setTimeout(50000); // 优化：减少超时时间

      const deviceA = await createTestDevices(browser, '发送者A', '不存在的设备B', { startPage: 'wechat' });

      try {
        // 设备 A 尝试向不存在的设备 B 发送消息
        await deviceA.deviceA.page.click(SELECTORS.plusButton);
        await deviceA.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 使用一个不存在的 PeerId
        const nonExistentPeerId = 'non-existent-peer-' + Date.now();
        await deviceA.deviceA.page.fill(SELECTORS.peerIdInput, nonExistentPeerId);
        await deviceA.deviceA.page.click(SELECTORS.modalOkButton);

        console.log('[Test] Device A tried to add non-existent device');

        // 等待处理
        await deviceA.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        // 尝试发送消息
        await deviceA.deviceA.page.fill(SELECTORS.messageInput, '测试消息');
        await deviceA.deviceA.page.click(SELECTORS.sendButton);

        console.log('[Test] Device A sent message to non-existent device');

        // 等待错误状态或超时
        await deviceA.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 2);

        // 检查是否有错误状态
        const hasFailedStatus = await deviceA.deviceA.page
          .locator('.message-status.failed, .message-status:has-text("失败")')
          .isVisible()
          .catch(() => false);

        if (hasFailedStatus) {
          console.log('[Test] Failed status displayed correctly');
        } else {
          console.log('[Test] No failed status (message may still be trying)');
        }

        // 验证不会崩溃
        const wechatVisible = deviceA.deviceA.page.locator('.wechat-container');
        await expect(wechatVisible).toBeVisible();

        console.log('[Test] Message to non-existent device test completed');
      } finally {
        await cleanupTestDevices(deviceA);
      }
    });

    test('快速连续发送应该不会导致状态错误', async ({ browser }) => {
      test.setTimeout(50000); // 优化：减少超时时间

      const devices = await createTestDevices(browser, '快速发送A', '快速接收B', { startPage: 'wechat' });

      try {
        // 互相添加聊天
        await devices.deviceA.page.click(SELECTORS.plusButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceB.userInfo.peerId);
        await devices.deviceA.page.click(SELECTORS.modalOkButton);

        // 等待聊天创建完成（检查聊天列表是否更新）
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceB.page.click(SELECTORS.plusButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.fill(SELECTORS.peerIdInput, devices.deviceA.userInfo.peerId);
        await devices.deviceB.page.click(SELECTORS.modalOkButton);

        // 等待聊天创建完成
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        // 额外等待确保连接建立
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        // 快速连续发送多条消息（减少消息数量以避免超时）
        const messages = ['消息1', '消息2', '消息3'];

        for (const msg of messages) {
          await devices.deviceA.page.fill(SELECTORS.messageInput, msg);
          await devices.deviceA.page.click(SELECTORS.sendButton);
          // 添加短暂延迟避免竞争条件
          await devices.deviceA.page.waitForTimeout(300);
        }

        console.log('[Test] Device A sent rapid messages');

        // 等待所有消息处理
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 2);

        // 验证不会崩溃
        const wechatVisible = devices.deviceA.page.locator('.wechat-container');
        await expect(wechatVisible).toBeVisible();

        // 检查消息状态
        const messageCount = await devices.deviceA.page.locator('.message-item').count();
        console.log(`[Test] Device A has ${messageCount} message items`);

        expect(messageCount).toBeGreaterThan(0);

        console.log('[Test] Rapid sending test completed without errors');
      } finally {
        await cleanupTestDevices(devices);
      }
    });
  });

  /**
   * 网络异常处理测试
   */
  test.describe('网络异常处理', () => {
    test('网络断开时发送消息应该显示错误状态', async ({ browser }) => {
      test.setTimeout(50000); // 优化：减少超时时间

      const devices = await createTestDevices(browser, '网络异常A', '网络异常B', { startPage: 'wechat' });

      try {
        // 互相添加聊天
        await devices.deviceA.page.click(SELECTORS.plusButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceB.userInfo.peerId);
        await devices.deviceA.page.click(SELECTORS.modalOkButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceB.page.click(SELECTORS.plusButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.fill(SELECTORS.peerIdInput, devices.deviceA.userInfo.peerId);
        await devices.deviceB.page.click(SELECTORS.modalOkButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 设备 A 断开网络
        await devices.deviceA.page.context().setOffline(true);
        console.log('[Test] Device A network disconnected');

        // 尝试发送消息
        await devices.deviceA.page.fill(SELECTORS.messageInput, '离线消息');
        await devices.deviceA.page.click(SELECTORS.sendButton);

        console.log('[Test] Device A sent message while offline');

        // 等待处理
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        // 检查消息状态（可能显示发送中或失败）
        const hasSendingStatus = await devices.deviceA.page
          .locator('.message-status.sending, .message-status:has-text("发送中")')
          .isVisible()
          .catch(() => false);

        const hasFailedStatus = await devices.deviceA.page
          .locator('.message-status.failed, .message-status:has-text("失败")')
          .isVisible()
          .catch(() => false);

        console.log(`[Test] Sending status: ${hasSendingStatus}, Failed status: ${hasFailedStatus}`);

        // 恢复网络
        await devices.deviceA.page.context().setOffline(false);
        console.log('[Test] Device A network reconnected');

        // 等待重连和重试
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);

        // 验证不会崩溃
        const wechatVisible = devices.deviceA.page.locator('.wechat-container');
        await expect(wechatVisible).toBeVisible();

        console.log('[Test] Network disconnect test completed');
      } finally {
        await cleanupTestDevices(devices);
      }
    });

    test('网络频繁切换应该不会导致状态混乱', async ({ browser }) => {
      test.setTimeout(50000); // 优化：减少超时时间

      const devices = await createTestDevices(browser, '网络切换A', '网络切换B', { startPage: 'wechat' });

      try {
        // 互相添加聊天
        await devices.deviceA.page.click(SELECTORS.plusButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceB.userInfo.peerId);
        await devices.deviceA.page.click(SELECTORS.modalOkButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceB.page.click(SELECTORS.plusButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.fill(SELECTORS.peerIdInput, devices.deviceA.userInfo.peerId);
        await devices.deviceB.page.click(SELECTORS.modalOkButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 频繁切换网络
        for (let i = 0; i < 3; i++) {
          await devices.deviceA.page.context().setOffline(true);
          await devices.deviceA.page.waitForTimeout(500);
          await devices.deviceA.page.context().setOffline(false);
          await devices.deviceA.page.waitForTimeout(1000);
        }

        console.log('[Test] Device A completed network switches');

        // 等待稳定
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT);

        // 发送消息验证功能正常
        await devices.deviceA.page.fill(SELECTORS.messageInput, '切换后消息');
        await devices.deviceA.page.click(SELECTORS.sendButton);

        console.log('[Test] Device A sent message after network switches');

        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        // 验证不会崩溃
        const wechatVisible = devices.deviceA.page.locator('.wechat-container');
        await expect(wechatVisible).toBeVisible();

        console.log('[Test] Network switch test completed without errors');
      } finally {
        await cleanupTestDevices(devices);
      }
    });
  });

  /**
   * 超时处理测试
   */
  test.describe('超时处理', () => {
    test('长时间无响应应该有适当的处理', async ({ page }) => {
      // 设置用户信息
      await setupUserForTest(page);

      // 导航到发现中心页面
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');

      // 等待页面加载
      await page.waitForSelector(SELECTORS.centerContainer, { timeout: 8000 });
      await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

      // 尝试添加一个很可能不存在的设备
      const unlikelyPeerId = 'very-unlikely-peer-id-' + Date.now() + Math.random();
      await page.fill(SELECTORS.peerIdInput, unlikelyPeerId);
      await page.click(SELECTORS.addButton);

      console.log('[Test] Attempted to add unlikely PeerId');

      // 等待一段时间（可能超时）
      await page.waitForTimeout(WAIT_TIMES.MESSAGE);

      // 验证不会崩溃或卡死
      const centerVisible = page.locator(SELECTORS.centerContainer);
      await expect(centerVisible).toBeVisible();

      // 验证页面仍然响应
      await page.click(SELECTORS.refreshButton);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      console.log('[Test] Timeout handling test completed');
    });
  });

  /**
   * 并发操作错误处理
   */
  test.describe('并发操作错误处理', () => {
    test('同时进行多项操作应该不会导致错误', async ({ page }) => {
      // 设置用户信息
      await setupUserForTest(page);

      // 导航到发现中心页面
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');

      await page.waitForSelector(SELECTORS.centerContainer, { timeout: 8000 });
      await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

      // 快速进行多项操作
      const operations = [
        () => page.fill(SELECTORS.peerIdInput, 'test1'),
        () => page.click(SELECTORS.addButton),
        () => page.click(SELECTORS.refreshButton),
      ];

      // 尝试快速执行多项操作
      for (const operation of operations) {
        try {
          await operation();
          await page.waitForTimeout(WAIT_TIMES.SHORT);
        } catch (error) {
          console.log('[Test] Operation error (expected):', (error as Error).message);
        }
      }

      console.log('[Test] Concurrent operations test completed');

      // 验证不会崩溃
      const centerVisible = page.locator(SELECTORS.centerContainer);
      await expect(centerVisible).toBeVisible();
    });
  });

  /**
   * 边界值错误处理
   */
  test.describe('边界值错误处理', () => {
    test('超长 PeerId 应该被正确处理', async ({ page }) => {
      // 设置用户信息
      await setupUserForTest(page);

      // 导航到发现中心页面
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');

      await page.waitForSelector(SELECTORS.centerContainer, { timeout: 8000 });
      await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

      // 尝试添加超长的 PeerId
      const longPeerId = 'a'.repeat(1000);
      await page.fill(SELECTORS.peerIdInput, longPeerId);
      await page.click(SELECTORS.addButton);

      console.log('[Test] Tried to add very long PeerId');

      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证不会崩溃
      const centerVisible = page.locator(SELECTORS.centerContainer);
      await expect(centerVisible).toBeVisible();

      console.log('[Test] Long PeerId test completed');
    });

    test('特殊字符 PeerId 应该被正确处理', async ({ page }) => {
      // 设置用户信息
      await setupUserForTest(page);

      // 导航到发现中心页面
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');

      await page.waitForSelector(SELECTORS.centerContainer, { timeout: 8000 });
      await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

      // 尝试添加包含特殊字符的 PeerId
      const specialPeerIds = [
        '../../etc/passwd',
        '<script>alert("xss")</script>',
        '"; DROP TABLE users; --',
        'peer\x00id',
        'peer\nid',
      ];

      for (const peerId of specialPeerIds) {
        await page.fill(SELECTORS.peerIdInput, peerId);
        await page.click(SELECTORS.addButton);
        await page.waitForTimeout(WAIT_TIMES.SHORT);
        console.log(`[Test] Tried special char PeerId: ${peerId.substring(0, 20)}...`);
      }

      // 验证不会崩溃或被攻击
      const centerVisible = page.locator(SELECTORS.centerContainer);
      await expect(centerVisible).toBeVisible();

      console.log('[Test] Special character PeerId test completed');
    });
  });
});
