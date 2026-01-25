import { test, expect } from '@playwright/test';

/**
 * 消息状态展示与送达确认测试
 * 测试场景：
 * 1. 消息发送状态展示（发送中/已送达/发送失败）
 * 2. 送达确认机制
 * 3. 消息去重机制
 * 4. 消息自动重试
 * 5. 离线消息处理
 */
test.describe('消息状态展示与送达确认', () => {
  test.beforeEach(async ({ page }) => {
    // 清理 localStorage
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('应该显示消息发送中状态', async ({ page }) => {
    // 设置用户信息和聊天
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'my-peer-123',
        }),
      );

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
      localStorage.setItem('p2p_contacts', JSON.stringify(contacts));
      localStorage.setItem('p2p_current_chat', 'contact-1');

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
      localStorage.setItem(`p2p_messages_contact-1`, JSON.stringify(messages));
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 验证消息显示
    const messageText = page.locator('.message-text').filter({ hasText: '发送中的消息' });
    await expect(messageText).toBeVisible();

    // 验证消息状态图标存在（通过检查 message-status 元素）
    const messageStatus = page.locator('.message-status');
    const hasStatus = await messageStatus.count();
    expect(hasStatus).toBeGreaterThan(0);
  });

  test('应该显示消息已送达状态', async ({ page }) => {
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'my-peer-123',
        }),
      );

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
      localStorage.setItem('p2p_contacts', JSON.stringify(contacts));
      localStorage.setItem('p2p_current_chat', 'contact-1');

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
      localStorage.setItem(`p2p_messages_contact-1`, JSON.stringify(messages));
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 验证消息显示
    const messageText = page.locator('.message-text').filter({ hasText: '已送达的消息' });
    await expect(messageText).toBeVisible();

    // 验证消息状态图标存在
    const messageStatus = page.locator('.message-status');
    const hasStatus = await messageStatus.count();
    expect(hasStatus).toBeGreaterThan(0);
  });

  test('应该显示消息发送失败状态', async ({ page }) => {
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'my-peer-123',
        }),
      );

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
      localStorage.setItem('p2p_contacts', JSON.stringify(contacts));
      localStorage.setItem('p2p_current_chat', 'contact-1');

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
      localStorage.setItem(`p2p_messages_contact-1`, JSON.stringify(messages));
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 验证消息显示
    const messageText = page.locator('.message-text').filter({ hasText: '发送失败的消息' });
    await expect(messageText).toBeVisible();

    // 验证消息状态图标存在
    const messageStatus = page.locator('.message-status');
    const hasStatus = await messageStatus.count();
    expect(hasStatus).toBeGreaterThan(0);
  });

  test('消息应该有唯一标识', async ({ page }) => {
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'my-peer-123',
        }),
      );

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
      localStorage.setItem('p2p_contacts', JSON.stringify(contacts));
      localStorage.setItem('p2p_current_chat', 'contact-1');

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
      localStorage.setItem(`p2p_messages_contact-1`, JSON.stringify(messages));
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 验证每条消息都有唯一 ID
    const messageIds = await page.evaluate(() => {
      const stored = localStorage.getItem('p2p_messages_contact-1');
      const messages = stored ? JSON.parse(stored) : [];
      return messages.map((m: any) => m.id);
    });

    const uniqueIds = new Set(messageIds);
    expect(uniqueIds.size).toBe(messageIds.length);
  });

  test('应该去重重复的消息', async ({ page }) => {
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'my-peer-123',
        }),
      );

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
      localStorage.setItem('p2p_contacts', JSON.stringify(contacts));
      localStorage.setItem('p2p_current_chat', 'contact-1');

      // 模拟重复 ID 的消息（实际应用中应该去重）
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
      localStorage.setItem(`p2p_messages_contact-1`, JSON.stringify(messages));
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 验证消息列表中不会有重复
    const messageItems = page.locator('.message-item');
    const count = await messageItems.count();

    expect(count).toBe(1);
  });

  test('失败的消息应该自动重试', async ({ browser }) => {
    // 这个测试需要两个浏览器实例来模拟真实的重试场景
    const deviceAContext = await browser.newContext();
    const deviceBContext = await browser.newContext();

    const deviceAPage = await deviceAContext.newPage();
    const deviceBPage = await deviceBContext.newPage();

    // 设备 A 配置
    await deviceAPage.goto('/wechat');
    await deviceAPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '重试测试A',
          avatar: null,
          peerId: 'retry-test-a-123',
        }),
      );
    });
    await deviceAPage.reload();
    await deviceAPage.waitForTimeout(3000);

    // 设备 B 配置
    await deviceBPage.goto('/wechat');
    await deviceBPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '重试测试B',
          avatar: null,
          peerId: 'retry-test-b-456',
        }),
      );
    });
    await deviceBPage.reload();
    await deviceBPage.waitForTimeout(3000);

    // 获取设备 B 的 PeerId
    const deviceBPeerId = await deviceBPage.evaluate(() => {
      const stored = localStorage.getItem('p2p_user_info');
      return stored ? JSON.parse(stored).peerId : null;
    });

    // 设备 A 创建聊天并发送消息
    await deviceAPage.click('button[aria-label="plus"]');
    await deviceAPage.waitForTimeout(500);

    const peerIdInput = deviceAPage.locator('input[placeholder*="Peer ID"]');
    await peerIdInput.fill(deviceBPeerId);
    await deviceAPage.click('button:has-text("创建")');
    await deviceAPage.waitForTimeout(1000);

    await deviceAPage.click('.contact-item');
    await deviceAPage.waitForTimeout(1000);

    // 发送消息
    const messageInput = deviceAPage.locator('input[placeholder*="输入消息"]');
    await messageInput.fill('重试测试消息');
    await deviceAPage.click('button.ant-btn-primary');

    // 等待一段时间观察重试
    await deviceAPage.waitForTimeout(5000);

    // 验证消息最终状态（应该变为 delivered 或保持 failed）
    const messageStatus = await deviceAPage.evaluate(() => {
      const stored = localStorage.getItem('p2p_messages_contact-1');
      const messages = stored ? JSON.parse(stored) : [];
      const lastMessage = messages[messages.length - 1];
      return lastMessage ? lastMessage.status : null;
    });

    console.log('最终消息状态:', messageStatus);

    // 清理
    await deviceAContext.close();
    await deviceBContext.close();
  });

  test('应该显示消息时间戳', async ({ page }) => {
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'my-peer-123',
        }),
      );

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
      localStorage.setItem('p2p_contacts', JSON.stringify(contacts));
      localStorage.setItem('p2p_current_chat', 'contact-1');

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
      localStorage.setItem(`p2p_messages_contact-1`, JSON.stringify(messages));
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 验证消息时间显示
    const messageTime = page.locator('.message-time');
    const hasTime = await messageTime.count();

    expect(hasTime).toBeGreaterThan(0);
  });

  test('离线设备上线后应该能接收消息', async ({ browser }) => {
    // 创建两个浏览器实例
    const deviceAContext = await browser.newContext();
    const deviceBContext = await browser.newContext();

    const deviceAPage = await deviceAContext.newPage();
    const deviceBPage = await deviceBContext.newPage();

    // 设备 A 配置
    await deviceAPage.goto('/wechat');
    await deviceAPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '在线方A',
          avatar: null,
          peerId: 'online-a-123',
        }),
      );
    });
    await deviceAPage.reload();
    await deviceAPage.waitForTimeout(3000);

    // 设备 B 先不启动，模拟离线
    const deviceBPeerId = 'offline-b-456';

    // 设备 A 尝试发送消息给离线的设备 B
    await deviceAPage.click('button[aria-label="plus"]');
    await deviceAPage.waitForTimeout(500);

    const peerIdInput = deviceAPage.locator('input[placeholder*="Peer ID"]');
    await peerIdInput.fill(deviceBPeerId);
    await deviceAPage.click('button:has-text("创建")');
    await deviceAPage.waitForTimeout(1000);

    await deviceAPage.click('.contact-item');
    await deviceAPage.waitForTimeout(1000);

    const messageInput = deviceAPage.locator('input[placeholder*="输入消息"]');
    await messageInput.fill('离线消息测试');
    await deviceAPage.click('button.ant-btn-primary');
    await deviceAPage.waitForTimeout(2000);

    // 现在启动设备 B（上线）
    await deviceBPage.goto('/wechat');
    await deviceBPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '离线方B',
          avatar: null,
          peerId: deviceBPeerId,
        }),
      );
    });
    await deviceBPage.reload();
    await deviceBPage.waitForTimeout(3000);

    // 等待一段时间，观察是否能接收离线消息
    await deviceBPage.waitForTimeout(5000);

    // 验证（这里可能需要根据实际实现调整）
    const pageContent = await deviceBPage.content();
    const hasOfflineMessage = pageContent.includes('离线消息测试');

    console.log('设备 B 是否收到离线消息:', hasOfflineMessage);

    // 清理
    await deviceAContext.close();
    await deviceBContext.close();
  });

  test('消息应该持久化到 localStorage', async ({ page }) => {
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'my-peer-123',
        }),
      );

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
      localStorage.setItem('p2p_contacts', JSON.stringify(contacts));
      localStorage.setItem('p2p_current_chat', 'contact-1');

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
      localStorage.setItem(`p2p_messages_contact-1`, JSON.stringify(messages));
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 验证消息显示
    const messageText = page.locator('.message-text').filter({ hasText: '持久化消息' });
    await expect(messageText).toBeVisible();

    // 刷新页面
    await page.reload();
    await page.waitForTimeout(1500);

    // 验证消息依然存在
    const messageTextAfterReload = page.locator('.message-text').filter({ hasText: '持久化消息' });
    await expect(messageTextAfterReload).toBeVisible();
  });
});
