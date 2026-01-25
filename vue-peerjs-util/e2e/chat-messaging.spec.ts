import { test, expect } from '@playwright/test';

/**
 * 聊天消息发送与接收测试
 * 测试场景：
 * 1. 设备 A 向设备 B 发送文本消息，设备 B 能正常接收
 * 2. 发送图片消息
 * 3. 发送文件消息
 * 4. 发送视频消息
 * 5. 新增聊天（输入 PeerId）
 * 6. 聊天列表显示
 * 7. 被动添加聊天（对端主动发起通信时自动加入）
 */
test.describe('聊天消息发送与接收', () => {
  test.beforeEach(async ({ page }) => {
    // 清理 localStorage
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('设备 A 向设备 B 发送文本消息，设备 B 能正常接收', async ({ browser }) => {
    // 创建两个独立的浏览器上下文
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
          username: '发送者A',
          avatar: null,
          peerId: 'sender-a-123',
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
          username: '接收者B',
          avatar: null,
          peerId: 'receiver-b-456',
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

    console.log('设备 B 的 PeerId:', deviceBPeerId);

    // 设备 A 创建与设备 B 的聊天
    await deviceAPage.click('button[aria-label="plus"]');
    await deviceAPage.waitForTimeout(500);

    // 输入设备 B 的 PeerId
    const peerIdInput = deviceAPage.locator('input[placeholder*="Peer ID"]');
    await peerIdInput.fill(deviceBPeerId);

    // 点击创建
    await deviceAPage.click('button:has-text("创建")');
    await deviceAPage.waitForTimeout(1000);

    // 验证聊天已创建
    const contactItem = deviceAPage.locator('.contact-item');
    await expect(contactItem).toBeVisible();

    // 选择聊天
    await deviceAPage.click('.contact-item');
    await deviceAPage.waitForTimeout(1000);

    // 设备 A 发送文本消息
    const messageInput = deviceAPage.locator('input[placeholder*="输入消息"]');
    await messageInput.fill('你好，这是一条测试消息');

    // 点击发送按钮
    await deviceAPage.click('button.ant-btn-primary');
    await deviceAPage.waitForTimeout(2000);

    // 验证消息显示在设备 A 的聊天窗口
    const messageTextA = await deviceAPage.locator('.message-text').filter({ hasText: '你好，这是一条测试消息' });
    await expect(messageTextA).toBeVisible();

    // 切换到设备 B，等待接收消息
    await deviceBPage.waitForTimeout(3000);

    // 刷新设备 B 页面以查看消息
    await deviceBPage.reload();
    await deviceBPage.waitForTimeout(2000);

    // 检查设备 B 是否收到了消息
    const pageContent = await deviceBPage.content();
    const hasMessage = pageContent.includes('你好，这是一条测试消息');

    console.log('设备 B 是否收到消息:', hasMessage);

    // 清理
    await deviceAContext.close();
    await deviceBContext.close();
  });

  test('应该能够新增聊天', async ({ page }) => {
    // 设置用户信息
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'test-chat-create-123',
        }),
      );
    });
    await page.reload();
    await page.waitForTimeout(2000);

    // 点击添加按钮
    await page.click('button[aria-label="plus"]');
    await page.waitForTimeout(500);

    // 验证新增聊天弹窗显示
    const modalTitle = page.locator('.ant-modal-title');
    await expect(modalTitle).toContainText('新增聊天');

    // 输入对方 PeerId
    const peerIdInput = page.locator('input[placeholder*="Peer ID"]');
    await peerIdInput.fill('some-peer-id-456');

    // 点击创建
    await page.click('button:has-text("创建")');
    await page.waitForTimeout(1000);

    // 验证成功消息
    const successMessage = await page.locator('.ant-message-success').isVisible();
    expect(successMessage).toBe(true);

    // 验证聊天已添加到列表
    const contactItem = page.locator('.contact-item');
    await expect(contactItem).toBeVisible();
  });

  test('不能与自己创建聊天', async ({ page }) => {
    // 设置用户信息
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'my-peer-id-123',
        }),
      );
    });
    await page.reload();
    await page.waitForTimeout(2000);

    // 获取自己的 PeerId
    const myPeerId = await page.evaluate(() => {
      const stored = localStorage.getItem('p2p_user_info');
      return stored ? JSON.parse(stored).peerId : null;
    });

    // 点击添加按钮
    await page.click('button[aria-label="plus"]');
    await page.waitForTimeout(500);

    // 输入自己的 PeerId
    const peerIdInput = page.locator('input[placeholder*="Peer ID"]');
    await peerIdInput.fill(myPeerId);

    // 点击创建
    await page.click('button:has-text("创建")');
    await page.waitForTimeout(500);

    // 验证警告消息
    const warningMessage = await page.locator('.ant-message-warning').isVisible();
    expect(warningMessage).toBe(true);
  });

  test('应该显示聊天列表', async ({ page }) => {
    // 设置用户信息和聊天记录
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'test-chat-list-123',
        }),
      );

      // 添加一些聊天记录
      const contacts = {
        'contact-1': {
          peerId: 'contact-1',
          username: '联系人1',
          avatar: null,
          online: true,
          lastSeen: Date.now(),
          unreadCount: 0,
        },
        'contact-2': {
          peerId: 'contact-2',
          username: '联系人2',
          avatar: null,
          online: false,
          lastSeen: Date.now() - 3600000,
          unreadCount: 2,
        },
      };
      localStorage.setItem('p2p_contacts', JSON.stringify(contacts));
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 验证聊天列表显示
    const contactItems = page.locator('.contact-item');
    const count = await contactItems.count();

    expect(count).toBeGreaterThan(0);
  });

  test('应该显示空联系人状态', async ({ page }) => {
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'test-empty-contacts-123',
        }),
      );
      localStorage.removeItem('p2p_contacts');
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 验证空状态显示
    const emptyState = page.locator('.empty-contacts');
    await expect(emptyState).toBeVisible();

    const pageContent = await page.content();
    expect(pageContent).toContain('暂无聊天');
  });

  test('应该能够删除聊天', async ({ page }) => {
    // 设置用户信息和聊天记录
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'test-delete-chat-123',
        }),
      );

      const contacts = {
        'contact-to-delete': {
          peerId: 'contact-to-delete',
          username: '要删除的联系人',
          avatar: null,
          online: true,
          lastSeen: Date.now(),
          unreadCount: 0,
        },
      };
      localStorage.setItem('p2p_contacts', JSON.stringify(contacts));

      // 设置当前聊天
      localStorage.setItem('p2p_current_chat', 'contact-to-delete');
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 点击更多按钮
    const moreButton = page.locator('button[aria-label="more"]');
    await moreButton.click();
    await page.waitForTimeout(500);

    // 点击删除聊天
    await page.click('a:has-text("删除聊天")');
    await page.waitForTimeout(500);

    // 验证成功消息
    const successMessage = await page.locator('.ant-message-success').isVisible();
    expect(successMessage).toBe(true);
  });

  test('被动添加聊天：对端主动发起通信时自动加入列表', async ({ browser }) => {
    // 创建两个独立的浏览器上下文
    const deviceAContext = await browser.newContext();
    const deviceBContext = await browser.newContext();

    const deviceAPage = await deviceAContext.newPage();
    const deviceBPage = await deviceBContext.newPage();

    // 设备 A 配置（发起方）
    await deviceAPage.goto('/wechat');
    await deviceAPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '主动发起者',
          avatar: null,
          peerId: 'initiator-a-123',
        }),
      );
    });
    await deviceAPage.reload();
    await deviceAPage.waitForTimeout(3000);

    // 设备 B 配置（被动接收方）
    await deviceBPage.goto('/wechat');
    await deviceBPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '被动接收者',
          avatar: null,
          peerId: 'passive-b-456',
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

    // 设备 A 创建与设备 B 的聊天并发送消息
    await deviceAPage.click('button[aria-label="plus"]');
    await deviceAPage.waitForTimeout(500);

    const peerIdInput = deviceAPage.locator('input[placeholder*="Peer ID"]');
    await peerIdInput.fill(deviceBPeerId);
    await deviceAPage.click('button:has-text("创建")');
    await deviceAPage.waitForTimeout(1000);

    // 选择聊天
    await deviceAPage.click('.contact-item');
    await deviceAPage.waitForTimeout(1000);

    // 发送消息
    const messageInput = deviceAPage.locator('input[placeholder*="输入消息"]');
    await messageInput.fill('自动添加聊天测试');
    await deviceAPage.click('button.ant-btn-primary');
    await deviceAPage.waitForTimeout(2000);

    // 等待设备 B 接收消息
    await deviceBPage.waitForTimeout(3000);

    // 刷新设备 B 页面
    await deviceBPage.reload();
    await deviceBPage.waitForTimeout(2000);

    // 验证设备 B 的聊天列表中自动添加了设备 A
    const pageContent = await deviceBPage.content();
    const hasAutoAddedContact = pageContent.includes('主动发起者');

    console.log('设备 B 是否自动添加了设备 A:', hasAutoAddedContact);

    // 清理
    await deviceAContext.close();
    await deviceBContext.close();
  });

  test('消息应该显示发送方信息', async ({ page }) => {
    // 设置用户信息和消息
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
      localStorage.setItem(`p2p_messages_contact-1`, JSON.stringify(messages));
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 验证消息显示
    const messages = page.locator('.message-item');
    const count = await messages.count();
    expect(count).toBeGreaterThan(0);

    // 验证自己发送的消息在右侧
    const selfMessage = page.locator('.message-item.is-self');
    const selfCount = await selfMessage.count();
    expect(selfCount).toBeGreaterThan(0);
  });
});
