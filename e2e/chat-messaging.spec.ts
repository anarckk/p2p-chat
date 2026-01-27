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
  assertEmptyState,
} from './test-helpers.js';

/**
 * 聊天消息发送与接收测试
 * 测试场景：
 * 1. 设备 A 向设备 B 发送文本消息，设备 B 能正常接收
 * 2. 新增聊天（输入 PeerId）
 * 3. 聊天列表显示
 * 4. 被动添加聊天（对端主动发起通信时自动加入）
 * 5. 聊天删除功能
 */
test.describe('聊天消息发送与接收', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/wechat');
    await clearAllStorage(page);
  });

  /**
   * 多设备消息发送测试
   */
  test.describe('多设备消息发送', () => {
    test('设备 A 向设备 B 发送文本消息，设备 B 能正常接收', async ({ browser }) => {
      const devices = await createTestDevices(browser, '发送者A', '接收者B', { startPage: 'center' });

      console.log('[Test] Device A UserInfo:', devices.deviceA.userInfo);
      console.log('[Test] Device B UserInfo:', devices.deviceB.userInfo);

      // 在操作前注册控制台监听器以捕获调试日志
      const deviceALogs: string[] = [];
      const deviceBLogs: string[] = [];
      devices.deviceA.page.on('console', msg => deviceALogs.push(msg.text()));
      devices.deviceB.page.on('console', msg => deviceBLogs.push(msg.text()));

      try {
        // 额外等待确保两个设备的 Peer 连接都稳定（基于 PeerJS 5秒标准）
        await devices.deviceA.page.waitForTimeout(5000);
        await devices.deviceB.page.waitForTimeout(5000);

        // 两个设备都切换到聊天页面
        await devices.deviceB.page.click(SELECTORS.wechatMenuItem);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 设备 B 需要更多时间确保 messageHandler 已注册并准备好接收消息
        console.log('[Test] Waiting for Device B message handlers to be ready...');
        await devices.deviceB.page.waitForTimeout(5000);

        // 切换到聊天页面
        await devices.deviceA.page.click(SELECTORS.wechatMenuItem);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 额外等待确保 Peer 连接稳定（基于 PeerJS 5秒标准）
        await devices.deviceA.page.waitForTimeout(5000);

        // 设备 A 创建与设备 B 的聊天
        await createChat(devices.deviceA.page, devices.deviceB.userInfo.peerId);

        // 选择聊天
        await devices.deviceA.page.click(SELECTORS.contactItem);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 设备 A 发送文本消息
        const testMessage = '你好，这是一条测试消息';
        await sendTextMessage(devices.deviceA.page, testMessage);

        // 验证消息显示在设备 A 的聊天窗口
        await assertMessageExists(devices.deviceA.page, testMessage);

        // 检查消息状态
        const messageStatus = devices.deviceA.page.locator(SELECTORS.messageStatus);
        const statusCount = await messageStatus.count();
        console.log('[Test] Device A message status count:', statusCount);

        // 等待足够的时间让消息发送到设备 B
        // 设备 B 已经在聊天页面，应该能接收消息
        await devices.deviceB.page.waitForTimeout(8000);

        // 打印相关的调试日志
        console.log('[Test] Device A relevant logs:');
        deviceALogs.filter(log => log.includes('[Peer') || log.includes('[WeChat') || log.includes('version')).forEach(log => console.log('  ', log));

        console.log('[Test] Device B relevant logs:');
        deviceBLogs.filter(log => log.includes('[Peer') || log.includes('[WeChat') || log.includes('version')).forEach(log => console.log('  ', log));

        // 刷新设备 B 的页面以加载可能的消息
        await devices.deviceB.page.reload();
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.RELOAD);

        // 页面刷新后需要重新点击联系人以触发 loadMessages
        await devices.deviceB.page.click(SELECTORS.contactItem);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 检查设备 B 是否收到了消息 - 使用更精确的选择器
        const messageInB = devices.deviceB.page.locator(SELECTORS.messageText).filter({ hasText: testMessage });
        const messageCount = await messageInB.count();

        // 验证消息接收成功（至少有一条匹配的消息）
        expect(messageCount).toBeGreaterThan(0);
      } finally {
        await cleanupTestDevices(devices);
      }
    });

    test('被动添加聊天：对端主动发起通信时自动加入列表', async ({ browser }) => {
      const devices = await createTestDevices(browser, '主动发起者', '被动接收者', { startPage: 'center' });

      try {
        // 切换到聊天页面
        await devices.deviceA.page.click(SELECTORS.wechatMenuItem);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 设备 A 创建与设备 B 的聊天并发送消息
        await createChat(devices.deviceA.page, devices.deviceB.userInfo.peerId);

        // 选择聊天
        await devices.deviceA.page.click(SELECTORS.contactItem);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 发送消息
        const testMessage = '自动添加聊天测试';
        await sendTextMessage(devices.deviceA.page, testMessage);

        // 切换设备 B 到聊天页面
        await devices.deviceB.page.click(SELECTORS.wechatMenuItem);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 等待设备 B 接收消息（增加等待时间）
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.MESSAGE * 2);
        await devices.deviceB.page.reload();
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.RELOAD);

        // 验证设备 B 的聊天列表中自动添加了设备 A
        // 使用 peerId 验证而不是 username，因为 username 可能还未同步
        const contactInB = devices.deviceB.page.locator(SELECTORS.contactItem);
        const contactCount = await contactInB.count();

        // 验证被动添加聊天功能
        expect(contactCount).toBeGreaterThan(0);
      } finally {
        await cleanupTestDevices(devices);
      }
    });
  });

  /**
   * 单设备聊天功能测试
   */
  test.describe('聊天功能', () => {
    test('应该能够新增聊天', async ({ page }) => {
      // 设置用户信息 - 从发现中心页面开始以确保 Peer 初始化
      await setUserInfo(page, createUserInfo('测试用户', 'test-chat-create-123'), { navigateTo: '/center' });
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 等待 Peer 连接建立
      await page.waitForTimeout(3000);

      // 切换到聊天页面
      await page.click(SELECTORS.wechatMenuItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 监听控制台日志
      const logs: string[] = [];
      page.on('console', msg => {
        logs.push(msg.text());
      });

      // 点击添加按钮
      await page.click(SELECTORS.plusButton);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证新增聊天弹窗显示
      const modal = page.locator('.ant-modal');
      await expect(modal).toBeVisible();
      const modalTitle = page.locator(SELECTORS.modalTitle);
      await expect(modalTitle).toContainText('新增聊天');

      // 输入对方 PeerId
      await page.fill(SELECTORS.peerIdInput, 'some-peer-id-456');

      // 点击创建
      await page.click(SELECTORS.modalOkButton);

      // 等待更长时间确保聊天创建完成
      await page.waitForTimeout(3000);

      // 打印相关日志
      console.log('[Test] Logs (filtered):');
      logs.filter(log => log.includes('chat') || log.includes('create') || log.includes('save') || log.includes('error') || log.includes('warning')).forEach(log => {
        console.log('  ', log);
      });

      // 检查 localStorage 中是否有联系人
      const contacts = await page.evaluate(() => {
        const stored = localStorage.getItem('p2p_contacts');
        return stored ? JSON.parse(stored) : {};
      });
      console.log('[Test] Contacts after creation:', contacts);

      // 检查是否有成功消息
      const successMessages = await page.evaluate(() => {
        const messages = document.querySelectorAll('.ant-message');
        return Array.from(messages).map(m => m.textContent);
      });
      console.log('[Test] Success messages:', successMessages);

      // 刷新页面以确保聊天列表更新
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 验证聊天已添加到列表
      const contactItem = page.locator(SELECTORS.contactItem);
      await expect(contactItem).toBeVisible();
    });

    test('不能与自己创建聊天', async ({ page }) => {
      // 设置用户信息
      const myPeerId = 'my-peer-id-123';
      await setUserInfo(page, createUserInfo('测试用户', myPeerId), { navigateTo: '/wechat' });
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 点击添加按钮
      await page.click(SELECTORS.plusButton);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 输入自己的 PeerId
      await page.fill(SELECTORS.peerIdInput, myPeerId);

      // 点击创建
      await page.click(SELECTORS.modalOkButton);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证警告消息 - 使用更精确的选择器
      const warningMsg = page.locator('.ant-message .anticon-exclamation-circle');
      const warningCount = await warningMsg.count();
      expect(warningCount).toBeGreaterThan(0);
    });

    test('应该显示聊天列表', async ({ page }) => {
      // 设置用户信息和聊天记录
      await setUserInfo(page, createUserInfo('测试用户', 'test-chat-list-123'), { navigateTo: '/wechat' });

      // 添加一些聊天记录
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
        'contact-2': {
          peerId: 'contact-2',
          username: '联系人2',
          avatar: null,
          online: false,
          lastSeen: Date.now() - 3600000,
          unreadCount: 2,
          chatVersion: 0,
        },
      };
      await setContactList(page, contacts);

      // 刷新页面以加载联系人列表
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 验证聊天列表显示
      const contactItems = page.locator(SELECTORS.contactItem);
      const count = await contactItems.count();

      expect(count).toBeGreaterThan(0);
    });

    test('应该显示空联系人状态', async ({ page }) => {
      await setUserInfo(page, createUserInfo('测试用户', 'test-empty-contacts-123'), { navigateTo: '/wechat' });
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 验证空状态显示
      await assertEmptyState(page);

      const emptyText = page.locator('.empty-contacts, .ant-empty-description');
      const hasEmptyText = await emptyText.count();
      expect(hasEmptyText).toBeGreaterThan(0);
    });

    test('应该能够删除聊天', async ({ page }) => {
      // 设置用户信息和聊天记录
      await setUserInfo(page, createUserInfo('测试用户', 'test-delete-chat-123'), { navigateTo: '/wechat' });

      const contacts = {
        'contact-to-delete': {
          peerId: 'contact-to-delete',
          username: '要删除的联系人',
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

      // 点击更多按钮
      const moreButton = page.locator('button[aria-label="more"]');
      await moreButton.click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 点击删除聊天 - 使用更精确的选择器
      const deleteMenuItem = page.locator('.ant-dropdown-menu-item').filter({ hasText: '删除聊天' });
      await deleteMenuItem.click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 刷新页面以更新列表
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 验证聊天已删除 - 联系人列表应该为空
      const contactItems = page.locator(SELECTORS.contactItem);
      const count = await contactItems.count();
      expect(count).toBe(0);
    });

    test('消息应该显示发送方信息', async ({ page }) => {
      // 设置用户信息和消息
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

      const messages = [
        {
          id: 'msg-1',
          from: 'my-peer-123',
          to: 'contact-1',
          content: '我发送的消息',
          type: 'text',
          timestamp: Date.now(),
          status: 'delivered',
        },
        {
          id: 'msg-2',
          from: 'contact-1',
          to: 'my-peer-123',
          content: '对方发送的消息',
          type: 'text',
          timestamp: Date.now() + 1000,
          status: 'delivered',
        },
      ];

      await page.evaluate(({ msgs, peerId }) => {
        localStorage.setItem(`p2p_messages_${peerId}`, JSON.stringify(msgs));
      }, { msgs: messages, peerId: 'contact-1' });

      // 刷新页面以加载消息
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 点击联系人来激活聊天
      await page.click(SELECTORS.contactItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证消息显示
      const messages_count = page.locator(SELECTORS.messageItem);
      const count = await messages_count.count();
      expect(count).toBeGreaterThan(0);

      // 验证自己发送的消息在右侧
      const selfMessage = page.locator(SELECTORS.messageSelf);
      const selfCount = await selfMessage.count();
      expect(selfCount).toBeGreaterThan(0);
    });
  });
});
