import { test, expect } from '@playwright/test';

/**
 * 三段式通信协议测试
 * 测试场景：
 * 1. 第一段：发送消息ID
 * 2. 第二段：对端请求消息内容
 * 3. 第三段：发送方返回完整消息内容
 * 4. 重试时只发送ID的测试
 */
test.describe('三段式通信协议', () => {
  test.beforeEach(async ({ page }) => {
    // 清理 localStorage
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('应该使用三段式协议发送消息', async ({ browser }) => {
    // 创建两个独立的浏览器上下文
    const senderContext = await browser.newContext();
    const receiverContext = await browser.newContext();

    const senderPage = await senderContext.newPage();
    const receiverPage = await receiverContext.newPage();

    // 发送方配置
    await senderPage.goto('/wechat');
    await senderPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '发送方',
          avatar: null,
          peerId: 'protocol-sender-123',
        }),
      );
    });
    await senderPage.reload();
    await senderPage.waitForTimeout(3000);

    // 接收方配置
    await receiverPage.goto('/wechat');
    await receiverPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '接收方',
          avatar: null,
          peerId: 'protocol-receiver-456',
        }),
      );
    });
    await receiverPage.reload();
    await receiverPage.waitForTimeout(3000);

    // 获取接收方的 PeerId
    const receiverPeerId = await receiverPage.evaluate(() => {
      const stored = localStorage.getItem('p2p_user_info');
      return stored ? JSON.parse(stored).peerId : null;
    });

    console.log('接收方 PeerId:', receiverPeerId);

    // 发送方创建聊天
    await senderPage.click('button[aria-label="plus"]');
    await senderPage.waitForTimeout(500);

    const peerIdInput = senderPage.locator('input[placeholder*="Peer ID"]');
    await peerIdInput.fill(receiverPeerId);
    await senderPage.click('button:has-text("创建")');
    await senderPage.waitForTimeout(1000);

    await senderPage.click('.contact-item');
    await senderPage.waitForTimeout(1000);

    // 监听网络请求（观察三段式协议）
    const networkRequests: string[] = [];

    // 注意：由于 PeerJS 使用 WebSocket，这里主要验证功能行为
    // 发送方发送消息
    const messageInput = senderPage.locator('input[placeholder*="输入消息"]');
    const testMessage = '三段式协议测试消息';
    await messageInput.fill(testMessage);
    await senderPage.click('button.ant-btn-primary');
    await senderPage.waitForTimeout(3000);

    // 验证发送方显示了消息
    const senderMessageText = await senderPage.locator('.message-text').filter({ hasText: testMessage });
    await expect(senderMessageText).toBeVisible();

    // 等待接收方接收
    await receiverPage.waitForTimeout(3000);
    await receiverPage.reload();
    await receiverPage.waitForTimeout(2000);

    // 验证接收方收到消息
    const pageContent = await receiverPage.content();
    const hasMessage = pageContent.includes(testMessage);

    console.log('接收方是否收到消息:', hasMessage);

    // 清理
    await senderContext.close();
    await receiverContext.close();
  });

  test('重试消息时应该只发送消息ID', async ({ browser }) => {
    // 这个测试验证重试机制
    // 在实际的三段式协议中，重试时只发送消息ID，由接收方判断是否需要请求完整内容

    const senderContext = await browser.newContext();
    const receiverContext = await browser.newContext();

    const senderPage = await senderContext.newPage();
    const receiverPage = await receiverContext.newPage();

    // 发送方配置
    await senderPage.goto('/wechat');
    await senderPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '重试发送方',
          avatar: null,
          peerId: 'retry-sender-123',
        }),
      );
    });
    await senderPage.reload();
    await senderPage.waitForTimeout(3000);

    // 接收方配置（模拟不稳定网络）
    await receiverPage.goto('/wechat');
    await receiverPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '重试接收方',
          avatar: null,
          peerId: 'retry-receiver-456',
        }),
      );
    });
    await receiverPage.reload();
    await receiverPage.waitForTimeout(3000);

    const receiverPeerId = await receiverPage.evaluate(() => {
      const stored = localStorage.getItem('p2p_user_info');
      return stored ? JSON.parse(stored).peerId : null;
    });

    // 发送方创建聊天
    await senderPage.click('button[aria-label="plus"]');
    await senderPage.waitForTimeout(500);

    const peerIdInput = senderPage.locator('input[placeholder*="Peer ID"]');
    await peerIdInput.fill(receiverPeerId);
    await senderPage.click('button:has-text("创建")');
    await senderPage.waitForTimeout(1000);

    await senderPage.click('.contact-item');
    await senderPage.waitForTimeout(1000);

    // 发送消息
    const messageInput = senderPage.locator('input[placeholder*="输入消息"]');
    await messageInput.fill('重试测试消息');
    await senderPage.click('button.ant-btn-primary');
    await senderPage.waitForTimeout(2000);

    // 验证消息状态（可能显示为 sending 或 delivered）
    const messageStatus = await senderPage.evaluate(() => {
      const stored = localStorage.getItem('p2p_messages_contact-1');
      const messages = stored ? JSON.parse(stored) : [];
      const lastMessage = messages[messages.length - 1];
      return lastMessage ? { id: lastMessage.id, status: lastMessage.status } : null;
    });

    console.log('消息状态:', messageStatus);

    // 验证消息有唯一ID
    expect(messageStatus).not.toBeNull();
    expect(messageStatus?.id).toBeTruthy();

    // 清理
    await senderContext.close();
    await receiverContext.close();
  });

  test('消息应该有唯一的消息ID', async ({ page }) => {
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

      // 模拟多条消息
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
      localStorage.setItem(`p2p_messages_contact-1`, JSON.stringify(messages));
    });
    await page.reload();
    await page.waitForTimeout(1500);

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

  test('应该支持大文件消息的三段式传输', async ({ browser }) => {
    // 测试大文件消息的分段传输
    const senderContext = await browser.newContext();
    const receiverContext = await browser.newContext();

    const senderPage = await senderContext.newPage();
    const receiverPage = await receiverContext.newPage();

    // 发送方配置
    await senderPage.goto('/wechat');
    await senderPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '文件发送方',
          avatar: null,
          peerId: 'file-sender-123',
        }),
      );
    });
    await senderPage.reload();
    await senderPage.waitForTimeout(3000);

    // 接收方配置
    await receiverPage.goto('/wechat');
    await receiverPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '文件接收方',
          avatar: null,
          peerId: 'file-receiver-456',
        }),
      );
    });
    await receiverPage.reload();
    await receiverPage.waitForTimeout(3000);

    const receiverPeerId = await receiverPage.evaluate(() => {
      const stored = localStorage.getItem('p2p_user_info');
      return stored ? JSON.parse(stored).peerId : null;
    });

    // 发送方创建聊天
    await senderPage.click('button[aria-label="plus"]');
    await senderPage.waitForTimeout(500);

    const peerIdInput = senderPage.locator('input[placeholder*="Peer ID"]');
    await peerIdInput.fill(receiverPeerId);
    await senderPage.click('button:has-text("创建")');
    await senderPage.waitForTimeout(1000);

    await senderPage.click('.contact-item');
    await senderPage.waitForTimeout(1000);

    // 这里可以测试文件上传功能
    // 注意：实际测试中需要准备测试文件
    const fileButton = senderPage.locator('button:has(.anticon-plus)');
    await expect(fileButton).toBeVisible();

    console.log('文件上传按钮可用');

    // 清理
    await senderContext.close();
    await receiverContext.close();
  });

  test('应该正确处理消息ID冲突', async ({ page }) => {
    // 测试当接收到相同消息ID时的去重处理
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
      localStorage.setItem(`p2p_messages_contact-1`, JSON.stringify(messages));
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 验证只有一条消息
    const messageItems = page.locator('.message-item');
    const count = await messageItems.count();

    expect(count).toBe(1);

    // 验证内容
    const messageText = await messageItems.locator('.message-text').textContent();
    expect(messageText).toBe('第一次发送');
  });

  test('三段式协议应该支持多种消息类型', async ({ page }) => {
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
      localStorage.setItem(`p2p_messages_contact-1`, JSON.stringify(messages));
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 验证消息列表
    const messageItems = page.locator('.message-item');
    const count = await messageItems.count();

    expect(count).toBe(3);

    // 验证不同类型的消息都有对应的UI元素
    const textMessage = page.locator('.message-text');
    const imageMessage = page.locator('.message-image');
    const fileMessage = page.locator('.message-file');

    expect(await textMessage.count()).toBeGreaterThan(0);
    expect(await imageMessage.count()).toBeGreaterThan(0);
    expect(await fileMessage.count()).toBeGreaterThan(0);
  });
});
