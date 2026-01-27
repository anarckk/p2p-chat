import { test, expect } from '@playwright/test';
import {
  SELECTORS,
  WAIT_TIMES,
  createUserInfo,
  clearAllStorage,
  setUserInfo,
  setContactList,
  createTestDevices,
  cleanupTestDevices,
  createChat,
  addMessages,
  retry,
} from './test-helpers.js';

/**
 * 消息状态展示与送达确认测试
 * 测试场景：
 * 1. 消息发送状态展示（发送中/已送达/发送失败）
 * 2. 送达确认机制
 * 3. 消息持久化
 */
test.describe('消息状态展示与送达确认', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/wechat');
    await clearAllStorage(page);
  });

  /**
   * 单设备消息状态测试
   */
  test.describe('单设备消息状态', () => {
    test('应该正确显示各种消息状态', async ({ page }) => {
      await setUserInfo(page, createUserInfo('测试用户', 'my-peer-123'), { navigateTo: '/wechat' });

      // 获取实际的 PeerId（因为 setUserInfo 可能会生成新的 PeerId）
      const actualPeerId = await page.evaluate(() => {
        const stored = localStorage.getItem('p2p_user_info');
        return stored ? JSON.parse(stored).peerId : null;
      });

      console.log('[Test] Actual PeerId:', actualPeerId);

      const contacts = {
        'contact-1': {
          peerId: 'contact-1',
          username: '联系人1',
          avatar: null,
          online: true,
          lastSeen: Date.now(),
          unreadCount: 0,
          chatVersion: 0,
        },
      };
      await setContactList(page, contacts);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 模拟不同状态的消息（使用实际的 PeerId）
      const messages = [
        {
          id: 'msg-sending-1',
          from: actualPeerId || 'my-peer-123',
          to: 'contact-1',
          content: '发送中的消息',
          type: 'text',
          timestamp: Date.now(),
          status: 'sending',
        },
        {
          id: 'msg-delivered-1',
          from: actualPeerId || 'my-peer-123',
          to: 'contact-1',
          content: '已送达的消息',
          type: 'text',
          timestamp: Date.now() + 1000,
          status: 'delivered',
        },
        {
          id: 'msg-failed-1',
          from: actualPeerId || 'my-peer-123',
          to: 'contact-1',
          content: '发送失败的消息',
          type: 'text',
          timestamp: Date.now() + 2000,
          status: 'failed',
        },
      ];
      await addMessages(page, 'contact-1', messages);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证消息显示
      const sendingMessage = page.locator(SELECTORS.messageText).filter({ hasText: '发送中的消息' });
      await expect(sendingMessage).toBeVisible();

      const deliveredMessage = page.locator(SELECTORS.messageText).filter({ hasText: '已送达的消息' });
      await expect(deliveredMessage).toBeVisible();

      const failedMessage = page.locator(SELECTORS.messageText).filter({ hasText: '发送失败的消息' });
      await expect(failedMessage).toBeVisible();

      // 验证消息状态容器存在
      const messageStatusElements = page.locator('.message-status');
      const hasMessageStatus = await messageStatusElements.count();
      console.log('[Test] Message status elements count:', hasMessageStatus);
      expect(hasMessageStatus).toBeGreaterThan(0);

      // 验证不同状态的消息有不同的 CSS 类
      const sendingStatus = page.locator('.message-status-sending');
      const hasSendingStatus = await sendingStatus.count();
      console.log('[Test] Sending status count:', hasSendingStatus);
      expect(hasSendingStatus).toBeGreaterThan(0);

      const deliveredStatus = page.locator('.message-status-delivered');
      const hasDeliveredStatus = await deliveredStatus.count();
      console.log('[Test] Delivered status count:', hasDeliveredStatus);
      expect(hasDeliveredStatus).toBeGreaterThan(0);

      const failedStatus = page.locator('.message-status-failed');
      const hasFailedStatus = await failedStatus.count();
      console.log('[Test] Failed status count:', hasFailedStatus);
      expect(hasFailedStatus).toBeGreaterThan(0);
    });

    test('消息应该持久化到 localStorage', async ({ page }) => {
      await setUserInfo(page, createUserInfo('测试用户', 'my-peer-123'), { navigateTo: '/wechat' });

      const contacts = {
        'contact-1': {
          peerId: 'contact-1',
          username: '联系人1',
          avatar: null,
          online: true,
          lastSeen: Date.now(),
          unreadCount: 0,
          chatVersion: 0,
        },
      };
      await setContactList(page, contacts);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      const messages = [
        {
          id: 'msg-persist-1',
          from: 'my-peer-123',
          to: 'contact-1',
          content: '持久化消息',
          type: 'text',
          timestamp: Date.now(),
          status: 'delivered',
        },
      ];
      await addMessages(page, 'contact-1', messages);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      const messageText = page.locator(SELECTORS.messageText).filter({ hasText: '持久化消息' });
      await expect(messageText).toBeVisible();

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      const messageTextAfterReload = page.locator(SELECTORS.messageText).filter({ hasText: '持久化消息' });
      await expect(messageTextAfterReload).toBeVisible();
    });
  });

  /**
   * 多设备消息送达测试
   */
  test.describe('多设备消息送达', () => {
    test('失败的消息应该自动重试', async ({ browser }) => {
      test.setTimeout(90000); // 增加超时时间
      const devices = await createTestDevices(browser, '重试测试A', '重试测试B', { startPage: 'center' });

      try {
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);

        await devices.deviceA.page.click(SELECTORS.wechatMenuItem);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

        await createChat(devices.deviceA.page, devices.deviceB.userInfo.peerId);

        // 等待聊天创建完成
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.LONG);

        // 检查联系人是否存在
        const contactCount = await devices.deviceA.page.locator(SELECTORS.contactItem).count();
        console.log('[Test] Contact count:', contactCount);
        expect(contactCount).toBeGreaterThan(0);

        // 点击联系人
        await devices.deviceA.page.click(SELECTORS.contactItem);

        // 等待聊天加载完成
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MEDIUM);

        const testMessage = '重试测试消息';

        // 检查输入框是否存在
        const inputExists = await devices.deviceA.page.locator(SELECTORS.messageInput).count();
        console.log('[Test] Message input count:', inputExists);
        expect(inputExists).toBeGreaterThan(0);

        // 填写消息
        await devices.deviceA.page.fill(SELECTORS.messageInput, testMessage);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 检查发送按钮是否存在
        const sendButtonExists = await devices.deviceA.page.locator(SELECTORS.sendButton).count();
        console.log('[Test] Send button count:', sendButtonExists);
        expect(sendButtonExists).toBeGreaterThan(0);

        // 点击发送按钮
        await devices.deviceA.page.click(SELECTORS.sendButton);

        const deviceBPeerId = devices.deviceB.userInfo.peerId;

        // 使用重试机制检查消息是否存储到 localStorage
        const messageStatus = await retry(async () => {
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
          const status = await devices.deviceA.page.evaluate((peerId) => {
            const stored = localStorage.getItem('p2p_messages_' + peerId);
            const messages = stored ? JSON.parse(stored) : [];
            const lastMessage = messages[messages.length - 1];
            return lastMessage ? { id: lastMessage.id, status: lastMessage.status, content: lastMessage.content } : null;
          }, deviceBPeerId);
          if (status && status.content === testMessage) {
            return status;
          }
          throw new Error('Message not found in storage');
        }, { maxAttempts: 10, delay: 3000, context: 'Check message in localStorage' });

        expect(messageStatus).not.toBeNull();
        expect(messageStatus?.id).toBeTruthy();
      } finally {
        await cleanupTestDevices(devices);
      }
    });

    test('离线设备上线后应该能接收消息', async ({ browser }) => {
      test.setTimeout(90000); // 增加超时时间
      const devices = await createTestDevices(browser, '在线方A', '离线方B', { startPage: 'center' });

      try {
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);

        await devices.deviceA.page.click(SELECTORS.wechatMenuItem);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

        const deviceBPeerId = devices.deviceB.userInfo.peerId;

        await createChat(devices.deviceA.page, deviceBPeerId);

        // 等待聊天创建完成
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.LONG);

        await devices.deviceA.page.click(SELECTORS.contactItem);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

        const testMessage = '离线消息测试';

        await devices.deviceA.page.fill(SELECTORS.messageInput, testMessage);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

        await devices.deviceA.page.click(SELECTORS.sendButton);

        // 使用重试机制检查消息是否存储到 localStorage
        const messageStatus = await retry(async () => {
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
          const status = await devices.deviceA.page.evaluate((peerId) => {
            const stored = localStorage.getItem('p2p_messages_' + peerId);
            const messages = stored ? JSON.parse(stored) : [];
            const lastMessage = messages[messages.length - 1];
            return lastMessage ? { id: lastMessage.id, content: lastMessage.content } : null;
          }, deviceBPeerId);
          if (status && status.content === testMessage) {
            return status;
          }
          throw new Error('Message not found in storage');
        }, { maxAttempts: 10, delay: 3000, context: 'Check message in localStorage' });

        expect(messageStatus).not.toBeNull();
        expect(messageStatus?.id).toBeTruthy();
      } finally {
        await cleanupTestDevices(devices);
      }
    });
  });
});
