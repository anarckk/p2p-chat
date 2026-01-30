import { test, expect } from '@playwright/test';
import {
  SELECTORS,
  WAIT_TIMES,
  createUserInfo,
  clearAllStorage,
  setUserInfo,
  setContactList,
  setDeviceList,
  createTestDevices,
  cleanupTestDevices,
  createChat,
  retry,
  setMessagesLegacy,
} from './test-helpers.js';

/**
 * 聊天中标识 E2E 测试
 * 测试场景：
 * 1. "已加入聊天"标识显示
 * 2. 设备可见性（已在聊天列表中的设备在发现中心也显示）
 * 3. 在线状态同时显示
 * 4. 聊天中标识应该与在线状态标签同时显示
 */
test.describe('聊天中标识', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/center');
    await clearAllStorage(page);
  });

  /**
   * 基础标识显示测试
   */
  test.describe('基础标识显示', () => {
    test('已加入聊天的设备应该在发现中心显示"聊天中"标识', async ({ page }) => {
      await setUserInfo(page, createUserInfo('测试用户', 'chat-badge-test-123'));

      // 设置已有的联系人（聊天记录）
      const contacts = {
        'chat-contact-1': {
          peerId: 'chat-contact-1',
          username: '聊天联系人1',
          avatar: null,
          online: true,
          lastSeen: Date.now(),
          unreadCount: 0,
          chatVersion: 0,
        },
      };
      await setContactList(page, contacts);

      // 设置设备列表（包含同一个设备）
      const devices = {
        'chat-contact-1': {
          peerId: 'chat-contact-1',
          username: '聊天联系人1',
          avatar: null,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: true,
        },
      };
      await setDeviceList(page, devices);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 验证设备卡片存在
      const deviceCard = page.locator(SELECTORS.deviceCard).filter({ hasText: '聊天联系人1' });
      await expect(deviceCard).toBeVisible();

      // 验证"聊天中"标识存在
      const chatTag = deviceCard.locator('.ant-tag:has-text("聊天中")');
      const chatTagCount = await chatTag.count();
      expect(chatTagCount).toBeGreaterThan(0);
    });

    test('未加入聊天的设备不应该显示"聊天中"标识', async ({ page }) => {
      await setUserInfo(page, createUserInfo('测试用户', 'no-chat-badge-test-123'));

      // 设置设备列表（不在联系人列表中）
      const devices = {
        'device-no-chat': {
          peerId: 'device-no-chat',
          username: '非聊天设备',
          avatar: null,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: true,
        },
      };
      await setDeviceList(page, devices);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 验证设备卡片存在
      const deviceCard = page.locator(SELECTORS.deviceCard).filter({ hasText: '非聊天设备' });
      await expect(deviceCard).toBeVisible();

      // 验证没有"聊天中"标识
      const chatTag = deviceCard.locator('.ant-tag:has-text("聊天中")');
      const chatTagCount = await chatTag.count();
      expect(chatTagCount).toBe(0);
    });

    test('自己的设备不应该显示"聊天中"标识', async ({ page }) => {
      await setUserInfo(page, createUserInfo('测试用户', 'my-chat-badge-test-123'));

      // 设置联系人列表（包含自己不应该发生，但为了测试完整性）
      const contacts = {
        'my-chat-badge-test-123': {
          peerId: 'my-chat-badge-test-123',
          username: '测试用户',
          avatar: null,
          online: true,
          lastSeen: Date.now(),
          unreadCount: 0,
          chatVersion: 0,
        },
      };
      await setContactList(page, contacts);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 验证自己的设备卡片存在
      const myDeviceCard = page.locator(SELECTORS.deviceCardMe);
      await expect(myDeviceCard).toBeVisible();

      // 验证有"我"标签
      const myTag = myDeviceCard.locator('.ant-tag:has-text("我")');
      const myTagCount = await myTag.count();
      expect(myTagCount).toBeGreaterThan(0);

      // 验证没有"聊天中"标识
      const chatTag = myDeviceCard.locator('.ant-tag:has-text("聊天中")');
      const chatTagCount = await chatTag.count();
      expect(chatTagCount).toBe(0);
    });
  });

  /**
   * 多设备标识测试
   */
  test.describe('多设备标识显示', () => {
    test('创建聊天后应该自动在发现中心显示"聊天中"标识', async ({ browser }) => {
      test.setTimeout(45000); // 优化：减少超时时间
      const devices = await createTestDevices(browser, '标识测试A', '标识测试B', { startPage: 'center' });

      try {
        // 等待 Peer 连接稳定
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);

        // 设备 A 添加设备 B
        await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceB.userInfo.peerId);
        await devices.deviceA.page.click(SELECTORS.addButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        // 验证设备 B 出现在设备 A 的发现中心
        const deviceBCardInA = devices.deviceA.page.locator(SELECTORS.deviceCard).filter({ hasText: devices.deviceB.userInfo.peerId });
        await expect(deviceBCardInA).toBeVisible({ timeout: 8000 });

        // 切换到聊天页面
        await devices.deviceA.page.click(SELECTORS.wechatMenuItem);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 创建与设备 B 的聊天
        await createChat(devices.deviceA.page, devices.deviceB.userInfo.peerId);

        // 切换回发现中心
        await devices.deviceA.page.click(SELECTORS.centerMenuItem);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 使用重试机制验证"聊天中"标识出现
        await retry(async () => {
          const deviceBCard = devices.deviceA.page.locator(SELECTORS.deviceCard).filter({ hasText: devices.deviceB.userInfo.peerId });
          const cardCount = await deviceBCard.count();
          if (cardCount === 0) {
            throw new Error('Device B card not found');
          }

          // 验证"聊天中"标识存在
          const chatTag = deviceBCard.locator('.ant-tag:has-text("聊天中")');
          const chatTagCount = await chatTag.count();
          if (chatTagCount === 0) {
            throw new Error('Chat badge not found');
          }
        }, { maxAttempts: 5, delay: 2000, context: 'Check chat badge after creating chat' });
      } finally {
        await cleanupTestDevices(devices);
      }
    });

    test('删除聊天后"聊天中"标识应该消失', async ({ page }) => {
      await setUserInfo(page, createUserInfo('测试用户', 'delete-chat-badge-123'));

      // 设置已有联系人
      const contacts = {
        'chat-to-delete': {
          peerId: 'chat-to-delete',
          username: '要删除的聊天',
          avatar: null,
          online: true,
          lastSeen: Date.now(),
          unreadCount: 0,
          chatVersion: 0,
        },
      };
      await setContactList(page, contacts);

      // 设置设备列表
      const devices = {
        'chat-to-delete': {
          peerId: 'chat-to-delete',
          username: '要删除的聊天',
          avatar: null,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: true,
        },
      };
      await setDeviceList(page, devices);

      // 添加消息记录（联系人需要有消息才能显示在聊天列表中）
      const messages = [
        {
          id: `msg-${Date.now()}`,
          from: 'chat-to-delete',
          to: 'delete-chat-badge-123',
          content: '测试消息',
          type: 'text',
          timestamp: Date.now(),
          status: 'delivered',
        },
      ];
      await setMessagesLegacy(page, 'chat-to-delete', messages);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 验证"聊天中"标识存在
      const deviceCard = page.locator(SELECTORS.deviceCard).filter({ hasText: '要删除的聊天' });
      const chatTagBefore = deviceCard.locator('.ant-tag:has-text("聊天中")');
      const chatTagCountBefore = await chatTagBefore.count();
      expect(chatTagCountBefore).toBeGreaterThan(0);

      // 切换到聊天页面
      await page.click(SELECTORS.wechatMenuItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 等待联系人出现并点击
      const contactItem = page.locator(SELECTORS.contactItem).filter({ hasText: '要删除的聊天' });
      await expect(contactItem).toBeVisible({ timeout: 10000 });
      await contactItem.click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 点击更多按钮
      const moreButton = page.locator('button[aria-label="more"]');
      await moreButton.click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 点击删除聊天
      const deleteMenuItem = page.locator('.ant-dropdown-menu-item').filter({ hasText: '删除聊天' });
      await deleteMenuItem.click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 切换回发现中心
      await page.click(SELECTORS.centerMenuItem);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证"聊天中"标识消失（但设备卡片仍在）
      const deviceCardAfter = page.locator(SELECTORS.deviceCard).filter({ hasText: '要删除的聊天' });
      await expect(deviceCardAfter).toBeVisible();

      const chatTagAfter = deviceCardAfter.locator('.ant-tag:has-text("聊天中")');
      const chatTagCountAfter = await chatTagAfter.count();
      expect(chatTagCountAfter).toBe(0);
    });
  });

  /**
   * 在线状态与聊天中标识同时显示测试
   */
  test.describe('在线状态与聊天中标识', () => {
    test('在线且在聊天中的设备应该同时显示在线和聊天中标识', async ({ page }) => {
      await setUserInfo(page, createUserInfo('测试用户', 'online-chat-123'));

      // 设置联系人
      const contacts = {
        'online-chat-contact': {
          peerId: 'online-chat-contact',
          username: '在线聊天设备',
          avatar: null,
          online: true,
          lastSeen: Date.now(),
          unreadCount: 0,
          chatVersion: 0,
        },
      };
      await setContactList(page, contacts);

      // 设置设备列表
      const devices = {
        'online-chat-contact': {
          peerId: 'online-chat-contact',
          username: '在线聊天设备',
          avatar: null,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: true,
        },
      };
      await setDeviceList(page, devices);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 验证设备卡片存在
      const deviceCard = page.locator(SELECTORS.deviceCard).filter({ hasText: '在线聊天设备' });
      await expect(deviceCard).toBeVisible();

      // 验证有在线标识（绿色标签）
      const onlineTag = deviceCard.locator('.ant-tag.ant-tag-success');
      const onlineTagCount = await onlineTag.count();
      expect(onlineTagCount).toBeGreaterThan(0);

      // 验证有"聊天中"标识
      const chatTag = deviceCard.locator('.ant-tag:has-text("聊天中")');
      const chatTagCount = await chatTag.count();
      expect(chatTagCount).toBeGreaterThan(0);
    });

    test('离线且在聊天中的设备应该同时显示离线和聊天中标识', async ({ page }) => {
      await setUserInfo(page, createUserInfo('测试用户', 'offline-chat-123'));

      // 设置联系人
      const contacts = {
        'offline-chat-contact': {
          peerId: 'offline-chat-contact',
          username: '离线聊天设备',
          avatar: null,
          online: false,
          lastSeen: Date.now() - 3600000,
          unreadCount: 0,
          chatVersion: 0,
        },
      };
      await setContactList(page, contacts);

      // 设置设备列表（离线）
      const now = Date.now();
      const devices = {
        'offline-chat-contact': {
          peerId: 'offline-chat-contact',
          username: '离线聊天设备',
          avatar: null,
          lastHeartbeat: now - 20 * 60 * 1000, // 20分钟前
          firstDiscovered: now - 60 * 60 * 1000,
          isOnline: false,
        },
      };
      await setDeviceList(page, devices);

      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 验证设备卡片存在
      const deviceCard = page.locator(SELECTORS.deviceCard).filter({ hasText: '离线聊天设备' });
      await expect(deviceCard).toBeVisible();

      // 验证有离线标识（灰色标签）
      const offlineTag = deviceCard.locator('.ant-tag.ant-tag-default');
      const offlineTagCount = await offlineTag.count();
      expect(offlineTagCount).toBeGreaterThan(0);

      // 验证有"聊天中"标识
      const chatTag = deviceCard.locator('.ant-tag:has-text("聊天中")');
      const chatTagCount = await chatTag.count();
      expect(chatTagCount).toBeGreaterThan(0);

      // 验证卡片有离线样式
      const cardClass = await deviceCard.getAttribute('class');
      expect(cardClass).toContain('is-offline');
    });
  });

  /**
   * 设备可见性测试
   */
  test.describe('设备可见性', () => {
    test('已在聊天列表的设备也应该在发现中心显示', async ({ browser }) => {
      test.setTimeout(45000); // 优化：减少超时时间
      const devices = await createTestDevices(browser, '可见性测试A', '可见性测试B', { startPage: 'center' });

      try {
        // 等待 Peer 连接稳定
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);

        // 设备 A 添加设备 B
        await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceB.userInfo.peerId);
        await devices.deviceA.page.click(SELECTORS.addButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        // 验证设备 B 出现在设备 A 的发现中心
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        const deviceBCardInCenter = devices.deviceA.page.locator(SELECTORS.deviceCard).filter({ hasText: devices.deviceB.userInfo.peerId });
        await expect(deviceBCardInCenter).toBeVisible({ timeout: 8000 });

        // 切换到聊天页面
        await devices.deviceA.page.click(SELECTORS.wechatMenuItem);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 创建与设备 B 的聊天
        await createChat(devices.deviceA.page, devices.deviceB.userInfo.peerId);

        // 验证设备 B 出现在聊天列表
        const contactItem = devices.deviceA.page.locator(SELECTORS.contactItem);
        await expect(contactItem).toBeVisible();

        // 切换回发现中心
        await devices.deviceA.page.click(SELECTORS.centerMenuItem);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 验证设备 B 仍在发现中心显示
        const deviceBCardStillInCenter = devices.deviceA.page.locator(SELECTORS.deviceCard).filter({ hasText: devices.deviceB.userInfo.peerId });
        await expect(deviceBCardStillInCenter).toBeVisible();

        // 验证有"聊天中"标识
        const chatTag = deviceBCardStillInCenter.locator('.ant-tag:has-text("聊天中")');
        const chatTagCount = await chatTag.count();
        expect(chatTagCount).toBeGreaterThan(0);
      } finally {
        await cleanupTestDevices(devices);
      }
    });
  });
});
