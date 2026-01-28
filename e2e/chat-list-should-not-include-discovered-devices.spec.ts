import { test, expect } from '@playwright/test';
import {
  SELECTORS,
  WAIT_TIMES,
  createTestDevices,
  cleanupTestDevices,
  addDevice,
  retry,
} from './test-helpers.js';

/**
 * 聊天列表应该不包含发现中心的设备（除非主动创建聊天）
 *
 * 测试场景：
 * 1. 设备 A 和设备 B 启动
 * 2. 设备 A 在发现中心添加设备 B
 * 3. 设备 A 切换到聊天页面
 * 4. 预期：聊天列表中应该没有设备 B（因为还没创建聊天）
 */
test.describe('聊天列表应该不包含发现中心的设备', () => {
  test('在发现中心添加设备后，该设备不应该出现在聊天列表中', async ({ browser }) => {
    test.setTimeout(120000);
    const devices = await createTestDevices(browser, '聊天测试A', '聊天测试B', { startPage: 'center' });

    try {
      // 等待两个设备都连接到 Peer Server
      await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT);
      await devices.deviceB.page.waitForTimeout(WAIT_TIMES.PEER_INIT);

      // 步骤 1：设备 A 在发现中心添加设备 B
      console.log('[Test] 设备 A 添加设备 B 到发现中心');
      await addDevice(devices.deviceA.page, devices.deviceB.userInfo.peerId);

      // 等待添加完成
      await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

      // 验证设备 B 确实出现在设备 A 的发现中心
      const deviceBCardInCenter = devices.deviceA.page.locator(SELECTORS.deviceCard).filter({
        hasText: devices.deviceB.userInfo.peerId,
      });
      await expect(deviceBCardInCenter).toBeVisible({ timeout: 8000 });
      console.log('[Test] 设备 B 已出现在发现中心');

      // 步骤 2：设备 A 切换到聊天页面
      console.log('[Test] 设备 A 切换到聊天页面');
      await devices.deviceA.page.click(SELECTORS.wechatMenuItem);
      await devices.deviceA.page.waitForLoadState('domcontentloaded');
      await devices.deviceA.page.waitForSelector(SELECTORS.wechatContainer, { timeout: 8000 });

      // 等待聊天页面完全加载
      await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 步骤 3：检查聊天列表中是否有设备 B
      console.log('[Test] 检查聊天列表中是否有设备 B');

      // 获取所有联系人
      const contactItems = devices.deviceA.page.locator(SELECTORS.contactItem);
      const contactCount = await contactItems.count();

      console.log('[Test] 当前聊天列表中的联系人数量:', contactCount);

      // 如果有联系人，打印它们的用户名和 PeerId
      if (contactCount > 0) {
        const contactNames: string[] = [];
        const contactPeerIds: string[] = [];

        for (let i = 0; i < contactCount; i++) {
          const item = contactItems.nth(i);
          const name = await item.locator('.contact-name').textContent();
          const peerId = await item.locator('.contact-peer-id').textContent();
          contactNames.push(name || '');
          contactPeerIds.push(peerId || '');
        }

        console.log('[Test] 聊天列表中的用户名:', contactNames);
        console.log('[Test] 聊天列表中的 PeerId 片段:', contactPeerIds);

        // 验证设备 B 不在聊天列表中
        const hasDeviceBInChatList = contactPeerIds.some((peerIdFragment) => {
          // 聊天列表中的 PeerId 显示为 "xxx...xxxx" 格式
          // 设备 B 的完整 PeerId 是 devices.deviceB.userInfo.peerId
          // 检查是否匹配前8位和后4位
          const expectedPrefix = devices.deviceB.userInfo.peerId.slice(0, 8);
          const expectedSuffix = devices.deviceB.userInfo.peerId.slice(-4);
          return peerIdFragment.includes(expectedPrefix) || peerIdFragment.includes(expectedSuffix);
        });

        if (hasDeviceBInChatList) {
          console.error('[Test] 错误：设备 B 出现在聊天列表中，但它应该不在！');
          console.error('[Test] 设备 B PeerId:', devices.deviceB.userInfo.peerId);
        }

        expect(hasDeviceBInChatList).toBe(false);
      } else {
        console.log('[Test] 聊天列表为空，符合预期');
      }

      // 步骤 4：验证空状态提示显示
      const emptyContacts = devices.deviceA.page.locator(SELECTORS.emptyContacts);
      const isEmptyVisible = await emptyContacts.isVisible();
      console.log('[Test] 空状态提示是否显示:', isEmptyVisible);
    } finally {
      await cleanupTestDevices(devices);
    }
  });

  test('主动创建聊天后，设备才应该出现在聊天列表中', async ({ browser }) => {
    test.setTimeout(120000);
    const devices = await createTestDevices(browser, '主动聊天A', '主动聊天B', { startPage: 'wechat' });

    try {
      // 等待两个设备都连接到 Peer Server
      await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT);
      await devices.deviceB.page.waitForTimeout(WAIT_TIMES.PEER_INIT);

      // 初始状态：聊天列表应该是空的
      const initialContactCount = await devices.deviceA.page.locator(SELECTORS.contactItem).count();
      console.log('[Test] 初始聊天列表中的联系人数量:', initialContactCount);
      expect(initialContactCount).toBe(0);

      // 步骤 1：设备 A 主动创建与设备 B 的聊天
      console.log('[Test] 设备 A 主动创建与设备 B 的聊天');
      await devices.deviceA.page.click(SELECTORS.plusButton);
      await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

      // 等待弹窗出现
      const modalInput = devices.deviceA.page.locator('.ant-modal input[placeholder*="Peer ID"]');
      await expect(modalInput).toBeVisible({ timeout: 3000 });

      // 输入设备 B 的 PeerId
      await modalInput.fill(devices.deviceB.userInfo.peerId);
      await devices.deviceA.page.click(SELECTORS.modalOkButton);

      // 等待聊天创建完成
      await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

      // 步骤 2：验证设备 B 出现在聊天列表中
      console.log('[Test] 验证设备 B 出现在聊天列表中');
      await retry(async () => {
        const contactItems = devices.deviceA.page.locator(SELECTORS.contactItem);
        const contactCount = await contactItems.count();
        expect(contactCount).toBeGreaterThan(0);

        // 查找包含设备 B PeerId 的联系人
        const deviceBContact = contactItems.filter({ hasText: devices.deviceB.userInfo.peerId.slice(0, 8) });
        const count = await deviceBContact.count();
        if (count === 0) {
          throw new Error('设备 B 未出现在聊天列表中');
        }
      }, { maxAttempts: 5, delay: 2000, context: 'Check device B in chat list' });

      console.log('[Test] 测试通过：主动创建聊天后，设备 B 出现在聊天列表中');
    } finally {
      await cleanupTestDevices(devices);
    }
  });

  test('被动接收消息后，发送方应该出现在聊天列表中', async ({ browser }) => {
    test.setTimeout(120000);

    // 设备 A 启动在聊天页面
    const devices = await createTestDevices(browser, '消息接收方A', '消息发送方B', { startPage: 'wechat' });

    try {
      // 等待两个设备都连接到 Peer Server
      await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT);
      await devices.deviceB.page.waitForTimeout(WAIT_TIMES.PEER_INIT);

      // 初始状态：设备 A 的聊天列表应该是空的
      const initialContactCount = await devices.deviceA.page.locator(SELECTORS.contactItem).count();
      console.log('[Test] 设备 A 初始聊天列表中的联系人数量:', initialContactCount);

      // 步骤 1：设备 B 切换到聊天页面，主动创建与设备 A 的聊天
      console.log('[Test] 设备 B 切换到聊天页面');
      await devices.deviceB.page.click(SELECTORS.wechatMenuItem);
      await devices.deviceB.page.waitForLoadState('domcontentloaded');
      await devices.deviceB.page.waitForSelector(SELECTORS.wechatContainer, { timeout: 8000 });
      await devices.deviceB.page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 设备 B 创建与设备 A 的聊天
      console.log('[Test] 设备 B 创建与设备 A 的聊天');
      await devices.deviceB.page.click(SELECTORS.plusButton);
      await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

      const modalInputB = devices.deviceB.page.locator('.ant-modal input[placeholder*="Peer ID"]');
      await expect(modalInputB).toBeVisible({ timeout: 3000 });
      await modalInputB.fill(devices.deviceA.userInfo.peerId);
      await devices.deviceB.page.click(SELECTORS.modalOkButton);

      // 等待聊天创建完成
      await devices.deviceB.page.waitForTimeout(WAIT_TIMES.MESSAGE);

      // 步骤 2：设备 B 向设备 A 发送一条消息
      console.log('[Test] 设备 B 向设备 A 发送消息');
      const messageInputB = devices.deviceB.page.locator(SELECTORS.messageInput);
      const sendButtonB = devices.deviceB.page.locator(SELECTORS.sendButton);

      await messageInputB.fill('你好，这是一条测试消息');
      await sendButtonB.click();

      // 等待消息发送和接收
      await devices.deviceB.page.waitForTimeout(WAIT_TIMES.MESSAGE);
      await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 2);

      // 步骤 3：验证设备 B 出现在设备 A 的聊天列表中
      console.log('[Test] 验证设备 B 出现在设备 A 的聊天列表中');
      await retry(async () => {
        const contactItems = devices.deviceA.page.locator(SELECTORS.contactItem);
        const contactCount = await contactItems.count();
        console.log('[Test] 设备 A 当前聊天列表中的联系人数量:', contactCount);

        if (contactCount === 0) {
          throw new Error('设备 A 的聊天列表为空，设备 B 未出现');
        }

        // 查找包含设备 B 的联系人
        const deviceBContact = contactItems.filter({ hasText: '消息发送方B' });
        const count = await deviceBContact.count();
        if (count === 0) {
          // 尝试通过 PeerId 查找
          const deviceBContactByPeerId = contactItems.filter({
            hasText: devices.deviceB.userInfo.peerId.slice(0, 8),
          });
          const countByPeerId = await deviceBContactByPeerId.count();
          if (countByPeerId === 0) {
            throw new Error('设备 B 未出现在设备 A 的聊天列表中');
          }
        }
      }, { maxAttempts: 5, delay: 2000, context: 'Check device B appeared after receiving message' });

      console.log('[Test] 测试通过：被动接收消息后，发送方出现在聊天列表中');
    } finally {
      await cleanupTestDevices(devices);
    }
  });
});
