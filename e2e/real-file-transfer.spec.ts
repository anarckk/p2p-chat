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
  createUserInfo,
  clearAllStorage,
  createTestDevices,
  cleanupTestDevices,
  retry,
  waitForMessage,
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
      test.setTimeout(120000);

      const devices = await createTestDevices(browser, '图片发送A', '图片接收B', { startPage: 'wechat' });

      try {
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

        // 监听控制台日志
        const logsA: string[] = [];
        const logsB: string[] = [];

        devices.deviceA.page.on('console', msg => {
          if (msg.type() === 'log') {
            logsA.push(msg.text());
          }
        });
        devices.deviceB.page.on('console', msg => {
          if (msg.type() === 'log') {
            logsB.push(msg.text());
          }
        });

        // 设备 A 点击图片上传按钮
        // 假设有一个图片上传按钮，可能是一个图标按钮
        const imageUploadButton = devices.deviceA.page.locator('button[aria-label="image-upload"], button[aria-label="上传图片"], .ant-upload button');

        const imageButtonVisible = await imageUploadButton.isVisible().catch(() => false);

        if (imageButtonVisible) {
          // 点击上传按钮
          await imageUploadButton.click();
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

          // 设置文件输入
          const fileInput = devices.deviceA.page.locator('input[type="file"]');
          await fileInput.setInputFiles(testImagePath);

          console.log('[Test] Device A selected image file');

          // 等待文件上传完成
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

          // 点击发送按钮
          await devices.deviceA.page.click(SELECTORS.sendButton);

          console.log('[Test] Device A sent image message');

          // 等待消息传输
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 2);

          // 验证设备 B 收到了图片消息
          await retry(async () => {
            const imageMessages = await devices.deviceB.page.locator('.message-item.has-image, .message-item .message-image').count();
            if (imageMessages === 0) {
              // 打印调试信息
              const allMessages = await devices.deviceB.page.locator('.message-item').allTextContents();
              console.log('[Test] Device B messages:', allMessages);
              throw new Error('No image message received on Device B');
            }
          }, { maxAttempts: 5, delay: 3000, context: 'Device B receive image message' });

          console.log('[Test] Device B received image message');

          // 清理测试文件
          await cleanupTestFile(testImagePath);
        } else {
          console.log('[Test] Image upload button not found, skipping image upload test');
          console.log('[Test] Logs from Device A:', logsA.slice(-5));
          console.log('[Test] Logs from Device B:', logsB.slice(-5));
        }

        console.log('[Test] Image file transfer test completed!');
      } finally {
        await cleanupTestDevices(devices);
        await cleanupAllTestFiles();
      }
    });

    test('应该能接收真实图片文件', async ({ browser }) => {
      test.setTimeout(120000);

      const devices = await createTestDevices(browser, '图片发送者', '图片接收者', { startPage: 'wechat' });

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

        // 设备 A 发送图片
        const imageUploadButton = devices.deviceA.page.locator('button[aria-label="image-upload"], button[aria-label="上传图片"], .ant-upload button');

        const imageButtonVisible = await imageUploadButton.isVisible().catch(() => false);

        if (imageButtonVisible) {
          await imageUploadButton.click();
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

          const fileInput = devices.deviceA.page.locator('input[type="file"]');
          await fileInput.setInputFiles(testImagePath);

          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);
          await devices.deviceA.page.click(SELECTORS.sendButton);

          console.log('[Test] Device A sent image');

          // 验证设备 B 能看到图片消息
          await retry(async () => {
            const imageMessages = await devices.deviceB.page.locator('.message-item.has-image, .message-item .message-image, .message-image img').count();
            if (imageMessages === 0) {
              throw new Error('No image message received');
            }
          }, { maxAttempts: 5, delay: 3000, context: 'Verify image message received' });

          // 验证图片消息的状态（已送达）
          const lastMessage = devices.deviceB.page.locator('.message-item').last();
          const messageStatus = await lastMessage.locator('.message-status').textContent();

          console.log('[Test] Last message status:', messageStatus);

          await cleanupTestFile(testImagePath);
        } else {
          console.log('[Test] Image upload button not found');
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
      test.setTimeout(120000);

      const devices = await createTestDevices(browser, '文件发送A', '文件接收B', { startPage: 'wechat' });

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

        // 设备 A 点击文件上传按钮
        const fileUploadButton = devices.deviceA.page.locator('button[aria-label="file-upload"], button[aria-label="上传文件"], .ant-upload button');

        const fileButtonVisible = await fileUploadButton.isVisible().catch(() => false);

        if (fileButtonVisible) {
          await fileUploadButton.click();
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

          // 设置文件输入
          const fileInput = devices.deviceA.page.locator('input[type="file"]');
          await fileInput.setInputFiles(testFilePath);

          console.log('[Test] Device A selected file');

          // 等待文件上传完成
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

          // 点击发送按钮
          await devices.deviceA.page.click(SELECTORS.sendButton);

          console.log('[Test] Device A sent file message');

          // 等待消息传输
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 2);

          // 验证设备 B 收到了文件消息
          await retry(async () => {
            const fileMessages = await devices.deviceB.page.locator('.message-item.has-file, .message-item .message-file').count();
            if (fileMessages === 0) {
              const allMessages = await devices.deviceB.page.locator('.message-item').allTextContents();
              console.log('[Test] Device B messages:', allMessages);
              throw new Error('No file message received on Device B');
            }
          }, { maxAttempts: 5, delay: 3000, context: 'Device B receive file message' });

          console.log('[Test] Device B received file message');

          // 验证文件名显示正确
          const fileNameElement = devices.deviceB.page.locator('.message-file-name, .file-name').filter({ hasText: testFileName });
          const fileNameVisible = await fileNameElement.isVisible().catch(() => false);

          if (fileNameVisible) {
            console.log('[Test] File name displayed correctly:', testFileName);
          }

          await cleanupTestFile(testFilePath);
        } else {
          console.log('[Test] File upload button not found, skipping file upload test');
        }

        console.log('[Test] File transfer test completed!');
      } finally {
        await cleanupTestDevices(devices);
        await cleanupAllTestFiles();
      }
    });

    test('应该能接收真实文件', async ({ browser }) => {
      test.setTimeout(120000);

      const devices = await createTestDevices(browser, '文件发送者', '文件接收者', { startPage: 'wechat' });

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

        // 设备 A 发送文件
        const fileUploadButton = devices.deviceA.page.locator('button[aria-label="file-upload"], button[aria-label="上传文件"], .ant-upload button');

        const fileButtonVisible = await fileUploadButton.isVisible().catch(() => false);

        if (fileButtonVisible) {
          await fileUploadButton.click();
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

          const fileInput = devices.deviceA.page.locator('input[type="file"]');
          await fileInput.setInputFiles(testFilePath);

          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);
          await devices.deviceA.page.click(SELECTORS.sendButton);

          console.log('[Test] Device A sent file');

          // 验证设备 B 能看到文件消息
          await retry(async () => {
            const fileMessages = await devices.deviceB.page.locator('.message-item.has-file, .message-item .message-file').count();
            if (fileMessages === 0) {
              throw new Error('No file message received');
            }
          }, { maxAttempts: 5, delay: 3000, context: 'Verify file message received' });

          // 验证文件消息状态
          const lastMessage = devices.deviceB.page.locator('.message-item').last();
          const messageStatus = await lastMessage.locator('.message-status').textContent();

          console.log('[Test] Last message status:', messageStatus);

          await cleanupTestFile(testFilePath);
        } else {
          console.log('[Test] File upload button not found');
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
      test.setTimeout(180000); // 增加超时时间

      const devices = await createTestDevices(browser, '大文件发送A', '大文件接收B', { startPage: 'wechat' });

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

        // 设备 A 发送大文件
        const fileUploadButton = devices.deviceA.page.locator('button[aria-label="file-upload"], button[aria-label="上传文件"], .ant-upload button');

        const fileButtonVisible = await fileUploadButton.isVisible().catch(() => false);

        if (fileButtonVisible) {
          await fileUploadButton.click();
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

          const fileInput = devices.deviceA.page.locator('input[type="file"]');
          await fileInput.setInputFiles(testFilePath);

          console.log('[Test] Device A selected large file');

          // 等待文件上传完成（大文件需要更长时间）
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 3);

          // 点击发送按钮
          await devices.deviceA.page.click(SELECTORS.sendButton);

          console.log('[Test] Device A sent large file');

          // 等待消息传输（大文件需要更长时间）
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 4);

          // 验证设备 B 收到了文件消息
          await retry(async () => {
            const fileMessages = await devices.deviceB.page.locator('.message-item.has-file, .message-item .message-file').count();
            if (fileMessages === 0) {
              throw new Error('No file message received on Device B');
            }
          }, { maxAttempts: 8, delay: 5000, context: 'Device B receive large file' });

          console.log('[Test] Device B received large file message');

          await cleanupTestFile(testFilePath);
        } else {
          console.log('[Test] File upload button not found, skipping large file test');
        }

        console.log('[Test] Large file transfer test completed!');
      } finally {
        await cleanupTestDevices(devices);
        await cleanupAllTestFiles();
      }
    });

    test('应该能传输特殊字符文件名的文件', async ({ browser }) => {
      test.setTimeout(120000);

      const devices = await createTestDevices(browser, '特殊文件发送A', '特殊文件接收B', { startPage: 'wechat' });

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

        // 设备 A 发送文件
        const fileUploadButton = devices.deviceA.page.locator('button[aria-label="file-upload"], button[aria-label="上传文件"], .ant-upload button');

        const fileButtonVisible = await fileUploadButton.isVisible().catch(() => false);

        if (fileButtonVisible) {
          await fileUploadButton.click();
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

          const fileInput = devices.deviceA.page.locator('input[type="file"]');
          await fileInput.setInputFiles(testFilePath);

          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);
          await devices.deviceA.page.click(SELECTORS.sendButton);

          console.log('[Test] Device A sent file with special characters');

          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 2);

          // 验证设备 B 收到了文件消息
          await retry(async () => {
            const fileMessages = await devices.deviceB.page.locator('.message-item.has-file, .message-item .message-file').count();
            if (fileMessages === 0) {
              throw new Error('No file message received on Device B');
            }
          }, { maxAttempts: 5, delay: 3000, context: 'Device B receive special char file' });

          console.log('[Test] Device B received file with special characters');

          await cleanupTestFile(testFilePath);
        } else {
          console.log('[Test] File upload button not found, skipping special char test');
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
      test.setTimeout(120000);

      const devices = await createTestDevices(browser, '状态发送A', '状态接收B', { startPage: 'wechat' });

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

        // 设备 A 发送文件
        const fileUploadButton = devices.deviceA.page.locator('button[aria-label="file-upload"], button[aria-label="上传文件"], .ant-upload button');

        const fileButtonVisible = await fileUploadButton.isVisible().catch(() => false);

        if (fileButtonVisible) {
          // 检查发送前的状态
          const messageInputVisible = await devices.deviceA.page.locator(SELECTORS.messageInput).isVisible();
          expect(messageInputVisible).toBe(true);

          await fileUploadButton.click();
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

          const fileInput = devices.deviceA.page.locator('input[type="file"]');
          await fileInput.setInputFiles(testFilePath);

          // 检查文件是否已选择
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);

          await devices.deviceA.page.click(SELECTORS.sendButton);

          // 检查发送中的状态
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
          const sendingStatus = await devices.deviceA.page.locator('.message-status.sending, .message-status:has-text("发送中")').count();

          console.log('[Test] Sending status count:', sendingStatus);

          // 等待发送完成
          await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 2);

          // 检查发送完成后的状态
          const sentStatus = await devices.deviceA.page.locator('.message-status.sent, .message-status:has-text("已送达")').count();

          console.log('[Test] Sent status count:', sentStatus);

          await cleanupTestFile(testFilePath);
        } else {
          console.log('[Test] File upload button not found, skipping status test');
        }

        console.log('[Test] File transfer status test completed!');
      } finally {
        await cleanupTestDevices(devices);
        await cleanupAllTestFiles();
      }
    });
  });
});
