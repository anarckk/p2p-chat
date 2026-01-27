import { test, expect } from '@playwright/test';
import {
  WAIT_TIMES,
  clearAllStorage,
  createDeviceInfo,
  setDeviceList,
  setContactList,
} from './test-helpers.js';

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
    await clearAllStorage(page);
  });

  test('已在聊天列表中的设备应该显示"聊天中"标识', async ({ page }) => {
    // 设置用户信息和聊天记录
    await page.goto('/center');
    await clearAllStorage(page);

    // 设置用户信息
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'my-peer-123',
          version: 0,
        }),
      );
    });

    // 添加一些发现的设备
    const devices = {
      'chat-contact-1': createDeviceInfo('chat-contact-1', '聊天中的设备'),
      'non-chat-contact': createDeviceInfo('non-chat-contact', '非聊天设备'),
    };
    await setDeviceList(page, devices);

    // 添加聊天记录
    const contacts = {
      'chat-contact-1': {
        peerId: 'chat-contact-1',
        username: '聊天中的设备',
        avatar: null,
        online: true,
        lastSeen: Date.now(),
        unreadCount: 0,
        chatVersion: 0,
      },
    };
    await setContactList(page, contacts);

    await page.reload();
    await page.waitForTimeout(WAIT_TIMES.MODAL);

    // 验证设备卡片显示
    const deviceCards = await page.locator('.device-card').count();
    expect(deviceCards).toBeGreaterThan(0);

    // 使用更精确的选择器验证"聊天中"标识
    const chatBadgeTag = page.locator('.ant-tag.ant-tag-green:has-text("聊天中")');
    const hasChatBadge = await chatBadgeTag.count();
    expect(hasChatBadge).toBeGreaterThan(0);
  });

  test('聊天中的设备在发现中心仍然可见', async ({ page }) => {
    await page.goto('/center');
    await clearAllStorage(page);

    // 设置用户信息
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'my-peer-123',
          version: 0,
        }),
      );
    });

    // 添加一个在聊天中的设备
    const devices = {
      'in-chat-device': createDeviceInfo('in-chat-device', '聊天中设备'),
    };
    await setDeviceList(page, devices);

    // 添加聊天记录
    const contacts = {
      'in-chat-device': {
        peerId: 'in-chat-device',
        username: '聊天中设备',
        avatar: null,
        online: true,
        lastSeen: Date.now(),
        unreadCount: 0,
        chatVersion: 0,
      },
    };
    await setContactList(page, contacts);

    await page.reload();
    await page.waitForTimeout(WAIT_TIMES.MODAL);

    // 验证设备卡片存在
    const deviceCard = await page.locator('.device-card').filter({ hasText: '聊天中设备' });
    await expect(deviceCard).toBeVisible();

    // 验证页面包含"聊天中"文本
    const pageContent = await page.content();
    expect(pageContent).toContain('聊天中');
  });

  test('非聊天设备不应该显示"聊天中"标识', async ({ page }) => {
    await page.goto('/center');
    await clearAllStorage(page);

    // 设置用户信息
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'my-peer-123',
          version: 0,
        }),
      );
    });

    // 只添加发现的设备，不添加聊天记录
    const devices = {
      'non-chat-device': createDeviceInfo('non-chat-device', '非聊天设备'),
    };
    await setDeviceList(page, devices);

    await page.reload();
    await page.waitForTimeout(WAIT_TIMES.MODAL);

    // 验证设备卡片存在
    const deviceCard = await page.locator('.device-card').filter({ hasText: '非聊天设备' });
    await expect(deviceCard).toBeVisible();

    // 验证没有"聊天中"标识（应该显示"在线"标识）
    const chatBadgeTag = page.locator('.device-card').filter({ hasText: '非聊天设备' }).locator('.ant-tag.ant-tag-green:has-text("聊天中")');
    const hasChatBadge = await chatBadgeTag.count();
    expect(hasChatBadge).toBe(0);

    // 应该显示"在线"标识
    const onlineTag = page.locator('.device-card').filter({ hasText: '非聊天设备' }).locator('.ant-tag.ant-tag-success');
    const hasOnlineTag = await onlineTag.count();
    expect(hasOnlineTag).toBeGreaterThan(0);
  });
});
