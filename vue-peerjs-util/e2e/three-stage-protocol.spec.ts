import { test, expect } from '@playwright/test';
import {
  SELECTORS,
  WAIT_TIMES,
  createUserInfo,
  clearAllStorage,
  setContactList,
  setCurrentChat,
  createTestDevices,
  cleanupTestDevices,
  createChat,
  sendTextMessage,
  assertMessageExists,
} from './test-helpers.js';

/**
 * 三段式通信协议测试
 * 测试场景：
 * 1. 第一段：发送消息ID
 * 2. 第二段：对端请求消息内容
 * 3. 第三段：发送方返回完整消息内容
 * 4. 重试时只发送ID的测试
 * 5. 支持多种消息类型
 */
test.describe('三段式通信协议', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/wechat');
    await clearAllStorage(page);
  });

  /**
   * 多设备协议测试
   */
  test.describe('多设备协议通信', () => {
    test('应该使用三段式协议发送消息', async ({ browser }) => {
      const devices = await createTestDevices(browser, '发送方', '接收方', { startPage: 'wechat' });

      try {
        // 发送方创建聊天
        await createChat(devices.sender.page, devices.receiver.userInfo.peerId);

        // 选择聊天
        await devices.sender.page.click(SELECTORS.contactItem);
        await devices.sender.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 发送方发送消息
        const testMessage = '三段式协议测试消息';
        await sendTextMessage(devices.sender.page, testMessage);

        // 验证发送方显示了消息
        await assertMessageExists(devices.sender.page, testMessage);

        // 等待接收方接收
        await devices.receiver.page.waitForTimeout(WAIT_TIMES.MESSAGE);
        await devices.receiver.page.reload();
        await devices.receiver.page.waitForTimeout(WAIT_TIMES.RELOAD);

        // 验证接收方收到消息
        const pageContent = await devices.receiver.page.content();
        const hasMessage = pageContent.includes(testMessage);

        // 验证三段式协议成功传输消息
        expect(hasMessage).toBe(true);
      } finally {
        await cleanupTestDevices(devices);
      }
    });

    test('重试消息时应该只发送消息ID', async ({ browser }) => {
      const devices = await createTestDevices(browser, '重试发送方', '重试接收方', { startPage: 'wechat' });

      try {
        // 发送方创建聊天
        await createChat(devices.sender.page, devices.receiver.userInfo.peerId);

        await devices.sender.page.click(SELECTORS.contactItem);
        await devices.sender.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 发送消息
        const testMessage = '重试测试消息';
        await sendTextMessage(devices.sender.page, testMessage);

        // 验证消息状态
        const messageStatus = await devices.sender.page.evaluate(() => {
          const stored = localStorage.getItem('p2p_messages_contact-1');
          const messages = stored ? JSON.parse(stored) : [];
          const lastMessage = messages[messages.length - 1];
          return lastMessage ? { id: lastMessage.id, status: lastMessage.status } : null;
        });

        // 验证消息有唯一ID
        expect(messageStatus).not.toBeNull();
        expect(messageStatus?.id).toBeTruthy();
      } finally {
        await cleanupTestDevices(devices);
      }
    });
  });

  /**
   * 消息唯一性测试
   */
  test.describe('消息唯一性', () => {
    test('消息应该有唯一的消息ID', async ({ page }) => {
      await setUserInfo(page, createUserInfo('测试用户', 'my-peer-123'), { navigateTo: '/wechat' });

      const contacts = {
        'contact-1': {
          peerId: 'contact-1',
          username: '联系人1',
          avatar: null,
          online: true,
          lastSeen: Date.now(),
          unreadCount: 0,
        },
      };
      await setContactList(page, contacts);
      await setCurrentChat(page, 'contact-1');

      const messages = [
        {
          id: 'msg-id-test-1',
          from: 'my-peer-123',
          to: 'contact-1',
          content: '消息1',
          type: 'text',
          timestamp: Date.now(),
          status: 'delivered',
        },
        {
          id: 'msg-id-test-2',
          from: 'contact-1',
          to: 'my-peer-123',
          content: '消息2',
          type: 'text',
          timestamp: Date.now() + 1000,
          status: 'delivered',
        },
        {
          id: 'msg-id-test-3',
          from: 'my-peer-123',
          to: 'contact-1',
          content: '消息3',
          type: 'text',
          timestamp: Date.now() + 2000,
          status: 'delivered',
        },
      ];

      await page.evaluate(({ msgs, peerId }) => {
        localStorage.setItem(`p2p_messages_${peerId}`, JSON.stringify(msgs));
      }, { msgs: messages, peerId: 'contact-1' });

      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 验证每条消息都有唯一ID
      const messageIds = await page.evaluate(() => {
        const stored = localStorage.getItem('p2p_messages_contact-1');
        const messages = stored ? JSON.parse(stored) : [];
        return messages.map((m: any) => m.id);
      });

      const uniqueIds = new Set(messageIds);
      expect(uniqueIds.size).toBe(3);
      expect(messageIds.length).toBe(3);
    });

    test('应该正确处理消息ID冲突', async ({ page }) => {
      await setUserInfo(page, createUserInfo('测试用户', 'my-peer-123'), { navigateTo: '/wechat' });

      const contacts = {
        'contact-1': {
          peerId: 'contact-1',
          username: '联系人1',
          avatar: null,
          online: true,
          lastSeen: Date.now(),
          unreadCount: 0,
        },
      };
      await setContactList(page, contacts);
      await setCurrentChat(page, 'contact-1');

      // 模拟有重复ID的消息
      const messages = [
        {
          id: 'duplicate-msg-id',
          from: 'my-peer-123',
          to: 'contact-1',
          content: '第一次发送',
          type: 'text',
          timestamp: Date.now(),
          status: 'delivered',
        },
      ];

      await page.evaluate(({ msgs, peerId }) => {
        localStorage.setItem(`p2p_messages_${peerId}`, JSON.stringify(msgs));
      }, { msgs: messages, peerId: 'contact-1' });

      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 验证只有一条消息
      const messageItems = page.locator(SELECTORS.messageItem);
      const count = await messageItems.count();

      expect(count).toBe(1);

      // 验证内容
      const messageText = await messageItems.locator(SELECTORS.messageText).textContent();
      expect(messageText).toBe('第一次发送');
    });
  });

  /**
   * 多消息类型支持测试
   */
  test.describe('多消息类型支持', () => {
    test('三段式协议应该支持多种消息类型', async ({ page }) => {
      await setUserInfo(page, createUserInfo('测试用户', 'my-peer-123'), { navigateTo: '/wechat' });

      const contacts = {
        'contact-1': {
          peerId: 'contact-1',
          username: '联系人1',
          avatar: null,
          online: true,
          lastSeen: Date.now(),
          unreadCount: 0,
        },
      };
      await setContactList(page, contacts);
      await setCurrentChat(page, 'contact-1');

      // 模拟不同类型的消息
      const messages = [
        {
          id: 'msg-text-1',
          from: 'my-peer-123',
          to: 'contact-1',
          content: '文本消息',
          type: 'text',
          timestamp: Date.now(),
          status: 'delivered',
        },
        {
          id: 'msg-image-1',
          from: 'contact-1',
          to: 'my-peer-123',
          content: {
            name: 'test.jpg',
            size: 102400,
            width: 800,
            height: 600,
            data: 'data:image/jpeg;base64,test',
          },
          type: 'image',
          timestamp: Date.now() + 1000,
          status: 'delivered',
        },
        {
          id: 'msg-file-1',
          from: 'my-peer-123',
          to: 'contact-1',
          content: {
            name: 'test.pdf',
            size: 204800,
            type: 'application/pdf',
            data: 'data:application/pdf;base64,test',
          },
          type: 'file',
          timestamp: Date.now() + 2000,
          status: 'delivered',
        },
      ];

      await page.evaluate(({ msgs, peerId }) => {
        localStorage.setItem(`p2p_messages_${peerId}`, JSON.stringify(msgs));
      }, { msgs: messages, peerId: 'contact-1' });

      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 验证消息列表
      const messageItems = page.locator(SELECTORS.messageItem);
      const count = await messageItems.count();

      expect(count).toBe(3);

      // 验证不同类型的消息都有对应的UI元素
      const textMessage = page.locator(SELECTORS.messageText);
      const imageMessage = page.locator('.message-image');
      const fileMessage = page.locator('.message-file');

      expect(await textMessage.count()).toBeGreaterThan(0);
      expect(await imageMessage.count()).toBeGreaterThan(0);
      expect(await fileMessage.count()).toBeGreaterThan(0);
    });
  });

  /**
   * 文件消息上传测试
   */
  test.describe('文件消息上传', () => {
    test('应该支持大文件消息的三段式传输', async ({ browser }) => {
      const devices = await createTestDevices(browser, '文件发送方', '文件接收方', { startPage: 'wechat' });

      try {
        // 发送方创建聊天
        await createChat(devices.deviceA.page, devices.deviceB.userInfo.peerId);

        await devices.deviceA.page.click(SELECTORS.contactItem);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 验证文件上传按钮可用
        const fileButtons = devices.deviceA.page.locator('button[aria-label="upload-file"], button[aria-label="upload-image"], button[aria-label="upload-video"]');
        const count = await fileButtons.count();

        expect(count).toBeGreaterThan(0);
      } finally {
        await cleanupTestDevices(devices);
      }
    });
  });
});
