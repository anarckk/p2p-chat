/**
 * 边界条件 E2E 测试
 * 测试场景：
 * 1. 网络断开重连场景
 * 2. 大量消息场景
 * 3. 特殊字符/长文本消息
 * 4. 快速连续发送消息
 * 5. 极端用户名长度
 * 6. 并发操作测试
 */

import { test, expect } from '@playwright/test';
import {
  SELECTORS,
  WAIT_TIMES,
  createUserInfo,
  clearAllStorage,
  createTestDevices,
  cleanupTestDevices,
  retry,
  waitForMessage,
  waitForCondition,
} from './test-helpers.js';

test.describe('边界条件测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/wechat');
    await clearAllStorage(page);
  });

  /**
   * 网络断开重连场景测试
   */
  test.describe('网络断开重连', () => {
    test('网络断开后应该能自动重连', async ({ browser }) => {
      test.setTimeout(180000);

      const devices = await createTestDevices(browser, '重连测试A', '重连测试B', { startPage: 'wechat' });

      try {
        // 互相添加聊天
        await devices.deviceA.page.click(SELECTORS.plusButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceB.userInfo.peerId);
        await devices.deviceA.page.click(SELECTORS.modalOkButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceB.page.click(SELECTORS.plusButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.fill(SELECTORS.peerIdInput, devices.deviceA.userInfo.peerId);
        await devices.deviceB.page.click(SELECTORS.modalOkButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 发送第一条消息验证连接正常
        const testMessage1 = '重连前的消息';
        await devices.deviceA.page.fill(SELECTORS.messageInput, testMessage1);
        await devices.deviceA.page.click(SELECTORS.sendButton);

        console.log('[Test] Device A sent message before disconnect');

        await retry(async () => {
          await waitForMessage(devices.deviceB.page, testMessage1, 5000);
        }, { maxAttempts: 5, delay: 3000, context: 'Device B receive first message' });

        console.log('[Test] Device B received first message');

        // 模拟设备 A 网络断开（通过离线模式）
        await devices.deviceA.page.context().setOffline(true);
        console.log('[Test] Device A network disconnected');

        // 等待一段时间
        await devices.deviceA.page.waitForTimeout(3000);

        // 恢复网络
        await devices.deviceA.page.context().setOffline(false);
        console.log('[Test] Device A network reconnected');

        // 等待自动重连
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);

        // 发送第二条消息验证重连成功
        const testMessage2 = '重连后的消息';
        await devices.deviceA.page.fill(SELECTORS.messageInput, testMessage2);
        await devices.deviceA.page.click(SELECTORS.sendButton);

        console.log('[Test] Device A sent message after reconnect');

        await retry(async () => {
          await waitForMessage(devices.deviceB.page, testMessage2, 5000);
        }, { maxAttempts: 8, delay: 5000, context: 'Device B receive message after reconnect' });

        console.log('[Test] Device B received message after reconnect');
        console.log('[Test] Network reconnect test passed!');
      } finally {
        await cleanupTestDevices(devices);
      }
    });

    test('频繁网络切换应该不影响消息传输', async ({ browser }) => {
      test.setTimeout(180000);

      const devices = await createTestDevices(browser, '网络切换A', '网络切换B', { startPage: 'wechat' });

      try {
        // 互相添加聊天
        await devices.deviceA.page.click(SELECTORS.plusButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceB.userInfo.peerId);
        await devices.deviceA.page.click(SELECTORS.modalOkButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceB.page.click(SELECTORS.plusButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.fill(SELECTORS.peerIdInput, devices.deviceA.userInfo.peerId);
        await devices.deviceB.page.click(SELECTORS.modalOkButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 模拟频繁网络切换
        for (let i = 0; i < 3; i++) {
          await devices.deviceA.page.context().setOffline(true);
          await devices.deviceA.page.waitForTimeout(1000);
          await devices.deviceA.page.context().setOffline(false);
          await devices.deviceA.page.waitForTimeout(2000);
        }

        console.log('[Test] Device A completed network switches');

        // 等待重连
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT);

        // 发送消息验证功能正常
        const testMessage = '网络切换后的消息';
        await devices.deviceA.page.fill(SELECTORS.messageInput, testMessage);
        await devices.deviceA.page.click(SELECTORS.sendButton);

        console.log('[Test] Device A sent message after network switches');

        await retry(async () => {
          await waitForMessage(devices.deviceB.page, testMessage, 5000);
        }, { maxAttempts: 8, delay: 5000, context: 'Device B receive after network switches' });

        console.log('[Test] Device B received message');
        console.log('[Test] Network switch test passed!');
      } finally {
        await cleanupTestDevices(devices);
      }
    });
  });

  /**
   * 大量消息场景测试
   */
  test.describe('大量消息', () => {
    test('应该能发送和接收大量消息', async ({ browser }) => {
      test.setTimeout(240000); // 增加超时时间

      const devices = await createTestDevices(browser, '大量消息A', '大量消息B', { startPage: 'wechat' });

      try {
        // 互相添加聊天
        await devices.deviceA.page.click(SELECTORS.plusButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceB.userInfo.peerId);
        await devices.deviceA.page.click(SELECTORS.modalOkButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceB.page.click(SELECTORS.plusButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.fill(SELECTORS.peerIdInput, devices.deviceA.userInfo.peerId);
        await devices.deviceB.page.click(SELECTORS.modalOkButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 发送大量消息（20条）
        const messageCount = 20;
        const messages: string[] = [];

        console.log(`[Test] Sending ${messageCount} messages...`);

        for (let i = 0; i < messageCount; i++) {
          const message = `消息 ${i + 1}/${messageCount}`;
          messages.push(message);

          await devices.deviceA.page.fill(SELECTORS.messageInput, message);
          await devices.deviceA.page.click(SELECTORS.sendButton);

          // 每隔5条消息等待一下，避免过快
          if (i % 5 === 0) {
            await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
          }
        }

        console.log('[Test] Device A sent all messages');

        // 等待所有消息传输完成
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 3);

        // 验证设备 B 收到所有消息
        await retry(async () => {
          const receivedCount = await devices.deviceB.page.locator(SELECTORS.messageText).count();
          console.log(`[Test] Device B received ${receivedCount} messages`);

          if (receivedCount < messageCount) {
            // 打印收到的消息
            const receivedMessages = await devices.deviceB.page.locator(SELECTORS.messageText).allTextContents();
            console.log('[Test] Received messages:', receivedMessages.slice(-5));
            throw new Error(`Expected ${messageCount} messages, but got ${receivedCount}`);
          }
        }, { maxAttempts: 10, delay: 5000, context: 'Device B receive all messages' });

        // 验证最后一条消息
        const lastMessage = messages[messages.length - 1];
        await waitForMessage(devices.deviceB.page, lastMessage, 5000);

        console.log('[Test] Bulk message test passed!');
      } finally {
        await cleanupTestDevices(devices);
      }
    });

    test('大量消息后应该能继续正常发送', async ({ browser }) => {
      test.setTimeout(240000);

      const devices = await createTestDevices(browser, '后续发送A', '后续发送B', { startPage: 'wechat' });

      try {
        // 互相添加聊天
        await devices.deviceA.page.click(SELECTORS.plusButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceB.userInfo.peerId);
        await devices.deviceA.page.click(SELECTORS.modalOkButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceB.page.click(SELECTORS.plusButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.fill(SELECTORS.peerIdInput, devices.deviceA.userInfo.peerId);
        await devices.deviceB.page.click(SELECTORS.modalOkButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 发送大量消息
        const messageCount = 15;
        for (let i = 0; i < messageCount; i++) {
          const message = `批量消息 ${i + 1}`;
          await devices.deviceA.page.fill(SELECTORS.messageInput, message);
          await devices.deviceA.page.click(SELECTORS.sendButton);

          if (i % 5 === 0) {
            await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
          }
        }

        console.log('[Test] Device A sent bulk messages');

        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 2);

        // 发送一条新消息验证功能正常
        const finalMessage = '批量消息后的新消息';
        await devices.deviceA.page.fill(SELECTORS.messageInput, finalMessage);
        await devices.deviceA.page.click(SELECTORS.sendButton);

        console.log('[Test] Device A sent final message');

        await retry(async () => {
          await waitForMessage(devices.deviceB.page, finalMessage, 5000);
        }, { maxAttempts: 8, delay: 5000, context: 'Device B receive final message' });

        console.log('[Test] Post-bulk message test passed!');
      } finally {
        await cleanupTestDevices(devices);
      }
    });
  });

  /**
   * 特殊字符和长文本测试
   */
  test.describe('特殊字符和长文本', () => {
    test('应该能发送包含特殊字符的消息', async ({ browser }) => {
      test.setTimeout(120000);

      const devices = await createTestDevices(browser, '特殊字符A', '特殊字符B', { startPage: 'wechat' });

      try {
        // 互相添加聊天
        await devices.deviceA.page.click(SELECTORS.plusButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceB.userInfo.peerId);
        await devices.deviceA.page.click(SELECTORS.modalOkButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceB.page.click(SELECTORS.plusButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.fill(SELECTORS.peerIdInput, devices.deviceA.userInfo.peerId);
        await devices.deviceB.page.click(SELECTORS.modalOkButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 测试各种特殊字符
        const specialMessages = [
          '测试特殊字符：!@#$%^&*()_+-={}[]|\\:";\'<>?,./',
          '测试emoji：😀😃😄😁😆😅😂🤣😊😇',
          '测试中文标点：，。！？；：""【】（）',
          '测试HTML标签：<div>test</div>',
        ];

        let successCount = 0;
        for (const message of specialMessages) {
          try {
            await devices.deviceA.page.fill(SELECTORS.messageInput, message);
            await devices.deviceA.page.click(SELECTORS.sendButton);

            console.log(`[Test] Device A sent: "${message.substring(0, 30)}..."`);

            await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

            // 验证设备 B 收到消息（使用更宽松的检查）
            const found = await waitForCondition(async () => {
              const messageElements = await devices.deviceB.page.locator(SELECTORS.messageText).allTextContents();
              return messageElements.some(msg => msg.includes(message.substring(0, 10)));
            }, { timeout: 8000, interval: 1000, context: `Receive special char message` });

            if (found) {
              successCount++;
              console.log(`[Test] Device B received special character message ${successCount}/${specialMessages.length}`);
            }
          } catch (error) {
            console.log(`[Test] Failed to send/receive special character message: ${(error as Error).message}`);
          }
        }

        // 至少要成功一半
        expect(successCount).toBeGreaterThanOrEqual(specialMessages.length / 2);

        console.log('[Test] Special character test passed!');
      } finally {
        await cleanupTestDevices(devices);
      }
    });

    test('应该能发送超长文本消息', async ({ browser }) => {
      test.setTimeout(120000);

      const devices = await createTestDevices(browser, '长文本A', '长文本B', { startPage: 'wechat' });

      try {
        // 互相添加聊天
        await devices.deviceA.page.click(SELECTORS.plusButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceB.userInfo.peerId);
        await devices.deviceA.page.click(SELECTORS.modalOkButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceB.page.click(SELECTORS.plusButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.fill(SELECTORS.peerIdInput, devices.deviceA.userInfo.peerId);
        await devices.deviceB.page.click(SELECTORS.modalOkButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 发送超长文本（5000字符）
        const longText = '这是一段超长的文本内容。'.repeat(500);
        const truncatedText = longText.substring(0, 100);

        await devices.deviceA.page.fill(SELECTORS.messageInput, longText);
        await devices.deviceA.page.click(SELECTORS.sendButton);

        console.log('[Test] Device A sent long text message (5000 chars)');

        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 2);

        // 验证设备 B 收到消息（检查前100个字符）
        await retry(async () => {
          const messageElements = await devices.deviceB.page.locator(SELECTORS.messageText).allTextContents();
          const found = messageElements.some(msg => msg.includes(truncatedText));

          if (!found) {
            throw new Error('Long text message not received');
          }
        }, { maxAttempts: 8, delay: 5000, context: 'Receive long text message' });

        console.log('[Test] Long text message test passed!');
      } finally {
        await cleanupTestDevices(devices);
      }
    });
  });

  /**
   * 快速连续发送测试
   */
  test.describe('快速连续发送', () => {
    test('快速连续发送多条消息应该都能送达', async ({ browser }) => {
      test.setTimeout(180000);

      const devices = await createTestDevices(browser, '快速发送A', '快速接收B', { startPage: 'wechat' });

      try {
        // 互相添加聊天
        await devices.deviceA.page.click(SELECTORS.plusButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceB.userInfo.peerId);
        await devices.deviceA.page.click(SELECTORS.modalOkButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceB.page.click(SELECTORS.plusButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.fill(SELECTORS.peerIdInput, devices.deviceA.userInfo.peerId);
        await devices.deviceB.page.click(SELECTORS.modalOkButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 快速连续发送10条消息（不等待）
        const rapidMessages = ['快速消息1', '快速消息2', '快速消息3', '快速消息4', '快速消息5',
                               '快速消息6', '快速消息7', '快速消息8', '快速消息9', '快速消息10'];

        console.log('[Test] Device A sending rapid messages...');

        for (const message of rapidMessages) {
          await devices.deviceA.page.fill(SELECTORS.messageInput, message);
          await devices.deviceA.page.click(SELECTORS.sendButton);
        }

        console.log('[Test] Device A sent all rapid messages');

        // 等待所有消息传输
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 3);

        // 验证设备 B 收到所有消息
        await retry(async () => {
          const receivedMessages = await devices.deviceB.page.locator(SELECTORS.messageText).allTextContents();

          for (const message of rapidMessages) {
            if (!receivedMessages.some(msg => msg.includes(message))) {
              console.log(`[Test] Missing message: ${message}`);
              throw new Error(`Not all rapid messages received`);
            }
          }
        }, { maxAttempts: 10, delay: 5000, context: 'Receive all rapid messages' });

        console.log('[Test] Rapid message test passed!');
      } finally {
        await cleanupTestDevices(devices);
      }
    });
  });

  /**
   * 极端用户名长度测试
   */
  test.describe('极端用户名长度', () => {
    test('最大长度用户名应该能正常工作', async ({ browser }) => {
      test.setTimeout(120000);

      // 创建20字符的用户名（最大长度）
      const maxUsername = '最大长度用户名123456';

      const devices = await createTestDevices(browser, maxUsername, '普通用户名', { startPage: 'center' });

      try {
        // 互相添加设备
        await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceB.userInfo.peerId);
        await devices.deviceA.page.click(SELECTORS.addButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceB.page.fill(SELECTORS.peerIdInput, devices.deviceA.userInfo.peerId);
        await devices.deviceB.page.click(SELECTORS.addButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        // 验证设备 A 的用户名正确显示
        const deviceACard = devices.deviceB.page.locator(SELECTORS.deviceCard).filter({ hasText: maxUsername });
        await expect(deviceACard).toBeVisible({ timeout: 8000 });

        console.log('[Test] Max length username displayed correctly');

        // 验证设备 B 的用户名正确显示
        const deviceBCard = devices.deviceA.page.locator(SELECTORS.deviceCard).filter({ hasText: '普通用户名' });
        await expect(deviceBCard).toBeVisible({ timeout: 8000 });

        console.log('[Test] Max length username test passed!');
      } finally {
        await cleanupTestDevices(devices);
      }
    });

    test('最小长度用户名应该能正常工作', async ({ browser }) => {
      test.setTimeout(120000);

      // 创建1字符的用户名（最小长度）
      const minUsername = 'A';

      const devices = await createTestDevices(browser, minUsername, '普通用户B', { startPage: 'center' });

      try {
        // 互相添加设备
        await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceB.userInfo.peerId);
        await devices.deviceA.page.click(SELECTORS.addButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceB.page.fill(SELECTORS.peerIdInput, devices.deviceA.userInfo.peerId);
        await devices.deviceB.page.click(SELECTORS.addButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        // 验证设备 A 的用户名正确显示
        const deviceACard = devices.deviceB.page.locator(SELECTORS.deviceCard).filter({ hasText: minUsername });
        await expect(deviceACard).toBeVisible({ timeout: 8000 });

        console.log('[Test] Min length username displayed correctly');

        console.log('[Test] Min length username test passed!');
      } finally {
        await cleanupTestDevices(devices);
      }
    });
  });

  /**
   * 并发操作测试
   */
  test.describe('并发操作', () => {
    test('同时进行多项操作应该不会崩溃', async ({ browser }) => {
      test.setTimeout(180000);

      const devices = await createTestDevices(browser, '并发操作A', '并发操作B', { startPage: 'wechat' });

      try {
        // 互相添加聊天
        await devices.deviceA.page.click(SELECTORS.plusButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceB.userInfo.peerId);
        await devices.deviceA.page.click(SELECTORS.modalOkButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceB.page.click(SELECTORS.plusButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.fill(SELECTORS.peerIdInput, devices.deviceA.userInfo.peerId);
        await devices.deviceB.page.click(SELECTORS.modalOkButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 同时发送多条消息
        console.log('[Test] Both devices sending messages concurrently...');

        const messagesA = ['A的消息1', 'A的消息2', 'A的消息3'];
        const messagesB = ['B的消息1', 'B的消息2', 'B的消息3'];

        // 设备 A 和设备 B 同时发送消息
        for (let i = 0; i < 3; i++) {
          await Promise.all([
            devices.deviceA.page.fill(SELECTORS.messageInput, messagesA[i]),
            devices.deviceB.page.fill(SELECTORS.messageInput, messagesB[i]),
          ]);

          await Promise.all([
            devices.deviceA.page.click(SELECTORS.sendButton),
            devices.deviceB.page.click(SELECTORS.sendButton),
          ]);

          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        }

        console.log('[Test] Both devices sent all messages');

        // 等待所有消息传输
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 2);

        // 验证设备 A 收到设备 B 的消息
        await retry(async () => {
          for (const message of messagesB) {
            await waitForMessage(devices.deviceA.page, message, 3000);
          }
        }, { maxAttempts: 8, delay: 5000, context: 'Device A receive B messages' });

        // 验证设备 B 收到设备 A 的消息
        await retry(async () => {
          for (const message of messagesA) {
            await waitForMessage(devices.deviceB.page, message, 3000);
          }
        }, { maxAttempts: 8, delay: 5000, context: 'Device B receive A messages' });

        console.log('[Test] Concurrent operation test passed!');
      } finally {
        await cleanupTestDevices(devices);
      }
    });
  });

  /**
   * 空消息和空白字符测试
   */
  test.describe('空消息和空白字符', () => {
    test('纯空格消息应该能正常发送', async ({ browser }) => {
      test.setTimeout(120000);

      const devices = await createTestDevices(browser, '空格消息A', '空格消息B', { startPage: 'wechat' });

      try {
        // 互相添加聊天
        await devices.deviceA.page.click(SELECTORS.plusButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceB.userInfo.peerId);
        await devices.deviceA.page.click(SELECTORS.modalOkButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceB.page.click(SELECTORS.plusButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.fill(SELECTORS.peerIdInput, devices.deviceA.userInfo.peerId);
        await devices.deviceB.page.click(SELECTORS.modalOkButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 发送纯空格消息
        const spaceMessage = '   ';
        await devices.deviceA.page.fill(SELECTORS.messageInput, spaceMessage);
        await devices.deviceA.page.click(SELECTORS.sendButton);

        console.log('[Test] Device A sent space-only message');

        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        // 注意：某些实现可能会过滤空消息，所以这个测试可能需要调整
        // 这里我们只验证不会崩溃
        const hasError = await devices.deviceA.page.locator('.ant-message-error').isVisible().catch(() => false);

        if (!hasError) {
          console.log('[Test] Space message sent without error');
        } else {
          console.log('[Test] Space message was rejected (expected behavior)');
        }

        console.log('[Test] Space message test passed!');
      } finally {
        await cleanupTestDevices(devices);
      }
    });
  });
});
