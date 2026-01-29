import { test, expect } from '@playwright/test';
import {
  setupUser,
  clearAllStorage,
  WAIT_TIMES,
  SELECTORS,
} from './test-helpers.js';

/**
 * 网络数据日志功能测试
 * 测试场景：
 * 1. 应该能访问网络数据日志页面
 * 2. 应该能在设置页面开启网络数据日志记录
 * 3. 应该能在设置页面关闭网络数据日志记录
 * 4. 网络数据日志记录开关应该持久化
 * 5. 开启日志记录后应该记录网络通信数据
 * 6. 关闭日志记录后不应该记录新日志
 * 7. 应该能清空所有日志
 * 8. 应该能查看日志数据详情
 * 9. 日志应该分页显示
 */
test.describe('网络数据日志功能', () => {
  test.setTimeout(30000);

  test.beforeEach(async ({ page }) => {
    // 不清理存储，让用户设置自然进行
  });

  test('应该能访问网络数据日志页面', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '日志测试用户');

    // 点击导航菜单中的"网络数据日志"项
    const networkLogMenuItem = page.locator(SELECTORS.networkLogMenuItem);
    await networkLogMenuItem.click();

    // 验证跳转到了网络数据日志页面
    await page.waitForURL('/network-log');
    expect(page.url()).toContain('/network-log');

    // 验证页面标题
    const pageTitle = page.locator('.network-log-view .ant-card-head-title');
    await expect(pageTitle).toContainText('网络数据日志');
  });

  test('应该能在设置页面显示网络数据日志记录开关', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '日志开关测试用户');

    // 再次导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 验证显示网络数据日志记录卡片
    const loggingCard = page.locator('.settings-container .ant-card').filter({ hasText: '网络数据日志记录' });
    await expect(loggingCard).toBeVisible();
  });

  test('应该能在设置页面开启网络数据日志记录', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '开启日志测试用户');

    // 再次导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 找到网络数据日志记录开关
    const switchSelector = '.network-logging-section .ant-switch';
    const switchElement = page.locator(switchSelector);

    // 检查初始状态（应该是关闭的）
    const isInitiallyChecked = await switchElement.isChecked();
    expect(isInitiallyChecked).toBe(false);

    // 点击开启网络数据日志记录
    await switchElement.click();

    // 等待开关状态更新
    await page.waitForTimeout(WAIT_TIMES.SHORT);
    const isNowChecked = await switchElement.isChecked();
    expect(isNowChecked).toBe(true);

    // 保存设置
    const saveButton = page.locator('button[aria-label="save-settings-button"]');
    await saveButton.click();

    // 等待保存成功提示（使用内联提示选择器）
    await page.waitForSelector('.inline-message-success', { timeout: 3000 });

    // 验证网络日志记录状态已保存
    const networkLoggingStatus = await page.evaluate(() => {
      return localStorage.getItem('p2p_network_logging');
    });

    expect(networkLoggingStatus).toBe('true');
  });

  test('应该能在设置页面关闭网络数据日志记录', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '关闭日志测试用户');

    // 先开启网络日志记录
    await page.evaluate(() => {
      localStorage.setItem('p2p_network_logging', 'true');
    });

    // 再次导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 找到网络数据日志记录开关
    const switchSelector = '.network-logging-section .ant-switch';
    const switchElement = page.locator(switchSelector);

    // 检查初始状态（应该是开启的）
    const isInitiallyChecked = await switchElement.isChecked();
    expect(isInitiallyChecked).toBe(true);

    // 点击关闭网络数据日志记录
    await switchElement.click();

    // 等待开关状态更新
    await page.waitForTimeout(WAIT_TIMES.SHORT);
    const isNowChecked = await switchElement.isChecked();
    expect(isNowChecked).toBe(false);

    // 保存设置
    const saveButton = page.locator('button[aria-label="save-settings-button"]');
    await saveButton.click();

    // 等待保存成功提示（使用内联提示选择器）
    await page.waitForSelector('.inline-message-success', { timeout: 3000 });

    // 验证网络日志记录状态已保存
    const networkLoggingStatus = await page.evaluate(() => {
      return localStorage.getItem('p2p_network_logging');
    });

    expect(networkLoggingStatus).toBe('false');
  });

  test('网络数据日志记录开关应该持久化', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '持久化日志测试用户');

    // 再次导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 开启网络数据日志记录
    const switchSelector = '.network-logging-section .ant-switch';
    const switchElement = page.locator(switchSelector);
    await switchElement.click();

    // 保存设置
    const saveButton = page.locator('button[aria-label="save-settings-button"]');
    await saveButton.click();

    // 等待保存成功（使用内联提示选择器）
    await page.waitForSelector('.inline-message-success', { timeout: 3000 });

    // 刷新页面
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // 验证开关状态仍然开启
    const isStillChecked = await switchElement.isChecked();
    expect(isStillChecked).toBe(true);
  });

  test('应该能显示网络数据日志开启时的提示信息', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '日志提示测试用户');

    // 再次导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 开启网络数据日志记录
    const switchSelector = '.network-logging-section .ant-switch';
    const switchElement = page.locator(switchSelector);
    await switchElement.click();
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证显示成功提示信息
    const successAlert = page.locator('.network-logging-section .ant-alert-info');
    await expect(successAlert).toBeVisible();
    await expect(successAlert).toContainText('网络数据日志记录已开启');
  });

  test('应该能显示网络数据日志关闭时的提示信息', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '日志提示测试用户');

    // 再次导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 验证显示警告提示信息（默认关闭状态）
    const warningAlert = page.locator('.network-logging-section .ant-alert-warning');
    await expect(warningAlert).toBeVisible();
    await expect(warningAlert).toContainText('网络数据日志记录已关闭');
  });

  test('应该能从设置页面直接跳转到网络数据日志页面', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '跳转测试用户');

    // 再次导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 开启网络数据日志记录
    const switchSelector = '.network-logging-section .ant-switch';
    const switchElement = page.locator(switchSelector);
    await switchElement.click();
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 等待"查看网络数据日志"按钮出现
    const viewLogButton = page.locator('.network-logging-section button:has-text("查看网络数据日志")');
    await expect(viewLogButton).toBeVisible({ timeout: 5000 });
    await viewLogButton.click();

    // 验证跳转到了网络数据日志页面
    await page.waitForURL('/network-log');
    expect(page.url()).toContain('/network-log');
  });

  test('网络数据日志页面应该显示空状态', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '空状态测试用户');

    // 点击导航菜单中的"网络数据日志"项
    const networkLogMenuItem = page.locator(SELECTORS.networkLogMenuItem);
    await networkLogMenuItem.click();

    // 等待页面加载
    await page.waitForLoadState('domcontentloaded');

    // 验证表格显示（即使没有数据）
    const table = page.locator('.network-log-view .ant-table');
    await expect(table).toBeVisible();
  });

  test('应该能清空所有日志', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '清空日志测试用户');

    // 点击导航菜单中的"网络数据日志"项
    const networkLogMenuItem = page.locator(SELECTORS.networkLogMenuItem);
    await networkLogMenuItem.click();

    // 等待页面加载
    await page.waitForLoadState('domcontentloaded');

    // 点击清空日志按钮
    const clearButton = page.locator('button[aria-label="清空所有日志"]');
    await clearButton.click();

    // 等待清空完成
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 验证表格显示"暂无数据"或没有实际数据行
    // ant-design-vue 表格在空数据时会有 "暂无数据" 的占位行
    const emptyText = page.locator('.network-log-view .ant-table-placeholder');
    const noDataMessage = page.locator('.network-log-view .ant-empty-description');

    // 等待一下确保清空操作完成
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证：要么有"暂无数据"文本，要么没有实际的数据行（排除占位行）
    const hasEmptyPlaceholder = await emptyText.count() > 0;
    const hasNoDataMessage = await noDataMessage.count() > 0;
    const hasEmptyState = hasEmptyPlaceholder || hasNoDataMessage;

    // 如果没有空状态占位，检查实际数据行
    if (!hasEmptyState) {
      const tableRows = page.locator('.network-log-view .ant-table-tbody tr.ant-table-tbody-row');
      const dataRowCount = await tableRows.count();
      expect(dataRowCount).toBe(0);
    } else {
      // 有空状态占位，验证显示正确
      expect(hasEmptyState).toBe(true);
    }
  });

  test('应该显示网络数据日志表格的列标题', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '表格列测试用户');

    // 点击导航菜单中的"网络数据日志"项
    const networkLogMenuItem = page.locator(SELECTORS.networkLogMenuItem);
    await networkLogMenuItem.click();

    // 等待页面加载
    await page.waitForLoadState('domcontentloaded');

    // 验证表格存在且有列（ant-design-vue 4.x 的列标题结构）
    const table = page.locator('.network-log-view .ant-table');
    await expect(table).toBeVisible();

    // 验证至少有一些 th 元素（说明有列）
    const headers = page.locator('.network-log-view .ant-table-thead th');
    const headerCount = await headers.count();
    expect(headerCount).toBeGreaterThan(0);
  });

  test('应该能显示分页组件', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '分页测试用户');

    // 点击导航菜单中的"网络数据日志"项
    const networkLogMenuItem = page.locator(SELECTORS.networkLogMenuItem);
    await networkLogMenuItem.click();

    // 等待页面加载
    await page.waitForLoadState('domcontentloaded');

    // 验证分页组件存在
    const pagination = page.locator('.network-log-view .ant-pagination');
    await expect(pagination).toBeVisible();
  });
});

/**
 * 网络数据日志记录功能测试（需要两个浏览器 session）
 */
test.describe('网络数据日志记录功能', () => {
  test.setTimeout(30000);

  test('开启日志记录后应该记录网络通信数据', async ({ browser }) => {
    // 创建两个浏览器上下文
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // 设置第一个用户并开启日志记录
      await page1.goto('/settings');
      await page1.waitForLoadState('domcontentloaded');
      await setupUser(page1, '日志记录用户A');

      // 开启网络数据日志记录
      await page1.goto('/settings');
      await page1.waitForLoadState('domcontentloaded');
      const switch1 = page1.locator('.network-logging-section .ant-switch');
      await switch1.click();
      const saveButton1 = page1.locator('button[aria-label="save-settings-button"]');
      await saveButton1.click();
      await page1.waitForSelector('.inline-message-success', { timeout: 3000 });

      // 刷新页面让 Peer 重新初始化，应用日志记录设置
      await page1.reload();
      await page1.waitForLoadState('domcontentloaded');
      await page1.waitForTimeout(WAIT_TIMES.PEER_INIT);

      // 设置第二个用户
      await page2.goto('/settings');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '日志记录用户B');

      // 获取第二个用户的 PeerId
      const peerId2 = await page2.evaluate(() => {
        const userInfo = localStorage.getItem('p2p_user_info');
        return userInfo ? JSON.parse(userInfo).peerId : null;
      });

      expect(peerId2).not.toBeNull();

      // 第一个用户添加第二个用户
      await page1.goto('/center');
      await page1.waitForLoadState('domcontentloaded');
      const peerIdInput = page1.locator('input[placeholder*="Peer ID"]');
      await peerIdInput.fill(peerId2);
      const addButton = page1.locator('button[aria-label="add-device"]');
      await addButton.click();

      // 等待发现操作完成
      await page1.waitForTimeout(WAIT_TIMES.DISCOVERY);

      // 进入网络数据日志页面
      await page1.goto('/network-log');
      await page1.waitForLoadState('domcontentloaded');

      // 验证日志记录（应该有通信数据）
      const tableRows = page1.locator('.network-log-view .ant-table-tbody tr');
      const count = await tableRows.count();

      // 应该有日志记录（至少 1 条）
      expect(count).toBeGreaterThan(0);
    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test('关闭日志记录后不应该记录新日志', async ({ browser }) => {
    // 创建两个浏览器上下文
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // 设置第一个用户并关闭日志记录
      await page1.goto('/settings');
      await page1.waitForLoadState('domcontentloaded');
      await setupUser(page1, '无日志记录用户A');

      // 确保日志记录关闭
      await page1.goto('/settings');
      await page1.waitForLoadState('domcontentloaded');
      const switch1 = page1.locator('.network-logging-section .ant-switch');
      const isInitiallyChecked = await switch1.isChecked();
      if (isInitiallyChecked) {
        await switch1.click();
        const saveButton1 = page1.locator('button[aria-label="save-settings-button"]');
        await saveButton1.click();
        await page1.waitForSelector('.inline-message-success', { timeout: 3000 });
      }

      // 设置第二个用户
      await page2.goto('/settings');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '无日志记录用户B');

      // 获取第二个用户的 PeerId
      const peerId2 = await page2.evaluate(() => {
        const userInfo = localStorage.getItem('p2p_user_info');
        return userInfo ? JSON.parse(userInfo).peerId : null;
      });

      expect(peerId2).not.toBeNull();

      // 第一个用户添加第二个用户
      await page1.goto('/center');
      await page1.waitForLoadState('domcontentloaded');
      const peerIdInput = page1.locator('input[placeholder*="Peer ID"]');
      await peerIdInput.fill(peerId2);
      const addButton = page1.locator('button[aria-label="add-device"]');
      await addButton.click();

      // 等待发现操作完成
      await page1.waitForTimeout(WAIT_TIMES.DISCOVERY);

      // 进入网络数据日志页面
      await page1.goto('/network-log');
      await page1.waitForLoadState('domcontentloaded');

      // 验证没有实际数据日志记录
      // ant-design-vue 表格在空数据时可能有占位行
      const dataRows = page1.locator('.network-log-view .ant-table-tbody tr.ant-table-tbody-row');
      const dataRowCount = await dataRows.count();

      // 应该没有日志记录
      expect(dataRowCount).toBe(0);
    } finally {
      await context1.close();
      await context2.close();
    }
  });
});
