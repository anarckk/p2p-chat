/**
 * 网络加速功能 E2E 测试
 * 测试场景：
 * 1. 设备A通过网络加速（设备B）向设备C发送消息
 * 2. 验证中转功能是否正常工作
 * 3. 测试关闭网络加速后的行为
 * 4. 验证网络加速状态持久化
 */

import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import {
  SELECTORS,
  WAIT_TIMES,
  createUserInfo,
  clearAllStorage,
  retry,
  waitForMessage,
} from './test-helpers.js';

interface DeviceInfo {
  context: BrowserContext;
  page: Page;
  userInfo: ReturnType<typeof createUserInfo>;
}

interface ThreeDevices {
  deviceA: DeviceInfo;
  deviceB: DeviceInfo;
  deviceC: DeviceInfo;
}

/**
 * 创建三个测试设备
 */
async function createThreeTestDevices(
  browser: Browser,
  deviceAName: string,
  deviceBName: string,
  deviceCName: string,
  options?: { startPage?: 'center' | 'wechat' }
): Promise<ThreeDevices> {
  const startPage = options?.startPage || 'center';
  const pageSelector = startPage === 'center' ? SELECTORS.centerContainer : '.wechat-container';
  const url = startPage === 'center' ? '/center' : '/wechat';

  // 创建设备 A
  const deviceAUserInfo = createUserInfo(deviceAName);
  const deviceAContext = await browser.newContext();
  const deviceAPage = await deviceAContext.newPage();
  await deviceAPage.goto(url);
  await deviceAPage.waitForLoadState('domcontentloaded');
  await deviceAPage.evaluate((info) => {
    localStorage.setItem('p2p_user_info', JSON.stringify(info));
  }, deviceAUserInfo);
  await deviceAPage.reload();
  await deviceAPage.waitForSelector(pageSelector, { timeout: 8000 });
  await deviceAPage.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);

  // 创建设备 B
  const deviceBUserInfo = createUserInfo(deviceBName);
  const deviceBContext = await browser.newContext();
  const deviceBPage = await deviceBContext.newPage();
  await deviceBPage.goto(url);
  await deviceBPage.waitForLoadState('domcontentloaded');
  await deviceBPage.evaluate((info) => {
    localStorage.setItem('p2p_user_info', JSON.stringify(info));
  }, deviceBUserInfo);
  await deviceBPage.reload();
  await deviceBPage.waitForSelector(pageSelector, { timeout: 8000 });
  await deviceBPage.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);

  // 创建设备 C
  const deviceCUserInfo = createUserInfo(deviceCName);
  const deviceCContext = await browser.newContext();
  const deviceCPage = await deviceCContext.newPage();
  await deviceCPage.goto(url);
  await deviceCPage.waitForLoadState('domcontentloaded');
  await deviceCPage.evaluate((info) => {
    localStorage.setItem('p2p_user_info', JSON.stringify(info));
  }, deviceCUserInfo);
  await deviceCPage.reload();
  await deviceCPage.waitForSelector(pageSelector, { timeout: 8000 });
  await deviceCPage.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);

  return {
    deviceA: {
      context: deviceAContext,
      page: deviceAPage,
      userInfo: deviceAUserInfo,
    },
    deviceB: {
      context: deviceBContext,
      page: deviceBPage,
      userInfo: deviceBUserInfo,
    },
    deviceC: {
      context: deviceCContext,
      page: deviceCPage,
      userInfo: deviceCUserInfo,
    },
  };
}

/**
 * 清理三个测试设备
 */
async function cleanupThreeTestDevices(devices: ThreeDevices): Promise<void> {
  await devices.deviceA.context.close();
  await devices.deviceB.context.close();
  await devices.deviceC.context.close();
}

test.describe('网络加速功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/center');
    await clearAllStorage(page);

    // 处理首次进入的用户名输入弹窗
    await page.waitForTimeout(WAIT_TIMES.MODAL);
    const modalExists = await page.locator('.ant-modal').count();
    if (modalExists > 0) {
      await page.fill('.ant-modal input[type="text"]', '测试用户');
      await page.click('.ant-modal .ant-btn-primary');
      await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    }
  });

  /**
   * 网络加速基础测试
   */
  test.describe('网络加速设置', () => {
    test('应该能开启网络加速', async ({ page }) => {
      // 导航到设置页面
      await page.click('.ant-menu-item:has-text("设置")');
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 找到网络加速开关
      const networkSwitch = page.locator('button[aria-label="network-acceleration-switch"]');

      // 检查当前状态
      const ariaCheckedBefore = await networkSwitch.getAttribute('aria-checked');
      const isCheckedBefore = ariaCheckedBefore === 'true';

      if (!isCheckedBefore) {
        // 点击开启网络加速
        await networkSwitch.click();
        await page.waitForTimeout(WAIT_TIMES.SHORT);

        // 点击保存按钮
        await page.click('button[aria-label="save-settings-button"]');
        // 等待保存成功提示（内联提示）
        await page.waitForSelector('.inline-message', { timeout: 3000 });
        await page.waitForTimeout(WAIT_TIMES.SHORT);
      }

      // 验证开关已开启
      const ariaCheckedAfter = await networkSwitch.getAttribute('aria-checked');
      expect(ariaCheckedAfter).toBe('true');
    });

    test('应该能关闭网络加速', async ({ page }) => {
      // 导航到设置页面
      await page.click('.ant-menu-item:has-text("设置")');
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 找到网络加速开关
      const networkSwitch = page.locator('button[aria-label="network-acceleration-switch"]');

      // 确保开关是开启状态
      const ariaChecked = await networkSwitch.getAttribute('aria-checked');
      const isChecked = ariaChecked === 'true';

      if (!isChecked) {
        // 先开启
        await networkSwitch.click();
        await page.waitForTimeout(WAIT_TIMES.SHORT);
        await page.click('button[aria-label="save-settings-button"]');
        await page.waitForSelector('.inline-message', { timeout: 3000 });
        await page.waitForTimeout(WAIT_TIMES.SHORT);
      }

      // 点击关闭网络加速
      await networkSwitch.click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);
      await page.click('button[aria-label="save-settings-button"]');
      await page.waitForSelector('.inline-message', { timeout: 3000 });
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证开关已关闭
      const ariaCheckedAfter = await networkSwitch.getAttribute('aria-checked');
      expect(ariaCheckedAfter).toBe('false');
    });

    test('网络加速状态应该持久化', async ({ page }) => {
      // 导航到设置页面
      await page.click('.ant-menu-item:has-text("设置")');
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 找到网络加速开关
      const networkSwitch = page.locator('button[aria-label="network-acceleration-switch"]');

      // 先关闭网络加速（如果开启的话）
      const ariaChecked = await networkSwitch.getAttribute('aria-checked');
      const isChecked = ariaChecked === 'true';
      if (isChecked) {
        await networkSwitch.click();
        await page.waitForTimeout(WAIT_TIMES.SHORT);
        await page.click('button[aria-label="save-settings-button"]');
        await page.waitForSelector('.inline-message', { timeout: 3000 });
      }

      // 开启网络加速
      await networkSwitch.click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);
      await page.click('button[aria-label="save-settings-button"]');
      await page.waitForSelector('.inline-message', { timeout: 3000 });

      // 刷新页面
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 验证开关状态仍然开启
      const ariaCheckedAfter = await networkSwitch.getAttribute('aria-checked');
      expect(ariaCheckedAfter).toBe('true');
    });
  });

  /**
   * 网络加速多设备测试
   */
  test.describe('网络加速消息中转', () => {
    test('设备A通过设备B中转发送消息给设备C', async ({ browser }) => {
      test.setTimeout(180000); // 增加超时时间

      const devices = await createThreeTestDevices(
        browser,
        '发送者A',
        '中转站B',
        '接收者C',
        { startPage: 'wechat' }
      );

      try {
        // 设备 B 开启网络加速
        await devices.deviceB.page.click('.ant-menu-item:has-text("设置")');
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        const networkSwitch = devices.deviceB.page.locator('button[aria-label="network-acceleration-switch"]');
        const isOffBefore = await networkSwitch.evaluate((el: HTMLElement) =>
          el.classList.contains('ant-switch-unchecked')
        );

        if (isOffBefore) {
          await networkSwitch.click();
          await devices.deviceB.page.waitForSelector('.inline-message', { timeout: 3000 });
        }

        await devices.deviceB.page.click('.ant-menu-item:has-text("聊天")');
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 设备 A 添加设备 C 的聊天
        await devices.deviceA.page.click(SELECTORS.plusButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceC.userInfo.peerId);
        await devices.deviceA.page.click(SELECTORS.modalOkButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        // 设备 C 添加设备 A 的聊天
        await devices.deviceC.page.click(SELECTORS.plusButton);
        await devices.deviceC.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceC.page.fill(SELECTORS.peerIdInput, devices.deviceA.userInfo.peerId);
        await devices.deviceC.page.click(SELECTORS.modalOkButton);
        await devices.deviceC.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        // 等待聊天创建完成
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceC.page.waitForTimeout(WAIT_TIMES.SHORT);

        // 设备 A 发送消息给设备 C
        const testMessage = '测试网络加速中转消息';
        await devices.deviceA.page.fill(SELECTORS.messageInput, testMessage);
        await devices.deviceA.page.click(SELECTORS.sendButton);

        console.log('[Test] Device A sent message to Device C');

        // 等待消息传输
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 2);

        // 验证设备 C 收到消息
        await retry(async () => {
          await waitForMessage(devices.deviceC.page, testMessage, 5000);
        }, { maxAttempts: 5, delay: 3000, context: 'Device C receive message via relay' });

        console.log('[Test] Device C received message from Device A');

        // 验证消息确实被接收
        const messageReceived = await devices.deviceC.page.evaluate((msg: string) => {
          const messageElements = document.querySelectorAll('.message-text');
          return Array.from(messageElements).some((el) => el.textContent?.includes(msg));
        }, testMessage);

        expect(messageReceived).toBe(true);

        console.log('[Test] Network acceleration relay test passed!');
      } finally {
        await cleanupThreeTestDevices(devices);
      }
    });

    test('关闭网络加速后不应该中转消息', async ({ browser }) => {
      test.setTimeout(180000);

      const devices = await createThreeTestDevices(
        browser,
        '直连发送A',
        '直连中转B',
        '直连接收C',
        { startPage: 'wechat' }
      );

      try {
        // 设备 B 确保关闭网络加速
        await devices.deviceB.page.click('.ant-menu-item:has-text("设置")');
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        const networkSwitch = devices.deviceB.page.locator('button[aria-label="network-acceleration-switch"]');
        const isChecked = await networkSwitch.evaluate((el: HTMLElement) =>
          el.classList.contains('ant-switch-checked')
        );

        if (isChecked) {
          await networkSwitch.click();
          await devices.deviceB.page.waitForSelector('.inline-message', { timeout: 3000 });
        }

        await devices.deviceB.page.click('.ant-menu-item:has-text("聊天")');
        await devices.deviceB.page.waitForTimeout(WAIT_TIMES.SHORT);

        console.log('[Test] Device B network acceleration is OFF');

        // 设备 A 和设备 C 直接建立聊天
        await devices.deviceA.page.click(SELECTORS.plusButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceA.page.fill(SELECTORS.peerIdInput, devices.deviceC.userInfo.peerId);
        await devices.deviceA.page.click(SELECTORS.modalOkButton);
        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        await devices.deviceC.page.click(SELECTORS.plusButton);
        await devices.deviceC.page.waitForTimeout(WAIT_TIMES.SHORT);
        await devices.deviceC.page.fill(SELECTORS.peerIdInput, devices.deviceA.userInfo.peerId);
        await devices.deviceC.page.click(SELECTORS.modalOkButton);
        await devices.deviceC.page.waitForTimeout(WAIT_TIMES.MESSAGE);

        // 设备 A 发送消息给设备 C（直连，不通过 B 中转）
        const testMessage = '直连消息测试';
        await devices.deviceA.page.fill(SELECTORS.messageInput, testMessage);
        await devices.deviceA.page.click(SELECTORS.sendButton);

        console.log('[Test] Device A sent direct message to Device C');

        await devices.deviceA.page.waitForTimeout(WAIT_TIMES.MESSAGE * 2);

        // 验证设备 C 收到消息
        await retry(async () => {
          await waitForMessage(devices.deviceC.page, testMessage, 5000);
        }, { maxAttempts: 5, delay: 3000, context: 'Device C receive direct message' });

        console.log('[Test] Device C received direct message from Device A');

        // 设备 C 确实收到了消息
        const messageReceived = await devices.deviceC.page.evaluate((msg: string) => {
          const messageElements = document.querySelectorAll('.message-text');
          return Array.from(messageElements).some((el) => el.textContent?.includes(msg));
        }, testMessage);

        expect(messageReceived).toBe(true);

        console.log('[Test] Direct connection test passed (no relay)!');
      } finally {
        await cleanupThreeTestDevices(devices);
      }
    });
  });

  /**
   * 网络加速状态持久化测试
   */
  test.describe('网络加速持久化', () => {
    test('刷新页面后网络加速状态应该保持', async ({ page }) => {
      // 导航到设置页面
      await page.click('.ant-menu-item:has-text("设置")');
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 开启网络加速
      const networkSwitch = page.locator('button[aria-label="network-acceleration-switch"]');
      await networkSwitch.click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);
      await page.click('button[aria-label="save-settings-button"]');
      await page.waitForSelector('.inline-message', { timeout: 3000 });

      // 刷新页面
      await page.reload();
      await page.waitForTimeout(WAIT_TIMES.RELOAD);

      // 验证状态保持
      const ariaChecked = await networkSwitch.getAttribute('aria-checked');
      expect(ariaChecked).toBe('true');
    });

    test('跨页面网络加速状态应该同步', async ({ page }) => {
      // 在设置页面开启网络加速
      await page.click('.ant-menu-item:has-text("设置")');
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      const networkSwitch = page.locator('button[aria-label="network-acceleration-switch"]');
      await networkSwitch.click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);
      await page.click('button[aria-label="save-settings-button"]');
      await page.waitForSelector('.inline-message', { timeout: 3000 });

      // 切换到发现中心
      await page.click('.ant-menu-item:has-text("发现中心")');
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 切换回设置页面
      await page.click('.ant-menu-item:has-text("设置")');
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证状态仍然开启
      const ariaChecked = await networkSwitch.getAttribute('aria-checked');
      expect(ariaChecked).toBe('true');
    });
  });

  /**
   * 网络加速提示信息测试
   */
  test.describe('网络加速提示信息', () => {
    test('开启网络加速应该显示相应提示', async ({ page }) => {
      await page.click('.ant-menu-item:has-text("设置")');
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      const networkSwitch = page.locator('button[aria-label="network-acceleration-switch"]');

      // 确保开关是关闭状态
      const ariaChecked = await networkSwitch.getAttribute('aria-checked');
      const isChecked = ariaChecked === 'true';

      if (isChecked) {
        await networkSwitch.click();
        await page.waitForTimeout(WAIT_TIMES.SHORT);
        await page.click('button[aria-label="save-settings-button"]');
        await page.waitForSelector('.inline-message', { timeout: 3000 });
      }

      // 开启网络加速
      await networkSwitch.click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);
      await page.click('button[aria-label="save-settings-button"]');
      await page.waitForSelector('.inline-message', { timeout: 3000 });

      // 检查是否有相应的提示信息
      const helpText = await page.locator('.settings-container').textContent();
      expect(helpText).toContain('网络加速');
    });

    test('关闭网络加速应该显示相应提示', async ({ page }) => {
      await page.click('.ant-menu-item:has-text("设置")');
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      const networkSwitch = page.locator('button[aria-label="network-acceleration-switch"]');

      // 确保开关是开启状态
      const ariaChecked = await networkSwitch.getAttribute('aria-checked');
      const isChecked = ariaChecked === 'true';

      if (!isChecked) {
        await networkSwitch.click();
        await page.waitForTimeout(WAIT_TIMES.SHORT);
        await page.click('button[aria-label="save-settings-button"]');
        await page.waitForSelector('.inline-message', { timeout: 3000 });
      }

      // 关闭网络加速
      await networkSwitch.click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);
      await page.click('button[aria-label="save-settings-button"]');
      await page.waitForSelector('.inline-message', { timeout: 3000 });

      // 检查是否有相应的提示信息
      const helpText = await page.locator('.settings-container').textContent();
      expect(helpText).toContain('网络加速');
    });
  });
});
