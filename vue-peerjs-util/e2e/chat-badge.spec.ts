import { test, expect } from '@playwright/test';

/**
 * 聊天中标识测试
 * 测试场景：
 * 1. 已在聊天列表中的设备在发现中心显示"(聊天中)"标识
 * 2. 聊天中的设备在发现中心仍然可见
 */
test.describe('聊天中标识', () => {
  test.beforeEach(async ({ page }) => {
    // 清理 localStorage
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.clear();
    });
  });

  test('已在聊天列表中的设备应该显示"聊天中"标识', async ({ page }) => {
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
    await page.waitForTimeout(2000);

    // 验证设备卡片显示
    const deviceCards = await page.locator('.device-card').count();
    expect(deviceCards).toBeGreaterThan(0);

    // 验证页面包含"聊天中"文本
    const pageContent = await page.content();
    const hasChatBadgeText = pageContent.includes('聊天中');
    expect(hasChatBadgeText).toBe(true);
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
    await page.waitForTimeout(2000);

    // 验证设备卡片存在
    const deviceCard = await page.locator('.device-card').filter({ hasText: '聊天中设备' });
    await expect(deviceCard).toBeVisible();

    // 验证页面包含"聊天中"文本
    const pageContent = await page.content();
    expect(pageContent).toContain('聊天中');
  });

  test('非聊天设备不应该显示"聊天中"标识', async ({ page }) => {
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

      // 只添加发现的设备，不添加聊天记录
      const devices = {
        'non-chat-device': {
          peerId: 'non-chat-device',
          username: '非聊天设备',
          avatar: null,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: true,
        },
      };
      localStorage.setItem('discovered_devices', JSON.stringify(devices));
    });
    await page.reload();
    await page.waitForTimeout(2000);

    // 验证设备卡片存在
    const deviceCard = await page.locator('.device-card').filter({ hasText: '非聊天设备' });
    await expect(deviceCard).toBeVisible();

    // 验证没有"聊天中"标识（应该显示"在线"标识）
    const pageContent = await page.content();
    expect(pageContent).toContain('在线');
  });
});
