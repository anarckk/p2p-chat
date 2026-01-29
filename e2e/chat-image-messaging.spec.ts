/**
 * 聊天图片发送功能 E2E 测试
 * 测试场景：用户 A 发送图片给用户 B，验证用户 B 能收到并显示图片
 */

import { test, expect } from '@playwright/test';
import {
  createTestDevices,
  cleanupTestDevices,
  setupUser,
  createChat,
  getPeerIdFromStorage,
  SELECTORS,
  WAIT_TIMES,
  retry,
} from './test-helpers';

test.describe('聊天图片发送功能', () => {
  test('用户 A 发送图片给用户 B，用户 B 能收到并显示图片', async ({ browser }) => {
    test.setTimeout(120000); // 增加超时时间
    // 创建两个测试设备（从发现中心开始，确保 Peer 连接稳定）
    const devices = await createTestDevices(browser, '设备A', '设备B', { startPage: 'center' });

    try {
      const { page: pageA } = devices.deviceA;
      const { page: pageB } = devices.deviceB;

      // 注册控制台监听器以捕获调试日志
      const deviceALogs: string[] = [];
      const deviceBLogs: string[] = [];
      pageA.on('console', msg => deviceALogs.push(msg.text()));
      pageB.on('console', msg => deviceBLogs.push(msg.text()));

      // 额外等待确保两个设备的 Peer 连接都稳定
      await pageA.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);
      await pageB.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);

      // 获取设备 B 的 PeerId
      const peerIdB = await getPeerIdFromStorage(pageB);
      expect(peerIdB).not.toBeNull();
      console.log('[Test] 设备 B PeerId:', peerIdB);

      // 设备 B 先切换到聊天页面并等待准备接收消息
      console.log('[Test] 设备 B 切换到聊天页面');
      await pageB.click(SELECTORS.wechatMenuItem);
      await pageB.waitForTimeout(WAIT_TIMES.SHORT);

      // 设备 B 需要更多时间确保 messageHandler 已注册并准备好接收消息
      console.log('[Test] 等待设备 B 消息处理器准备就绪...');
      await pageB.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);

      // 设备 A 切换到聊天页面
      console.log('[Test] 设备 A 切换到聊天页面');
      await pageA.click(SELECTORS.wechatMenuItem);
      await pageA.waitForTimeout(WAIT_TIMES.SHORT);

      // 额外等待确保 Peer 连接稳定
      await pageA.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);

      // 在设备 A 上创建与设备 B 的聊天
      console.log('[Test] 在设备 A 上创建与设备 B 的聊天');
      await createChat(pageA, peerIdB!);

      // 选择聊天
      await pageA.click(SELECTORS.contactItem);
      await pageA.waitForTimeout(WAIT_TIMES.SHORT);

      // 点击图片上传按钮
      console.log('[Test] 点击图片上传按钮');
      const imageUploadButton = pageA.locator('button[aria-label="upload-image"]');
      await expect(imageUploadButton).toBeVisible();
      await imageUploadButton.click();

      // 创建一个简单的测试图片（1x1 红色 PNG）
      // 使用 Buffer 创建一个最小的 PNG 文件
      const testImagePng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
        'base64'
      );

      // 上传图片文件
      console.log('[Test] 上传图片文件');
      const fileInput = pageA.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'test-image.png',
        mimeType: 'image/png',
        buffer: testImagePng,
      });

      // 等待图片上传和发送
      await pageA.waitForTimeout(WAIT_TIMES.MESSAGE);

      // 验证设备 A 上显示了图片消息
      console.log('[Test] 验证设备 A 上显示了图片消息');
      const imageMessageA = pageA.locator('.message-image').first();
      await expect(imageMessageA).toBeVisible({ timeout: 10000 });

      // 验证图片元素存在
      const imageElementA = imageMessageA.locator('img');
      await expect(imageElementA).toBeVisible();

      // 验证文件名显示
      const fileNameA = imageMessageA.locator('.file-name');
      await expect(fileNameA).toContainText('test-image.png');

      // 打印相关的调试日志
      console.log('[Test] Device A relevant logs:');
      deviceALogs.filter(log => log.includes('[Peer') || log.includes('[WeChat') || log.includes('version') || log.includes('image')).forEach(log => console.log('  ', log));

      console.log('[Test] Device B relevant logs:');
      deviceBLogs.filter(log => log.includes('[Peer') || log.includes('[WeChat') || log.includes('version') || log.includes('image')).forEach(log => console.log('  ', log));

      // 等待足够的时间让消息通过 P2P 传输
      console.log('[Test] 等待消息通过 P2P 传输');
      await pageB.waitForTimeout(WAIT_TIMES.MESSAGE * 5);

      // 刷新设备 B 的页面以加载可能的消息
      console.log('[Test] 刷新设备 B 页面');
      await pageB.reload();
      await pageB.waitForTimeout(WAIT_TIMES.RELOAD);

      // 页面刷新后需要重新点击联系人以触发 loadMessages
      console.log('[Test] 点击设备 B 上的联系人');
      await pageB.click(SELECTORS.contactItem);
      await pageB.waitForTimeout(WAIT_TIMES.SHORT);

      // 使用重试机制检查设备 B 是否收到了图片消息
      console.log('[Test] 检查设备 B 是否收到图片消息');
      const imageReceived = await retry(async () => {
        const imageMessageB = pageB.locator('.message-image');
        const count = await imageMessageB.count();
        if (count > 0) {
          // 验证图片元素存在
          const imageElementB = imageMessageB.first().locator('img');
          const isVisible = await imageElementB.isVisible();
          if (isVisible) {
            return true;
          }
        }
        throw new Error('Image message not found in Device B');
      }, { maxAttempts: 3, delay: 3000, context: 'Check image message in Device B' });

      // 验证设备 B 上收到了图片消息
      expect(imageReceived).toBeTruthy();

      const imageMessageB = pageB.locator('.message-image').first();
      await expect(imageMessageB).toBeVisible({ timeout: 5000 });

      // 验证图片元素存在
      const imageElementB = imageMessageB.locator('img');
      await expect(imageElementB).toBeVisible();

      // 验证文件名显示
      const fileNameB = imageMessageB.locator('.file-name');
      await expect(fileNameB).toContainText('test-image.png');

      // 验证图片的 src 属性不为空
      const imageSrc = await imageElementB.getAttribute('src');
      expect(imageSrc).toBeTruthy();
      expect(imageSrc?.startsWith('data:image/png')).toBeTruthy();

      console.log('[Test] 测试通过：图片消息成功发送和接收');
    } finally {
      // 清理测试设备
      await cleanupTestDevices(devices);
    }
  });

  test('用户发送图片后，消息状态显示为已送达', async ({ browser }) => {
    test.setTimeout(120000); // 增加超时时间
    // 创建两个测试设备（从发现中心开始，确保 Peer 连接稳定）
    const devices = await createTestDevices(browser, '发送方', '接收方', { startPage: 'center' });

    try {
      const { page: senderPage } = devices.deviceA;
      const { page: receiverPage } = devices.deviceB;

      // 注册控制台监听器以捕获调试日志
      const senderLogs: string[] = [];
      const receiverLogs: string[] = [];
      senderPage.on('console', msg => senderLogs.push(msg.text()));
      receiverPage.on('console', msg => receiverLogs.push(msg.text()));

      // 额外等待确保两个设备的 Peer 连接都稳定
      await senderPage.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);
      await receiverPage.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);

      // 获取接收方的 PeerId
      const receiverPeerId = await getPeerIdFromStorage(receiverPage);
      expect(receiverPeerId).not.toBeNull();

      // 接收方先切换到聊天页面并等待准备接收消息
      await receiverPage.click(SELECTORS.wechatMenuItem);
      await receiverPage.waitForTimeout(WAIT_TIMES.SHORT);
      await receiverPage.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);

      // 发送方切换到聊天页面
      await senderPage.click(SELECTORS.wechatMenuItem);
      await senderPage.waitForTimeout(WAIT_TIMES.SHORT);
      await senderPage.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);

      // 在发送方创建与接收方的聊天
      await createChat(senderPage, receiverPeerId!);
      await senderPage.click(SELECTORS.contactItem);
      await senderPage.waitForTimeout(WAIT_TIMES.SHORT);

      // 点击图片上传按钮
      const imageUploadButton = senderPage.locator('button[aria-label="upload-image"]');
      await expect(imageUploadButton).toBeVisible();
      await imageUploadButton.click();

      // 创建测试图片
      const testImagePng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
        'base64'
      );

      // 上传图片文件
      const fileInput = senderPage.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'delivery-test.png',
        mimeType: 'image/png',
        buffer: testImagePng,
      });

      // 等待图片上传和发送
      await senderPage.waitForTimeout(WAIT_TIMES.MESSAGE * 2);

      // 验证发送方上显示了图片消息
      const imageMessage = senderPage.locator('.message-item.is-self .message-image').first();
      await expect(imageMessage).toBeVisible({ timeout: 10000 });

      // 等待消息状态变为已送达
      console.log('[Test] 等待消息状态变为已送达');
      await senderPage.waitForTimeout(WAIT_TIMES.MESSAGE);

      // 打印相关的调试日志
      console.log('[Test] Sender relevant logs:');
      senderLogs.filter(log => log.includes('delivery_ack') || log.includes('delivered')).forEach(log => console.log('  ', log));

      // 验证消息状态显示为已送达（绿色对勾图标）
      const deliveredStatus = senderPage.locator('.message-item.is-self').first().locator('.message-status-delivered');
      await expect(deliveredStatus).toBeVisible({ timeout: 10000 });

      console.log('[Test] 测试通过：图片消息状态正确显示为已送达');
    } finally {
      // 清理测试设备
      await cleanupTestDevices(devices);
    }
  });

  test('发送多张图片，所有图片都能正确传输', async ({ browser }) => {
    test.setTimeout(180000); // 增加超时时间（发送多张图片需要更长时间）
    // 创建两个测试设备（从发现中心开始，确保 Peer 连接稳定）
    const devices = await createTestDevices(browser, '多图发送者', '多图接收者', { startPage: 'center' });

    try {
      const { page: pageA } = devices.deviceA;
      const { page: pageB } = devices.deviceB;

      // 注册控制台监听器以捕获调试日志
      const deviceALogs: string[] = [];
      const deviceBLogs: string[] = [];
      pageA.on('console', msg => deviceALogs.push(msg.text()));
      pageB.on('console', msg => deviceBLogs.push(msg.text()));

      // 额外等待确保两个设备的 Peer 连接都稳定
      await pageA.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);
      await pageB.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);

      // 获取设备 B 的 PeerId
      const peerIdB = await getPeerIdFromStorage(pageB);
      expect(peerIdB).not.toBeNull();

      // 设备 B 先切换到聊天页面并等待准备接收消息
      await pageB.click(SELECTORS.wechatMenuItem);
      await pageB.waitForTimeout(WAIT_TIMES.SHORT);
      await pageB.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);

      // 设备 A 切换到聊天页面
      await pageA.click(SELECTORS.wechatMenuItem);
      await pageA.waitForTimeout(WAIT_TIMES.SHORT);
      await pageA.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);

      // 在设备 A 上创建与设备 B 的聊天
      await createChat(pageA, peerIdB!);
      await pageA.click(SELECTORS.contactItem);
      await pageA.waitForTimeout(WAIT_TIMES.SHORT);

      // 创建测试图片
      const testImagePng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
        'base64'
      );

      // 发送三张图片
      const imageCount = 3;
      for (let i = 0; i < imageCount; i++) {
        console.log(`[Test] 发送第 ${i + 1} 张图片`);

        // 点击图片上传按钮
        const imageUploadButton = pageA.locator('button[aria-label="upload-image"]');
        await imageUploadButton.click();

        // 上传图片文件
        const fileInput = pageA.locator('input[type="file"]');
        await fileInput.setInputFiles({
          name: `test-image-${i + 1}.png`,
          mimeType: 'image/png',
          buffer: testImagePng,
        });

        // 等待图片上传
        await pageA.waitForTimeout(WAIT_TIMES.LONG);
      }

      // 等待所有图片发送完成
      await pageA.waitForTimeout(WAIT_TIMES.MESSAGE * 3);

      // 验证发送方上显示了所有图片消息
      console.log('[Test] 验证发送方上显示了所有图片消息');
      const imageMessagesA = pageA.locator('.message-item.is-self .message-image');
      await expect(imageMessagesA).toHaveCount(imageCount, { timeout: 20000 });

      // 切换到设备 B，等待接收所有图片
      console.log('[Test] 切换到设备 B，等待接收所有图片');
      await pageB.waitForTimeout(WAIT_TIMES.MESSAGE * 5);

      // 刷新设备 B 的页面以加载可能的消息
      await pageB.reload();
      await pageB.waitForTimeout(WAIT_TIMES.RELOAD);

      // 页面刷新后需要重新点击联系人以触发 loadMessages
      await pageB.click(SELECTORS.contactItem);
      await pageB.waitForTimeout(WAIT_TIMES.SHORT);

      // 打印相关的调试日志
      console.log('[Test] Device A relevant logs:');
      deviceALogs.filter(log => log.includes('[Peer') || log.includes('[WeChat') || log.includes('version')).forEach(log => console.log('  ', log));

      console.log('[Test] Device B relevant logs:');
      deviceBLogs.filter(log => log.includes('[Peer') || log.includes('[WeChat') || log.includes('version')).forEach(log => console.log('  ', log));

      // 使用重试机制验证设备 B 上收到了所有图片消息
      const allImagesReceived = await retry(async () => {
        const imageMessagesB = pageB.locator('.message-image');
        const count = await imageMessagesB.count();
        if (count >= imageCount) {
          return true;
        }
        throw new Error(`Expected ${imageCount} images, but found ${count}`);
      }, { maxAttempts: 3, delay: 3000, context: 'Check all images in Device B' });

      // 验证设备 B 上收到了所有图片消息
      expect(allImagesReceived).toBeTruthy();

      // 验证每张图片的文件名
      for (let i = 1; i <= imageCount; i++) {
        const fileName = pageB.locator('.file-name').filter({ hasText: `test-image-${i}.png` });
        await expect(fileName).toBeVisible({ timeout: 5000 });
      }

      console.log('[Test] 测试通过：多张图片消息成功发送和接收');
    } finally {
      // 清理测试设备
      await cleanupTestDevices(devices);
    }
  });
});
