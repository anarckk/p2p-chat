import { test, expect } from '@playwright/test';

/**
 * 聊天中标识测试
 * 测试场景：
 * 1. 已在聊天列表中的设备在发现中心显示"(聊天中)"标识
 * 2. 聊天中的设备在发现中心仍然可见
 * 3. 从发现中心点击聊天中设备应该跳转到已有聊天
 */
test.describe('聊天中标识', () => {
  test.beforeEach(async ({ page }) => {
    // 清理 localStorage
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('已在聊天列表中的设备应该显示"已加入聊天"标识', async ({ page }) => {
    // 设置用户信息和聊天记录
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'my-peer-123',
        }),
      );

      // 添加一些发现的设备
      const devices = {
        'chat-contact-1': {
          peerId: 'chat-contact-1',
          username: '聊天中的设备',
          avatar: null,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: true,
        },
        'non-chat-contact': {
          peerId: 'non-chat-contact',
          username: '非聊天设备',
          avatar: null,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: true,
        },
      };
      localStorage.setItem('discovered_devices', JSON.stringify(devices));

      // 添加聊天记录
      const contacts = {
        'chat-contact-1': {
          peerId: 'chat-contact-1',
          username: '聊天中的设备',
          avatar: null,
          online: true,
          lastSeen: Date.now(),
          unreadCount: 0,
        },
      };
      localStorage.setItem('p2p_contacts', JSON.stringify(contacts));
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 验证"已加入聊天"标识显示
    const chatBadge = await page.locator('.ant-tag:has-text("已加入聊天")');
    const hasChatBadge = await chatBadge.count();

    expect(hasChatBadge).toBeGreaterThan(0);

    // 验证非聊天设备没有该标识
    const nonChatDeviceCard = await page.locator('.device-card').filter({ hasText: '非聊天设备' });
    const nonChatBadge = await nonChatDeviceCard.locator('.ant-tag:has-text("已加入聊天")').count();

    expect(nonChatBadge).toBe(0);
  });

  test('聊天中的设备在发现中心仍然可见', async ({ page }) => {
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'my-peer-123',
        }),
      );

      // 添加一个在聊天中的设备
      const devices = {
        'in-chat-device': {
          peerId: 'in-chat-device',
          username: '聊天中设备',
          avatar: null,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: true,
        },
      };
      localStorage.setItem('discovered_devices', JSON.stringify(devices));

      // 添加聊天记录
      const contacts = {
        'in-chat-device': {
          peerId: 'in-chat-device',
          username: '聊天中设备',
          avatar: null,
          online: true,
          lastSeen: Date.now(),
          unreadCount: 0,
        },
      };
      localStorage.setItem('p2p_contacts', JSON.stringify(contacts));
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 验证设备卡片存在
    const deviceCard = await page.locator('.device-card').filter({ hasText: '聊天中设备' });
    await expect(deviceCard).toBeVisible();

    // 验证标识显示
    const chatBadge = await deviceCard.locator('.ant-tag:has-text("已加入聊天")');
    await expect(chatBadge).toBeVisible();
  });

  test('从发现中心点击聊天中设备应该跳转到聊天页面', async ({ page }) => {
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'my-peer-123',
        }),
      );

      const devices = {
        'clickable-chat-device': {
          peerId: 'clickable-chat-device',
          username: '可点击聊天设备',
          avatar: null,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: true,
        },
      };
      localStorage.setItem('discovered_devices', JSON.stringify(devices));

      const contacts = {
        'clickable-chat-device': {
          peerId: 'clickable-chat-device',
          username: '可点击聊天设备',
          avatar: null,
          online: true,
          lastSeen: Date.now(),
          unreadCount: 0,
        },
      };
      localStorage.setItem('p2p_contacts', JSON.stringify(contacts));
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 点击设备卡片
    const deviceCard = await page.locator('.device-card').filter({ hasText: '可点击聊天设备' });
    await deviceCard.click();
    await page.waitForTimeout(1000);

    // 验证成功消息
    const successMessage = await page.locator('.ant-message-success');
    await expect(successMessage).toBeVisible();
    await expect(successMessage).toContainText('已添加');
  });

  test('新增聊天后设备应该在发现中心显示聊天标识', async ({ page }) => {
    // 先在发现中心添加设备
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'my-peer-123',
        }),
      );
    });
    await page.reload();
    await page.waitForTimeout(2000);

    // 手动添加一个设备
    await page.fill('input[placeholder*="Peer ID"]', 'new-chat-device-456');
    await page.click('button:has-text("添加")');
    await page.waitForTimeout(2000);

    // 切换到聊天页面
    await page.click('a:has-text("聊天")');
    await page.waitForURL(/\/wechat/);
    await page.waitForTimeout(1000);

    // 在聊天页面创建聊天
    await page.click('button[aria-label="plus"]');
    await page.waitForTimeout(500);

    const peerIdInput = page.locator('input[placeholder*="Peer ID"]');
    await peerIdInput.fill('new-chat-device-456');
    await page.click('button:has-text("创建")');
    await page.waitForTimeout(1000);

    // 切换回发现中心
    await page.click('a:has-text("发现中心")');
    await page.waitForURL(/\/center/);
    await page.waitForTimeout(1000);

    // 验证设备显示"已加入聊天"标识
    const chatBadge = await page.locator('.ant-tag:has-text("已加入聊天")');
    await expect(chatBadge).toBeVisible();
  });

  test('删除聊天后设备应该不再显示聊天标识', async ({ page }) => {
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'my-peer-123',
        }),
      );

      const devices = {
        'to-delete-chat': {
          peerId: 'to-delete-chat',
          username: '要删除聊天的设备',
          avatar: null,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: true,
        },
      };
      localStorage.setItem('discovered_devices', JSON.stringify(devices));

      const contacts = {
        'to-delete-chat': {
          peerId: 'to-delete-chat',
          username: '要删除聊天的设备',
          avatar: null,
          online: true,
          lastSeen: Date.now(),
          unreadCount: 0,
        },
      };
      localStorage.setItem('p2p_contacts', JSON.stringify(contacts));
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 验证初始状态有聊天标识
    const chatBadgeBefore = await page.locator('.ant-tag:has-text("已加入聊天")');
    await expect(chatBadgeBefore).toBeVisible();

    // 切换到聊天页面删除聊天
    await page.click('a:has-text("聊天")');
    await page.waitForURL(/\/wechat/);
    await page.waitForTimeout(1000);

    // 点击要删除的聊天
    await page.click('.contact-item');
    await page.waitForTimeout(1000);

    // 点击更多按钮
    await page.click('button[aria-label="more"]');
    await page.waitForTimeout(500);

    // 点击删除聊天
    await page.click('a:has-text("删除聊天")');
    await page.waitForTimeout(1000);

    // 切换回发现中心
    await page.click('a:has-text("发现中心")');
    await page.waitForURL(/\/center/);
    await page.waitForTimeout(1000);

    // 验证设备还在但没有聊天标识
    const deviceCard = await page.locator('.device-card').filter({ hasText: '要删除聊天的设备' });
    await expect(deviceCard).toBeVisible();

    const chatBadgeAfter = await deviceCard.locator('.ant-tag:has-text("已加入聊天")');
    await expect(chatBadgeAfter).not.toBeVisible();
  });

  test('多个聊天设备应该都能正确显示标识', async ({ page }) => {
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'my-peer-123',
        }),
      );

      // 添加多个设备，部分在聊天中
      const devices = {
        'chat-1': {
          peerId: 'chat-1',
          username: '聊天设备1',
          avatar: null,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: true,
        },
        'non-chat-1': {
          peerId: 'non-chat-1',
          username: '非聊天设备1',
          avatar: null,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: true,
        },
        'chat-2': {
          peerId: 'chat-2',
          username: '聊天设备2',
          avatar: null,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: true,
        },
      };
      localStorage.setItem('discovered_devices', JSON.stringify(devices));

      // 添加部分聊天记录
      const contacts = {
        'chat-1': {
          peerId: 'chat-1',
          username: '聊天设备1',
          avatar: null,
          online: true,
          lastSeen: Date.now(),
          unreadCount: 0,
        },
        'chat-2': {
          peerId: 'chat-2',
          username: '聊天设备2',
          avatar: null,
          online: true,
          lastSeen: Date.now(),
          unreadCount: 0,
        },
      };
      localStorage.setItem('p2p_contacts', JSON.stringify(contacts));
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 统计聊天标识数量
    const chatBadges = await page.locator('.ant-tag:has-text("已加入聊天")');
    const count = await chatBadges.count();

    expect(count).toBe(2);

    // 验证特定设备的标识
    const chatDevice1 = await page.locator('.device-card').filter({ hasText: '聊天设备1' });
    const chatBadge1 = await chatDevice1.locator('.ant-tag:has-text("已加入聊天")');
    await expect(chatBadge1).toBeVisible();

    const nonChatDevice = await page.locator('.device-card').filter({ hasText: '非聊天设备1' });
    const chatBadgeNonChat = await nonChatDevice.locator('.ant-tag:has-text("已加入聊天")');
    await expect(chatBadgeNonChat).not.toBeVisible();

    const chatDevice2 = await page.locator('.device-card').filter({ hasText: '聊天设备2' });
    const chatBadge2 = await chatDevice2.locator('.ant-tag:has-text("已加入聊天")');
    await expect(chatBadge2).toBeVisible();
  });

  test('设备在线状态和聊天状态应该同时显示', async ({ page }) => {
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'my-peer-123',
        }),
      );

      const devices = {
        'online-chat-device': {
          peerId: 'online-chat-device',
          username: '在线聊天设备',
          avatar: null,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: true,
        },
        'offline-chat-device': {
          peerId: 'offline-chat-device',
          username: '离线聊天设备',
          avatar: null,
          lastHeartbeat: Date.now() - 20 * 60 * 1000,
          firstDiscovered: Date.now() - 20 * 60 * 1000,
          isOnline: false,
        },
      };
      localStorage.setItem('discovered_devices', JSON.stringify(devices));

      const contacts = {
        'online-chat-device': {
          peerId: 'online-chat-device',
          username: '在线聊天设备',
          avatar: null,
          online: true,
          lastSeen: Date.now(),
          unreadCount: 0,
        },
        'offline-chat-device': {
          peerId: 'offline-chat-device',
          username: '离线聊天设备',
          avatar: null,
          online: false,
          lastSeen: Date.now() - 20 * 60 * 1000,
          unreadCount: 0,
        },
      };
      localStorage.setItem('p2p_contacts', JSON.stringify(contacts));
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 验证在线聊天设备同时显示在线和聊天标识
    const onlineChatDevice = await page.locator('.device-card').filter({ hasText: '在线聊天设备' });
    const chatBadgeOnline = await onlineChatDevice.locator('.ant-tag:has-text("已加入聊天")');
    await expect(chatBadgeOnline).toBeVisible();

    // 验证离线聊天设备显示离线和聊天标识
    const offlineChatDevice = await page.locator('.device-card').filter({ hasText: '离线聊天设备' });
    const chatBadgeOffline = await offlineChatDevice.locator('.ant-tag:has-text("已加入聊天")');
    await expect(chatBadgeOffline).toBeVisible();
  });
});
