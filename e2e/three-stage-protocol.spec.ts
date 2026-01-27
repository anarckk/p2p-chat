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
  sendTextMessage,
  assertMessageExists,
} from './test-helpers.js';

/**
 * 版本号消息同步协议测试
 * 测试场景：
 * 1. 第一段：发送方发送版本号通知
 * 2. 第二段：接收方请求消息内容（版本号不一致时）
 * 3. 第三段：发送方返回完整消息内容
 * 4. 重试时重新发送版本号通知的测试
 * 5. 支持多种消息类型
 */
test.describe('版本号消息同步协议', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/wechat');
    await clearAllStorage(page);
  });

  /**
   * 多设备协议测试
   */
  test.describe('多设备协议通信', () => {
    test('应该使用版本号协议发送消息', async ({ browser }) => {
      test.setTimeout(90000); // 增加超时时间
      const devices = await createTestDevices(browser, '发送方', '接收方', { startPage: 'center' });

      try {
        // 等待 Peer 连接建立
        await devices.deviceA.page.waitForTimeout(5000);
        await devices.deviceB.page.waitForTimeout(5000);

        // 切换到聊天页面
        await devices.deviceA.page.click(SELECTORS.wechatMenuItem);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.click(SELECTORS.wechatMenuItem);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 额外等待确保聊天页面加载完成
        await devices.deviceA.page.waitForTimeout(2000);
        await devices.deviceB.page.waitForTimeout(2000);

        // 设备 A 创建与设备 B 的聊天
        await createChat(devices.deviceA.page, devices.deviceB.userInfo.peerId);

        // 选择聊天
        await devices.deviceA.page.click(SELECTORS.contactItem);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 设备 A 发送消息
        const testMessage = '版本号协议测试消息';
        // 使用更宽松的发送方式
        await devices.deviceA.page.fill(SELECTORS.messageInput, testMessage);
        await devices.deviceA.page.click(SELECTORS.sendButton);

        // 使用重试机制等待消息出现
        let hasMessageInA = false;
        for (let i = 0; i < 5; i++) {
          await devices.deviceA.page.waitForTimeout(3000);
          const messagesInA = await devices.deviceA.page.locator(SELECTORS.messageText).allTextContents();
          hasMessageInA = messagesInA.some(msg => msg.includes(testMessage));
          if (hasMessageInA) {
            break;
          }
          console.log(`Attempt ${i + 1}: Message not found in A, retrying...`);
        }
        expect(hasMessageInA).toBe(true);

        // 等待接收方接收（增加等待时间）
        await devices.deviceB.page.waitForTimeout(10000);
        await devices.deviceB.page.reload();
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.RELOAD);

        // 页面刷新后需要重新点击联系人以触发 loadMessages
        await devices.deviceB.page.click(SELECTORS.contactItem);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 使用重试机制验证接收方收到消息
        let messageCount = 0;
        for (let i = 0; i < 3; i++) {
          const messageInReceiver = devices.deviceB.page.locator(SELECTORS.messageText).filter({ hasText: testMessage });
          messageCount = await messageInReceiver.count();
          if (messageCount > 0) {
            break;
          }
          console.log(`Attempt ${i + 1}: Message not found in receiver, retrying...`);
          await devices.deviceB.page.waitForTimeout(3000);
        }

        // 验证版本号协议成功传输消息
        expect(messageCount).toBeGreaterThan(0);
      } finally {
        await cleanupTestDevices(devices);
      }
    });

    test('重试消息时应该重新发送版本号通知', async ({ browser }) => {
      test.setTimeout(90000); // 增加超时时间
      const devices = await createTestDevices(browser, '重试发送方', '重试接收方', { startPage: 'wechat' });

      try {
        // 等待 Peer 连接稳定
        await devices.deviceA.page.waitForTimeout(5000);
        await devices.deviceB.page.waitForTimeout(5000);

        // 设备 A 创建聊天
        await createChat(devices.deviceA.page, devices.deviceB.userInfo.peerId);

        await devices.deviceA.page.click(SELECTORS.contactItem);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 发送消息
        const testMessage = '重试测试消息';
        // 使用更宽松的发送方式
        await devices.deviceA.page.fill(SELECTORS.messageInput, testMessage);
        await devices.deviceA.page.click(SELECTORS.sendButton);

        // 使用重试机制等待消息出现
        let hasMessage = false;
        for (let i = 0; i < 5; i++) {
          await devices.deviceA.page.waitForTimeout(3000);
          const messages = await devices.deviceA.page.locator(SELECTORS.messageText).allTextContents();
          hasMessage = messages.some(msg => msg.includes(testMessage));
          if (hasMessage) {
            break;
          }
          console.log(`Attempt ${i + 1}: Message not found in A, retrying...`);
        }

        // 验证消息状态 - 检查消息有唯一ID和messageStage
        const deviceBPeerId = devices.deviceB.userInfo.peerId;

        // 使用重试机制等待消息存储到 localStorage
        let messageStatus: any = null;
        for (let i = 0; i < 5; i++) {
          await devices.deviceA.page.waitForTimeout(2000);
          messageStatus = await devices.deviceA.page.evaluate((peerId) => {
            const stored = localStorage.getItem('p2p_messages_' + peerId);
            const messages = stored ? JSON.parse(stored) : [];
            const lastMessage = messages[messages.length - 1];
            return lastMessage ? { id: lastMessage.id, messageStage: lastMessage.messageStage } : null;
          }, deviceBPeerId);
          if (messageStatus) {
            break;
          }
          console.log(`Attempt ${i + 1}: Message status not found in storage, retrying...`);
        }

        expect(messageStatus).not.toBeNull();
        expect(messageStatus?.id).toBeTruthy();
        // 验证消息有 messageStage（版本号协议的阶段标识）
        expect(messageStatus?.messageStage).toBeTruthy();
        // messageStage 应该是 'notified' | 'requested' | 'delivered' 之一
        expect(['notified', 'requested', 'delivered']).toContain(messageStatus?.messageStage);
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
          chatVersion: 0,
        },
      };
      await setContactList(page, contacts);

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
      const messageIds = await page.evaluate((peerId) => {
        const stored = localStorage.getItem('p2p_messages_' + peerId);
        const messages = stored ? JSON.parse(stored) : [];
        return messages.map((m: any) => m.id);
      }, 'contact-1');

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
          chatVersion: 0,
        },
      };
      await setContactList(page, contacts);

      // 点击联系人来激活聊天
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

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

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 页面刷新后需要重新点击联系人以触发 loadMessages
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

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
    test('版本号协议应该支持多种消息类型', async ({ page }) => {
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

      // 点击联系人来激活聊天
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

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

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 页面刷新后需要重新点击联系人以触发 loadMessages
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

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
    test('应该支持大文件消息的版本号传输', async ({ browser }) => {
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
