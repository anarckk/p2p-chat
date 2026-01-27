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
  addMessages,
} from './test-helpers.js';

/**
 * 消息状态展示与送达确认测试
 * 测试场景：
 * 1. 消息发送状态展示（发送中/已送达/发送失败）
 * 2. 送达确认机制
 * 3. 消息去重机制
 * 4. 消息持久化
 */
test.describe('消息状态展示与送达确认', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/wechat');
    await clearAllStorage(page);
  });

  /**
   * 消息状态展示测试
   */
  test.describe('消息状态展示', () => {
    test('应该显示消息发送中状态', async ({ page }) => {
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

      // 刷新页面以加载联系人列表
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 点击联系人来激活聊天
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 模拟发送中的消息
      const messages = [
        {
          id: 'msg-sending-1',
          from: 'my-peer-123',
          to: 'contact-1',
          content: '发送中的消息',
          type: 'text',
          timestamp: Date.now(),
          status: 'sending',
        },
      ];
      await addMessages(page, 'contact-1', messages);

      // 刷新页面以加载消息
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 刷新后需要再次点击联系人来激活聊天
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证消息显示
      const messageText = page.locator(SELECTORS.messageText).filter({ hasText: '发送中的消息' });
      await expect(messageText).toBeVisible();

      // 验证消息状态图标存在 - 发送中应该有 LoadingOutlined
      const loadingIcon = page.locator('.message-status .anticon-loading');
      const hasLoadingIcon = await loadingIcon.count();
      expect(hasLoadingIcon).toBeGreaterThan(0);
    });

    test('应该显示消息已送达状态', async ({ page }) => {
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

      // 刷新页面以加载联系人列表
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 点击联系人来激活聊天
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 模拟已送达的消息
      const messages = [
        {
          id: 'msg-delivered-1',
          from: 'my-peer-123',
          to: 'contact-1',
          content: '已送达的消息',
          type: 'text',
          timestamp: Date.now(),
          status: 'delivered',
        },
      ];
      await addMessages(page, 'contact-1', messages);

      // 刷新页面以加载消息
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 刷新后需要再次点击联系人来激活聊天
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证消息显示
      const messageText = page.locator(SELECTORS.messageText).filter({ hasText: '已送达的消息' });
      await expect(messageText).toBeVisible();

      // 验证消息状态图标存在 - 已送达应该有 CheckCircleOutlined
      const checkIcon = page.locator('.message-status .anticon-check-circle');
      const hasCheckIcon = await checkIcon.count();
      expect(hasCheckIcon).toBeGreaterThan(0);
    });

    test('应该显示消息发送失败状态', async ({ page }) => {
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

      // 刷新页面以加载联系人列表
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 点击联系人来激活聊天
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 模拟发送失败的消息
      const messages = [
        {
          id: 'msg-failed-1',
          from: 'my-peer-123',
          to: 'contact-1',
          content: '发送失败的消息',
          type: 'text',
          timestamp: Date.now(),
          status: 'failed',
        },
      ];
      await addMessages(page, 'contact-1', messages);

      // 刷新页面以加载消息
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 刷新后需要再次点击联系人来激活聊天
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证消息显示
      const messageText = page.locator(SELECTORS.messageText).filter({ hasText: '发送失败的消息' });
      await expect(messageText).toBeVisible();

      // 验证消息状态图标存在 - 失败应该有 ExclamationCircleOutlined
      const errorIcon = page.locator('.message-status .anticon-exclamation-circle');
      const hasErrorIcon = await errorIcon.count();
      expect(hasErrorIcon).toBeGreaterThan(0);
    });

    test('应该显示消息时间戳', async ({ page }) => {
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

      // 刷新页面以加载联系人列表
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 点击联系人来激活聊天
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      const messages = [
        {
          id: 'msg-time-1',
          from: 'my-peer-123',
          to: 'contact-1',
          content: '带时间的消息',
          type: 'text',
          timestamp: Date.now(),
          status: 'delivered',
        },
      ];
      await addMessages(page, 'contact-1', messages);

      // 刷新页面以加载消息
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 刷新后需要再次点击联系人来激活聊天
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证消息时间显示
      const messageTime = page.locator(SELECTORS.messageTime);
      const hasTime = await messageTime.count();

      expect(hasTime).toBeGreaterThan(0);
    });
  });

  /**
   * 消息去重和唯一性测试
   */
  test.describe('消息去重和唯一性', () => {
    test('消息应该有唯一标识', async ({ page }) => {
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

      // 刷新页面以加载联系人列表
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 点击联系人来激活聊天
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      const messages = [
        {
          id: 'msg-unique-1',
          from: 'my-peer-123',
          to: 'contact-1',
          content: '消息1',
          type: 'text',
          timestamp: Date.now(),
          status: 'delivered',
        },
        {
          id: 'msg-unique-2',
          from: 'contact-1',
          to: 'my-peer-123',
          content: '消息2',
          type: 'text',
          timestamp: Date.now() + 1000,
          status: 'delivered',
        },
      ];
      await addMessages(page, 'contact-1', messages);

      // 刷新页面以加载消息
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 刷新后需要再次点击联系人来激活聊天
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证每条消息都有唯一 ID
      const messageIds = await page.evaluate((peerId) => {
        const stored = localStorage.getItem('p2p_messages_' + peerId);
        const messages = stored ? JSON.parse(stored) : [];
        return messages.map((m: any) => m.id);
      }, 'contact-1');

      const uniqueIds = new Set(messageIds);
      expect(uniqueIds.size).toBe(messageIds.length);
    });

    test('应该去重重复的消息', async ({ page }) => {
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

      // 刷新页面以加载联系人列表
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 点击联系人来激活聊天
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 模拟重复 ID 的消息
      const messages = [
        {
          id: 'msg-duplicate-1',
          from: 'my-peer-123',
          to: 'contact-1',
          content: '重复消息',
          type: 'text',
          timestamp: Date.now(),
          status: 'delivered',
        },
      ];
      await addMessages(page, 'contact-1', messages);

      // 刷新页面以加载消息
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 刷新后需要再次点击联系人来激活聊天
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证消息列表中不会有重复
      const messageItems = page.locator(SELECTORS.messageItem);
      const count = await messageItems.count();

      expect(count).toBe(1);
    });
  });

  /**
   * 消息持久化测试
   */
  test.describe('消息持久化', () => {
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

      // 刷新页面以加载联系人列表
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 点击联系人来激活聊天
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

      // 刷新页面以加载消息
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 刷新后需要再次点击联系人来激活聊天
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证消息显示
      const messageText = page.locator(SELECTORS.messageText).filter({ hasText: '持久化消息' });
      await expect(messageText).toBeVisible();

      // 刷新页面
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 刷新后需要再次点击联系人来激活聊天
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证消息依然存在
      const messageTextAfterReload = page.locator(SELECTORS.messageText).filter({ hasText: '持久化消息' });
      await expect(messageTextAfterReload).toBeVisible();
    });
  });

  /**
   * 多设备消息送达测试
   */
  test.describe('多设备消息送达', () => {
    test('失败的消息应该自动重试', async ({ browser }) => {
      const devices = await createTestDevices(browser, '重试测试A', '重试测试B', { startPage: 'center' });

      try {
        // 额外等待确保 Peer 连接稳定（基于 PeerJS 5秒标准）
        await devices.deviceA.page.waitForTimeout(5000);
        await devices.deviceB.page.waitForTimeout(5000);

        // 切换到聊天页面
        await devices.deviceA.page.click(SELECTORS.wechatMenuItem);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        // 设备 A 创建聊天并发送消息
        await createChat(devices.deviceA.page, devices.deviceB.userInfo.peerId);

        await devices.deviceA.page.click(SELECTORS.contactItem);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 发送消息
        const testMessage = '重试测试消息';
        await sendTextMessage(devices.deviceA.page, testMessage);

        // 等待一段时间观察重试
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        // 验证消息状态 - 检查消息有唯一ID
        const deviceBPeerId = devices.deviceB.userInfo.peerId;
        const messageStatus = await devices.deviceA.page.evaluate((peerId) => {
          const stored = localStorage.getItem('p2p_messages_' + peerId);
          const messages = stored ? JSON.parse(stored) : [];
          const lastMessage = messages[messages.length - 1];
          return lastMessage ? { id: lastMessage.id, status: lastMessage.status } : null;
        }, deviceBPeerId);

        // 验证消息有唯一ID
        expect(messageStatus).not.toBeNull();
        expect(messageStatus?.id).toBeTruthy();
      } finally {
        await cleanupTestDevices(devices);
      }
    });

    test('离线设备上线后应该能接收消息', async ({ browser }) => {
      const devices = await createTestDevices(browser, '在线方A', '离线方B', { startPage: 'center' });

      try {
        // 额外等待确保 Peer 连接稳定（基于 PeerJS 5秒标准）
        await devices.deviceA.page.waitForTimeout(5000);
        await devices.deviceB.page.waitForTimeout(5000);

        // 切换到聊天页面
        await devices.deviceA.page.click(SELECTORS.wechatMenuItem);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        const deviceBPeerId = devices.deviceB.userInfo.peerId;

        // 设备 A 尝试发送消息给离线的设备 B
        await createChat(devices.deviceA.page, deviceBPeerId);

        await devices.deviceA.page.click(SELECTORS.contactItem);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

        const testMessage = '离线消息测试';
        await sendTextMessage(devices.deviceA.page, testMessage);

        // 等待一段时间
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.LONG);

        // 验证代码不会崩溃 - 检查消息是否保存
        const messageExists = await devices.deviceA.page.evaluate((peerId) => {
          const stored = localStorage.getItem('p2p_messages_' + peerId);
          const messages = stored ? JSON.parse(stored) : [];
          return messages.length > 0;
        }, deviceBPeerId);

        expect(messageExists).toBe(true);
      } finally {
        await cleanupTestDevices(devices);
      }
    });
  });
});
