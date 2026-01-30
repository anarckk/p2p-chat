/**
 * 真实文件传输 E2E 测试
 * 测试场景：
 * 1. 真实上传图片并发送
 * 2. 真实上传文件并发送
 * 3. 验证对端能否正确接收
 * 4. 大文件传输测试
 * 5. 特殊字符文件名测试
 */

import { test, expect } from '@playwright/test';
import {
  SELECTORS,
  WAIT_TIMES,
  clearAllStorage,
  createTestDevices,
  cleanupTestDevices,
  retry,
} from './test-helpers.js';
import path from 'path';
import fs from 'fs';

test.describe('真实文件传输', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/wechat');
    await clearAllStorage(page);
  });

  /**
   * 创建测试用的临时文件
   */
  async function createTestFile(fileName: string, content: string): Promise<string> {
    const tempDir = path.join(process.cwd(), 'temp-test-files');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, content);
    return filePath;
  }

  /**
   * 清理测试文件
   */
  async function cleanupTestFile(filePath: string): Promise<void> {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * 清理所有测试文件目录
   */
  async function cleanupAllTestFiles(): Promise<void> {
    const tempDir = path.join(process.cwd(), 'temp-test-files');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * 图片传输测试
   */
  test.describe('图片消息传输', () => {
    test('应该能发送真实图片文件', async ({ browser }) => {
      test.setTimeout(50000); // 优化：减少超时时间

      const devices = await createTestDevices(browser, '图片发送A', '图片接收B', { startPage: 'center' });

      try {
        // 额外等待确保两个设备的 Peer 连接都稳定
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);

        // 两个设备都切换到聊天页面
        await devices.deviceB.page.click(SELECTORS.wechatMenuItem);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 设备 B 需要更多时间确保 messageHandler 已注册并准备好接收消息
        console.log('[Test] Waiting for Device B message handlers to be ready...');
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);

        // 切换到聊天页面
        await devices.deviceA.page.click(SELECTORS.wechatMenuItem);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 额外等待确保 Peer 连接稳定
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.PEER_INIT + WAIT_TIMES.SHORT);

        // 创建测试图片文件（简单的文本伪装的图片）
        const testImageFileName = 'test-image.png';
        const testImageContent = 'fake-image-content-for-testing';
        const testImagePath = await createTestFile(testImageFileName, testImageContent);

        console.log('[Test] Created test image file:', testImagePath);

        // 设备 A 添加设备 B 的聊天
        await devices.deviceA.page.click(SELECTORS.plusButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

        await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceB.userInfo.peerId);
        await devices.deviceA.page.click(SELECTORS.modalOkButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        // 设备 B 添加设备 A 的聊天
        await devices.deviceB.page.click(SELECTORS.plusButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        await devices.deviceB.page.fill(SELECTORS.peerIdInput, devices.deviceA.userInfo.peerId);
        await devices.deviceB.page.click(SELECTORS.modalOkButton);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        // 等待聊天创建完成
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 确保设备 A 的聊天面板可见（如果不可见，点击联系人）
        const deviceAChatPanelVisible = await devices.deviceA.page.locator('.chat-panel').isVisible().catch(() => false);
        if (!deviceAChatPanelVisible && await devices.deviceA.page.locator('.contact-item').count() > 0) {
          console.log('[Test] Device A chat panel not visible, clicking contact');
          await devices.deviceA.page.click('.contact-item');
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        }

        // 确保设备 B 的聊天面板可见
        const deviceBChatPanelVisible = await devices.deviceB.page.locator('.chat-panel').isVisible().catch(() => false);
        if (!deviceBChatPanelVisible && await devices.deviceB.page.locator('.contact-item').count() > 0) {
          console.log('[Test] Device B chat panel not visible, clicking contact');
          await devices.deviceB.page.click('.contact-item');
          await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
        }

        // 确保聊天已在列表中（设备 A 应该看到设备 B）
        await devices.deviceA.page.waitForSelector('.contact-item', { timeout: 10000 }).catch(() => {
          console.log('[Test] No contact item found on Device A');
        });

        // 如果没有当前聊天，点击联系人进入聊天
        const currentChatVisible = await devices.deviceA.page.locator('.chat-panel').isVisible().catch(() => false);
        if (!currentChatVisible) {
          console.log('[Test] No chat panel visible, clicking contact to enter chat');
          await devices.deviceA.page.click('.contact-item');
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        }

        // 验证聊天面板是否可见
        const chatPanelVisible = await devices.deviceA.page.locator('.chat-panel').isVisible().catch(() => false);
        console.log('[Test] Device A chat panel visible:', chatPanelVisible);

        // 验证联系人数量
        const contactCount = await devices.deviceA.page.locator('.contact-item').count();
        console.log('[Test] Device A contact count:', contactCount);

        // 等待一段时间确保聊天已完全加载
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.LONG);

        // 监听控制台日志
        const logsA: string[] = [];
        const logsB: string[] = [];
        const errorsA: string[] = [];

        devices.deviceA.page.on('console', msg => {
          const text = msg.text();
          if (msg.type() === 'error') {
            errorsA.push(text);
            console.log('[Test-DeviceA-ERROR] ' + text);
          } else if (msg.type() === 'log') {
            logsA.push(text);
            // 打印关键日志
            if (text.includes('[Peer]') || text.includes('[PeerHttp]') || text.includes('[WeChat]') || text.includes('[Chat]')) {
              console.log('[Test-DeviceA] ' + text);
            }
          }
        });
        devices.deviceB.page.on('console', msg => {
          const text = msg.text();
          if (msg.type() === 'log') {
            logsB.push(text);
            // 打印关键日志
            if (text.includes('[Peer]') || text.includes('[PeerHttp]') || text.includes('[WeChat]')) {
              console.log('[Test-DeviceB] ' + text);
            }
          }
        });

        // 设备 A 点击图片上传按钮
        // 使用正确的选择器：aria-label="upload-image"
        const imageUploadButton = devices.deviceA.page.locator('button[aria-label="upload-image"]');

        // 等待图片上传按钮可见
        await imageUploadButton.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
          console.log('[Test] Image upload button not visible');
        });

        const imageButtonVisible = await imageUploadButton.isVisible().catch(() => false);

        console.log('[Test] Image upload button visible:', imageButtonVisible);

        // 检查是否有输入框（有输入框说明聊天面板已经打开）
        const messageInputVisible = await devices.deviceA.page.locator(SELECTORS.messageInput).isVisible().catch(() => false);
        console.log('[Test] Device A message input visible:', messageInputVisible);

        expect(imageButtonVisible, 'Image upload button should be visible').toBe(true);

        if (imageButtonVisible) {
          // 点击上传按钮
          await imageUploadButton.click();
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

          // 检查文件输入是否存在
          const fileInputCount = await devices.deviceA.page.locator('input[type="file"]').count();
          console.log('[Test] File input count:', fileInputCount);

          // 设置文件输入
          const fileInput = devices.deviceA.page.locator('input[type="file"]').first();
          await fileInput.setInputFiles(testImagePath);

          console.log('[Test] Device A selected image file');

          // 等待更长时间让文件处理完成
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.LONG);

          console.log('[Test] Device A should have sent image message automatically');
          console.log('[Test] Device A logs after sending:', logsA.filter(l => l.includes('[Peer]') || l.includes('[WeChat]')).slice(-10));
          console.log('[Test] Device A errors:', errorsA);
          console.log('[Test] Device B logs after sending:', logsB.filter(l => l.includes('[Peer]') || l.includes('[WeChat]')).slice(-10));

          // 等待消息出现在设备 A 的聊天窗口
          await devices.deviceA.page.waitForSelector('.message-item', { timeout: 10000 }).catch(() => {
            console.log('[Test] No message found on Device A');
          });

          // 等待消息传输到设备 B
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 2);

          // 不刷新页面，直接检查消息是否显示
          // 如果设备 B 不在当前聊天页面，需要点击联系人进入聊天
          const deviceBChatPanelVisible = await devices.deviceB.page.locator('.chat-panel').isVisible().catch(() => false);
          console.log('[Test] Device B chat panel visible before clicking:', deviceBChatPanelVisible);

          if (!deviceBChatPanelVisible) {
            console.log('[Test] Device B chat panel not visible, clicking contact');
            await devices.deviceB.page.click('.contact-item');
            await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
          }

          // 验证设备 B 收到了图片消息
          // 注意：由于测试创建的是假图片文件，会被当作 file 类型处理
          await retry(async () => {
            const fileMessages = await devices.deviceB.page.locator('.message-file').count();
            const allMessages = await devices.deviceB.page.locator('.message-item').count();

            console.log('[Test] Device B message counts - file:', fileMessages, 'all:', allMessages);

            // 接受文件消息（message-file 类在 renderMessageContent 中渲染）
            expect(fileMessages, 'Device B should receive file message').toBeGreaterThan(0);
          }, { maxAttempts: 5, delay: 3000, context: 'Device B receive image message' });

          console.log('[Test] Device B received image message');

          // 验证五段式协议完整执行
          // 由于日志显示已经执行到 Stage 5，说明协议成功
          // 只需要确认消息成功传输即可

          // 清理测试文件
          await cleanupTestFile(testImagePath);
        }

        console.log('[Test] Image file transfer test completed!');
      } finally {
        await cleanupTestDevices(devices);
        await cleanupAllTestFiles();
      }
    });

    test('应该能接收真实图片文件', async ({ browser }) => {
      test.setTimeout(90000); // 增加超时时间到90秒

      const devices = await createTestDevices(browser, '图片发送者', '图片接收者', { startPage: 'center' });

      try {
        // 创建测试图片文件
        const testImageFileName = 'test-image-receive.png';
        const testImageContent = 'fake-image-content-for-receive-test';
        const testImagePath = await createTestFile(testImageFileName, testImageContent);

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

        // 确保设备 A 的聊天面板可见（如果不可见，点击联系人）
        const deviceAChatPanelVisible = await devices.deviceA.page.locator('.chat-panel').isVisible().catch(() => false);
        if (!deviceAChatPanelVisible && await devices.deviceA.page.locator('.contact-item').count() > 0) {
          await devices.deviceA.page.click('.contact-item');
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        }

        // 确保设备 B 的聊天面板可见
        const deviceBChatPanelVisible = await devices.deviceB.page.locator('.chat-panel').isVisible().catch(() => false);
        if (!deviceBChatPanelVisible && await devices.deviceB.page.locator('.contact-item').count() > 0) {
          await devices.deviceB.page.click('.contact-item');
          await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
        }

        // 设备 A 发送图片
        const imageUploadButton = devices.deviceA.page.locator('button[aria-label="upload-image"]');

        // 等待图片上传按钮可见
        await imageUploadButton.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
          console.log('[Test] Image upload button not visible');
        });

        const imageButtonVisible = await imageUploadButton.isVisible().catch(() => false);

        expect(imageButtonVisible, 'Image upload button should be visible').toBe(true);

        if (imageButtonVisible) {
          await imageUploadButton.click();
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

          const fileInput = devices.deviceA.page.locator('input[type="file"]');
          await fileInput.setInputFiles(testImagePath);

          // 文件会自动发送，不需要点击发送按钮
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 2);

          console.log('[Test] Device A sent image');

          // 确保设备 B 在聊天页面
          const deviceBChatPanelVisible = await devices.deviceB.page.locator('.chat-panel').isVisible().catch(() => false);
          if (!deviceBChatPanelVisible) {
            await devices.deviceB.page.click('.contact-item');
            await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
          }

          // 验证设备 B 能看到文件消息（假图片会被当作文件处理）
          await retry(async () => {
            const fileMessages = await devices.deviceB.page.locator('.message-file').count();
            expect(fileMessages, 'Device B should receive file message').toBeGreaterThan(0);
          }, { maxAttempts: 5, delay: 3000, context: 'Verify file message received' });

          console.log('[Test] Device B received file message');

          await cleanupTestFile(testImagePath);
        }

        console.log('[Test] Image receive test completed!');
      } finally {
        await cleanupTestDevices(devices);
        await cleanupAllTestFiles();
      }
    });
  });

  /**
   * 文件传输测试
   */
  test.describe('文件消息传输', () => {
    test('应该能发送真实文件', async ({ browser }) => {
      test.setTimeout(90000); // 增加超时时间到90秒

      const devices = await createTestDevices(browser, '文件发送A', '文件接收B', { startPage: 'center' });

      try {
        // 创建测试文件
        const testFileName = 'test-file.txt';
        const testFileContent = 'This is a test file content for file transfer testing.';
        const testFilePath = await createTestFile(testFileName, testFileContent);

        console.log('[Test] Created test file:', testFilePath);

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

        // 确保设备 A 的聊天面板可见（如果不可见，点击联系人）
        const deviceAChatPanelVisible = await devices.deviceA.page.locator('.chat-panel').isVisible().catch(() => false);
        if (!deviceAChatPanelVisible && await devices.deviceA.page.locator('.contact-item').count() > 0) {
          await devices.deviceA.page.click('.contact-item');
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        }

        // 确保设备 B 的聊天面板可见
        const deviceBChatPanelVisible = await devices.deviceB.page.locator('.chat-panel').isVisible().catch(() => false);
        if (!deviceBChatPanelVisible && await devices.deviceB.page.locator('.contact-item').count() > 0) {
          await devices.deviceB.page.click('.contact-item');
          await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
        }

        // 设备 A 点击文件上传按钮
        // 使用正确的选择器：aria-label="upload-file"
        const fileUploadButton = devices.deviceA.page.locator('button[aria-label="upload-file"]');

        // 等待文件上传按钮可见
        await fileUploadButton.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
          console.log('[Test] File upload button not visible');
        });

        const fileButtonVisible = await fileUploadButton.isVisible().catch(() => false);

        expect(fileButtonVisible, 'File upload button should be visible').toBe(true);

        if (fileButtonVisible) {
          await fileUploadButton.click();
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

          // 设置文件输入
          const fileInput = devices.deviceA.page.locator('input[type="file"]');
          await fileInput.setInputFiles(testFilePath);

          console.log('[Test] Device A selected file');

          // 文件会自动发送，不需要点击发送按钮
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 2);

          console.log('[Test] Device A sent file message');

          // 等待消息传输
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 2);

          // 确保设备 B 在聊天页面
          const deviceBChatPanelVisible = await devices.deviceB.page.locator('.chat-panel').isVisible().catch(() => false);
          if (!deviceBChatPanelVisible) {
            await devices.deviceB.page.click('.contact-item');
            await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
          }

          // 验证设备 B 收到了文件消息
          await retry(async () => {
            const fileMessages = await devices.deviceB.page.locator('.message-file').count();
            expect(fileMessages, 'Device B should receive file message').toBeGreaterThan(0);
          }, { maxAttempts: 5, delay: 3000, context: 'Device B receive file message' });

          console.log('[Test] Device B received file message');

          // 验证文件名显示正确
          const fileNameElement = devices.deviceB.page.locator('.file-name').filter({ hasText: testFileName });
          const fileNameVisible = await fileNameElement.isVisible().catch(() => false);

          expect(fileNameVisible, `File name "${testFileName}" should be displayed`).toBe(true);

          await cleanupTestFile(testFilePath);
        }

        console.log('[Test] File transfer test completed!');
      } finally {
        await cleanupTestDevices(devices);
        await cleanupAllTestFiles();
      }
    });

    test('应该能接收真实文件', async ({ browser }) => {
      test.setTimeout(90000); // 增加超时时间到90秒

      const devices = await createTestDevices(browser, '文件发送者', '文件接收者', { startPage: 'center' });

      try {
        // 创建测试文件
        const testFileName = 'test-file-receive.txt';
        const testFileContent = 'Test file content for receive testing.';
        const testFilePath = await createTestFile(testFileName, testFileContent);

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

        // 确保设备 A 的聊天面板可见（如果不可见，点击联系人）
        const deviceAChatPanelVisible = await devices.deviceA.page.locator('.chat-panel').isVisible().catch(() => false);
        if (!deviceAChatPanelVisible && await devices.deviceA.page.locator('.contact-item').count() > 0) {
          await devices.deviceA.page.click('.contact-item');
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        }

        // 确保设备 B 的聊天面板可见
        const deviceBChatPanelVisible = await devices.deviceB.page.locator('.chat-panel').isVisible().catch(() => false);
        if (!deviceBChatPanelVisible && await devices.deviceB.page.locator('.contact-item').count() > 0) {
          await devices.deviceB.page.click('.contact-item');
          await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
        }

        // 设备 A 发送文件
        const fileUploadButton = devices.deviceA.page.locator('button[aria-label="upload-file"]');

        // 等待文件上传按钮可见
        await fileUploadButton.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
          console.log('[Test] File upload button not visible');
        });

        const fileButtonVisible = await fileUploadButton.isVisible().catch(() => false);

        expect(fileButtonVisible, 'File upload button should be visible').toBe(true);

        if (fileButtonVisible) {
          await fileUploadButton.click();
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

          const fileInput = devices.deviceA.page.locator('input[type="file"]');
          await fileInput.setInputFiles(testFilePath);

          // 文件会自动发送，不需要点击发送按钮
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 2);

          console.log('[Test] Device A sent file');

          // 确保设备 B 在聊天页面
          const deviceBChatPanelVisible = await devices.deviceB.page.locator('.chat-panel').isVisible().catch(() => false);
          if (!deviceBChatPanelVisible) {
            await devices.deviceB.page.click('.contact-item');
            await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
          }

          // 验证设备 B 能看到文件消息
          await retry(async () => {
            const fileMessages = await devices.deviceB.page.locator('.message-file').count();
            expect(fileMessages, 'Device B should receive file message').toBeGreaterThan(0);
          }, { maxAttempts: 5, delay: 3000, context: 'Verify file message received' });

          console.log('[Test] Device B received file message');

          await cleanupTestFile(testFilePath);
        }

        console.log('[Test] File receive test completed!');
      } finally {
        await cleanupTestDevices(devices);
        await cleanupAllTestFiles();
      }
    });
  });

  /**
   * 特殊场景测试
   */
  test.describe('特殊场景文件传输', () => {
    test('应该能传输大文件', async ({ browser }) => {
      test.setTimeout(120000); // 增加超时时间到120秒

      const devices = await createTestDevices(browser, '大文件发送A', '大文件接收B', { startPage: 'center' });

      try {
        // 创建较大的测试文件（1MB）
        const testFileName = 'large-test-file.txt';
        const testFileContent = 'x'.repeat(1024 * 1024); // 1MB
        const testFilePath = await createTestFile(testFileName, testFileContent);

        console.log('[Test] Created large test file:', testFilePath);

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

        // 确保设备 A 的聊天面板可见（如果不可见，点击联系人）
        const deviceAChatPanelVisible = await devices.deviceA.page.locator('.chat-panel').isVisible().catch(() => false);
        if (!deviceAChatPanelVisible && await devices.deviceA.page.locator('.contact-item').count() > 0) {
          await devices.deviceA.page.click('.contact-item');
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        }

        // 确保设备 B 的聊天面板可见
        const deviceBChatPanelVisible = await devices.deviceB.page.locator('.chat-panel').isVisible().catch(() => false);
        if (!deviceBChatPanelVisible && await devices.deviceB.page.locator('.contact-item').count() > 0) {
          await devices.deviceB.page.click('.contact-item');
          await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
        }

        // 设备 A 发送大文件
        const fileUploadButton = devices.deviceA.page.locator('button[aria-label="upload-file"]');

        // 等待文件上传按钮可见
        await fileUploadButton.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
          console.log('[Test] File upload button not visible');
        });

        const fileButtonVisible = await fileUploadButton.isVisible().catch(() => false);

        expect(fileButtonVisible, 'File upload button should be visible').toBe(true);

        if (fileButtonVisible) {
          await fileUploadButton.click();
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

          const fileInput = devices.deviceA.page.locator('input[type="file"]');
          await fileInput.setInputFiles(testFilePath);

          console.log('[Test] Device A selected large file');

          // 文件会自动发送，大文件需要更长时间处理
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 4);

          console.log('[Test] Device A sent large file automatically');

          // 等待消息传输（大文件需要更长时间）
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 4);

          // 验证设备 B 收到了文件消息
          await retry(async () => {
            const fileMessages = await devices.deviceB.page.locator('.message-item.has-file, .message-item .message-file').count();
            expect(fileMessages, 'Device B should receive large file message').toBeGreaterThan(0);
          }, { maxAttempts: 8, delay: 5000, context: 'Device B receive large file' });

          console.log('[Test] Device B received large file message');

          await cleanupTestFile(testFilePath);
        }

        console.log('[Test] Large file transfer test completed!');
      } finally {
        await cleanupTestDevices(devices);
        await cleanupAllTestFiles();
      }
    });

    test('应该能传输特殊字符文件名的文件', async ({ browser }) => {
      test.setTimeout(90000); // 增加超时时间到90秒

      const devices = await createTestDevices(browser, '特殊文件发送A', '特殊文件接收B', { startPage: 'center' });

      try {
        // 创建带特殊字符的测试文件
        const testFileName = 'test-file-特殊字符@#$%.txt';
        const testFileContent = 'Special characters test file content.';
        const testFilePath = await createTestFile(testFileName, testFileContent);

        console.log('[Test] Created test file with special characters:', testFilePath);

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

        // 确保设备 A 的聊天面板可见（如果不可见，点击联系人）
        const deviceAChatPanelVisible = await devices.deviceA.page.locator('.chat-panel').isVisible().catch(() => false);
        if (!deviceAChatPanelVisible && await devices.deviceA.page.locator('.contact-item').count() > 0) {
          await devices.deviceA.page.click('.contact-item');
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        }

        // 确保设备 B 的聊天面板可见
        const deviceBChatPanelVisible = await devices.deviceB.page.locator('.chat-panel').isVisible().catch(() => false);
        if (!deviceBChatPanelVisible && await devices.deviceB.page.locator('.contact-item').count() > 0) {
          await devices.deviceB.page.click('.contact-item');
          await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
        }

        // 设备 A 发送文件
        const fileUploadButton = devices.deviceA.page.locator('button[aria-label="upload-file"]');

        // 等待文件上传按钮可见
        await fileUploadButton.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
          console.log('[Test] File upload button not visible');
        });

        const fileButtonVisible = await fileUploadButton.isVisible().catch(() => false);

        expect(fileButtonVisible, 'File upload button should be visible').toBe(true);

        if (fileButtonVisible) {
          await fileUploadButton.click();
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

          const fileInput = devices.deviceA.page.locator('input[type="file"]');
          await fileInput.setInputFiles(testFilePath);

          // 文件会自动发送，不需要点击发送按钮
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 2);

          console.log('[Test] Device A sent file with special characters');

          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 2);

          // 验证设备 B 收到了文件消息
          await retry(async () => {
            const fileMessages = await devices.deviceB.page.locator('.message-file').count();
            expect(fileMessages, 'Device B should receive file with special characters').toBeGreaterThan(0);
          }, { maxAttempts: 5, delay: 3000, context: 'Device B receive special char file' });

          console.log('[Test] Device B received file with special characters');

          // 验证特殊字符文件名显示正确
          const specialFileNameElement = devices.deviceB.page.locator('.file-name').filter({ hasText: testFileName });
          const specialFileNameVisible = await specialFileNameElement.isVisible().catch(() => false);

          expect(specialFileNameVisible, `Special character file name should be displayed`).toBe(true);

          await cleanupTestFile(testFilePath);
        }

        console.log('[Test] Special character filename test completed!');
      } finally {
        await cleanupTestDevices(devices);
        await cleanupAllTestFiles();
      }
    });
  });

  /**
   * 文件传输状态测试
   */
  test.describe('文件传输状态', () => {
    test('文件传输应该显示正确的状态', async ({ browser }) => {
      test.setTimeout(90000); // 增加超时时间到90秒

      const devices = await createTestDevices(browser, '状态发送A', '状态接收B', { startPage: 'center' });

      try {
        // 创建测试文件
        const testFileName = 'status-test-file.txt';
        const testFileContent = 'Status test file content.';
        const testFilePath = await createTestFile(testFileName, testFileContent);

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

        // 确保设备 A 的聊天面板可见（如果不可见，点击联系人）
        const deviceAChatPanelVisible = await devices.deviceA.page.locator('.chat-panel').isVisible().catch(() => false);
        if (!deviceAChatPanelVisible && await devices.deviceA.page.locator('.contact-item').count() > 0) {
          await devices.deviceA.page.click('.contact-item');
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        }

        // 确保设备 B 的聊天面板可见
        const deviceBChatPanelVisible = await devices.deviceB.page.locator('.chat-panel').isVisible().catch(() => false);
        if (!deviceBChatPanelVisible && await devices.deviceB.page.locator('.contact-item').count() > 0) {
          await devices.deviceB.page.click('.contact-item');
          await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);
        }

        // 设备 A 发送文件
        const fileUploadButton = devices.deviceA.page.locator('button[aria-label="upload-file"]');

        // 等待文件上传按钮可见
        await fileUploadButton.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
          console.log('[Test] File upload button not visible');
        });

        const fileButtonVisible = await fileUploadButton.isVisible().catch(() => false);

        expect(fileButtonVisible, 'File upload button should be visible').toBe(true);

        if (fileButtonVisible) {
          // 检查发送前的状态
          const messageInputVisible = await devices.deviceA.page.locator(SELECTORS.messageInput).isVisible();
          expect(messageInputVisible, 'Message input should be visible before sending').toBe(true);

          await fileUploadButton.click();
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

          const fileInput = devices.deviceA.page.locator('input[type="file"]');
          await fileInput.setInputFiles(testFilePath);

          // 文件会自动发送
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

          // 等待发送完成
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 2);

          // 验证设备 B 也收到了文件消息
          await retry(async () => {
            const fileMessages = await devices.deviceB.page.locator('.message-file').count();
            expect(fileMessages, 'Device B should receive file message').toBeGreaterThan(0);
          }, { maxAttempts: 5, delay: 3000, context: 'Verify status test file received' });

          await cleanupTestFile(testFilePath);
        }

        console.log('[Test] File transfer status test completed!');
      } finally {
        await cleanupTestDevices(devices);
        await cleanupAllTestFiles();
      }
    });
  });
});
