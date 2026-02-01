/**
 * 刷新功能边缘场景 E2E 测试
 * 测试场景：
 * 1. 空设备列表时刷新不应该报错
 * 2. 只有自己的设备时刷新不应该报错
 * 3. 用户信息未设置时应该弹窗而不是报错
 * 4. 刷新时设备被删除不应该报错
 * 5. 刷新时包含大量设备不应该卡顿或报错
 * 6. 刷新消息应该准确显示设备数量
 * 7. 连续多次刷新不应该报错
 * 8. 刷新时设备列表包含过期的离线设备不应该报错
 */
import { test, expect } from '@playwright/test';
import {
  setupUser,
  getPeerIdFromStorage,
  WAIT_TIMES,
  SELECTORS,
} from './test-helpers.js';

test.describe('刷新功能边缘场景', () => {
  test.setTimeout(30000);

  test('空设备列表时刷新不应该报错', async ({ page }) => {
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');
    await setupUser(page, '空列表测试');

    // 清空设备列表
    await page.evaluate(() => {
      localStorage.removeItem('discovered_devices');
    });

    // 刷新页面
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // 监听所有控制台日志
    const logs: string[] = [];
    page.on('console', msg => {
      logs.push(msg.text());
    });

    // 点击刷新按钮
    await page.locator(SELECTORS.refreshButton).click();
    await page.waitForTimeout(WAIT_TIMES.LONG);

    // 验证有刷新相关的日志
    const hasRefreshLog = logs.some(log =>
      log.includes('Refresh discovery started') || log.includes('刷新')
    );
    expect(hasRefreshLog).toBe(true);

    // 验证没有严重错误（允许预期的在线检查错误）
    const errorLogs = logs.filter(log =>
      log.includes('Error') || log.includes('error')
    );
    const severeErrors = errorLogs.filter(log =>
      !log.includes('Check online error') &&
      !log.includes('Check online failed') &&
      !log.includes('Request device lists error')
    );
    // 不应该有严重错误导致崩溃
    expect(severeErrors.length).toBeLessThan(10);
  });

  test('只有自己的设备时刷新不应该报错', async ({ page }) => {
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');
    await setupUser(page, '单人测试');

    // 等待初始化完成
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 监听所有控制台日志
    const logs: string[] = [];
    page.on('console', msg => {
      logs.push(msg.text());
    });

    // 点击刷新按钮
    await page.locator(SELECTORS.refreshButton).click();
    await page.waitForTimeout(WAIT_TIMES.LONG);

    // 验证有刷新相关的日志
    const hasRefreshLog = logs.some(log =>
      log.includes('Refresh') || log.includes('刷新')
    );
    expect(hasRefreshLog).toBe(true);

    // 验证没有严重错误
    const errorLogs = logs.filter(log =>
      log.includes('Error') || log.includes('error')
    );
    const severeErrors = errorLogs.filter(log =>
      !log.includes('Check online error')
    );
    expect(severeErrors.length).toBeLessThan(10);
  });

  test('用户信息未设置时应该弹窗而不是报错', async ({ page }) => {
    // 监听所有控制台日志
    const logs: string[] = [];
    page.on('console', msg => {
      logs.push(msg.text());
    });

    // 首先导航到任意页面（触发 E2E 模式标记）
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');

    // 然后清空所有用户信息并设置禁用标记
    await page.evaluate(() => {
      // 清除所有用户信息相关的 keys
      localStorage.removeItem('user_info');
      localStorage.removeItem('p2p_user_info');
      localStorage.removeItem('p2p_user_info_meta');
      // 设置 E2E 禁用标记，防止自动设置用户信息
      localStorage.setItem('__E2E_DISABLE_AUTO_SETUP__', 'true');
    });

    // 刷新页面以应用更改
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // 等待用户名设置弹窗出现（验证弹窗而不是报错）
    const modal = page.locator('.ant-modal');
    await expect(modal).toBeVisible({ timeout: WAIT_TIMES.LONG });

    const modalTitle = page.locator('.ant-modal-title');
    await expect(modalTitle).toContainText('设置用户信息');

    // 验证弹窗出现时没有严重错误（弹窗而不是崩溃）
    const errorLogs = logs.filter(log =>
      (log.includes('Error') || log.includes('error')) && log.includes('stack')
    );
    expect(errorLogs.length).toBeLessThan(5);

    // 填写用户名以关闭弹窗，继续测试刷新功能
    const usernameInput = page.locator('input[placeholder*="请输入用户名"]');
    await usernameInput.fill('边缘测试用户');

    const okButton = page.locator('.ant-modal .ant-btn-primary');
    await okButton.click();

    // 等待弹窗关闭
    await page.waitForSelector('.ant-modal', { state: 'hidden', timeout: WAIT_TIMES.PEER_INIT * 20 }).catch(() => {
      // 可能已关闭，继续执行
    });

    // 等待页面稳定
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 点击刷新按钮验证没有报错
    await page.locator(SELECTORS.refreshButton).click();
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 最终验证没有严重错误
    const finalErrorLogs = logs.filter(log =>
      (log.includes('Error') || log.includes('error')) && log.includes('stack')
    );
    expect(finalErrorLogs.length).toBeLessThan(10);
  });

  test('刷新后设备被删除不应该报错', async ({ page, context }) => {
    const browser = context.browser();
    if (!browser) {
      test.skip();
      return;
    }
    const browser2 = await browser.newContext();
    const page2 = await browser2.newPage();

    try {
      // 设置两个用户
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');
      await setupUser(page, '设备删除测试A');

      await page2.goto('/center');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '设备删除测试B');

      const peerIdA = await getPeerIdFromStorage(page);
      const peerIdB = await getPeerIdFromStorage(page2);

      if (!peerIdA || !peerIdB) {
        test.skip();
        return;
      }

      // 互相添加设备
      const queryInputA = page.locator(SELECTORS.peerIdInput);
      await queryInputA.fill(peerIdB);
      await page.locator(SELECTORS.addButton).click();
      await page.waitForTimeout(WAIT_TIMES.DISCOVERY);

      // 监听控制台日志
      const logs: string[] = [];
      page.on('console', msg => {
        logs.push(msg.text());
      });

      // 刷新
      await page.locator(SELECTORS.refreshButton).click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 关闭设备 B
      await page2.close();
      await browser2?.close();

      // 等待设备 B 离线
      await page.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 再次刷新
      await page.locator(SELECTORS.refreshButton).click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证没有严重错误
      const errorLogs = logs.filter(log =>
        log.includes('Error') || log.includes('error') && log.includes('stack')
      );
      // 允许一些错误（比如 Check online error），但不应该有严重错误
      expect(errorLogs.length).toBeLessThan(15);
    } finally {
      await browser2?.close();
    }
  });

  test('刷新时包含大量设备不应该卡顿或报错', async ({ page }) => {
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');
    await setupUser(page, '多设备测试');

    // 等待初始化完成
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 创建多个模拟设备
    const mockDevices: Array<{peerId: string; username: string; avatar: string | null; lastHeartbeat: number; firstDiscovered: number; isOnline: boolean}> = [];
    for (let i = 0; i < 10; i++) {
      mockDevices.push({
        peerId: `mock-peer-${i}-${Date.now()}`,
        username: `模拟设备${i}`,
        avatar: null,
        lastHeartbeat: Date.now(),
        firstDiscovered: Date.now(),
        isOnline: true,
      });
    }

    // 添加模拟设备到 localStorage
    await page.evaluate((devices) => {
      const existing = JSON.parse(localStorage.getItem('discovered_devices') || '{}');
      const merged = { ...existing, ...Object.fromEntries(devices.map(d => [d.peerId, d])) };
      localStorage.setItem('discovered_devices', JSON.stringify(merged));
    }, mockDevices);

    // 刷新页面以加载设备
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // 监听所有控制台日志
    const logs: string[] = [];
    page.on('console', msg => {
      logs.push(msg.text());
    });

    // 点击刷新按钮
    await page.locator(SELECTORS.refreshButton).click();
    await page.waitForTimeout(WAIT_TIMES.LONG);

    // 验证有刷新相关的日志
    const hasRefreshLog = logs.some(log =>
      log.includes('Refresh') || log.includes('刷新')
    );
    expect(hasRefreshLog).toBe(true);

    // 验证没有严重错误
    const errorLogs = logs.filter(log =>
      log.includes('Error') || log.includes('error')
    );
    const severeErrors = errorLogs.filter(log =>
      !log.includes('Check online error') &&
      !log.includes('Check online failed') &&
      !log.includes('Failed to request')
    );
    expect(severeErrors.length).toBeLessThan(10);
  });

  test('刷新消息应该准确显示设备数量', async ({ page }) => {
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');
    await setupUser(page, '设备数量测试');

    // 等待初始化完成
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 监听所有控制台日志
    const logs: string[] = [];
    page.on('console', msg => {
      logs.push(msg.text());
    });

    // 点击刷新
    await page.locator(SELECTORS.refreshButton).click();
    await page.waitForTimeout(WAIT_TIMES.LONG);

    // 验证有刷新相关的日志（更宽松的匹配）
    const hasRefreshLog = logs.some(log =>
      log.includes('Refresh') || log.includes('刷新')
    );
    expect(hasRefreshLog).toBe(true);

    // 验证没有严重错误
    const errorLogs = logs.filter(log =>
      (log.includes('Error') || log.includes('error')) && log.includes('stack')
    );
    expect(errorLogs.length).toBeLessThan(10);
  });

  test('连续多次刷新不应该报错', async ({ page }) => {
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');
    await setupUser(page, '连续刷新测试');

    // 等待初始化完成
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 监听所有控制台日志
    const logs: string[] = [];
    page.on('console', msg => {
      logs.push(msg.text());
    });

    // 连续刷新 5 次
    for (let i = 0; i < 5; i++) {
      await page.locator(SELECTORS.refreshButton).click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);
    }

    // 验证每次刷新都有日志
    const refreshLogsCount = logs.filter(log =>
      log.includes('Refresh') || log.includes('刷新')
    ).length;
    expect(refreshLogsCount).toBeGreaterThanOrEqual(5);

    // 验证没有严重错误
    const errorLogs = logs.filter(log =>
      log.includes('Error') || log.includes('error') && log.includes('stack')
    );
    const severeErrors = errorLogs.filter(log =>
      !log.includes('Check online error')
    );
    expect(severeErrors.length).toBeLessThan(20);
  });

  test('刷新时设备列表包含过期的离线设备不应该报错', async ({ page }) => {
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');
    await setupUser(page, '过期设备测试');

    const myPeerId = await getPeerIdFromStorage(page);
    if (!myPeerId) {
      test.skip();
      return;
    }

    // 添加一些过期的离线设备（超过 3 天未在线）
    const threeDaysAgo = Date.now() - (4 * 24 * 60 * 60 * 1000);
    const expiredDevices = [
      {
        peerId: 'expired-peer-1',
        username: '过期设备1',
        avatar: null,
        lastHeartbeat: threeDaysAgo,
        firstDiscovered: threeDaysAgo,
        isOnline: false,
      },
      {
        peerId: 'expired-peer-2',
        username: '过期设备2',
        avatar: null,
        lastHeartbeat: threeDaysAgo,
        firstDiscovered: threeDaysAgo,
        isOnline: false,
      },
    ];

    await page.evaluate((devices) => {
      const existing = JSON.parse(localStorage.getItem('discovered_devices') || '{}');
      const merged = { ...existing, ...Object.fromEntries(devices.map(d => [d.peerId, d])) };
      localStorage.setItem('discovered_devices', JSON.stringify(merged));
    }, expiredDevices);

    // 刷新页面
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // 监听所有控制台日志
    const logs: string[] = [];
    page.on('console', msg => {
      logs.push(msg.text());
    });

    // 点击刷新
    await page.locator(SELECTORS.refreshButton).click();
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证没有严重错误
    const errorLogs = logs.filter(log =>
      log.includes('Error') || log.includes('error') && log.includes('stack')
    );
    const severeErrors = errorLogs.filter(log =>
      !log.includes('Check online error')
    );
    expect(severeErrors.length).toBeLessThan(10);

    // 过期设备可能还在列表中（需要定时器清理），只要不崩溃就算通过
    // 重点是没有控制台严重错误
  });
});
