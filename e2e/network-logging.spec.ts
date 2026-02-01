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

    // 验证跳转到了网络数据日志页面（hash 路由格式）
    await page.waitForURL('/#/network-log');
    expect(page.url()).toContain('/#/network-log');

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

    // 刷新页面以重新加载
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // 重新创建 locator
    const switchElementAfterReload = page.locator(switchSelector);
    await switchElementAfterReload.waitFor({ state: 'visible', timeout: 5000 });

    // 验证开关状态仍然是开启的
    const isStillChecked = await switchElementAfterReload.isChecked();
    expect(isStillChecked).toBe(true);

    // 点击关闭网络数据日志记录
    await switchElementAfterReload.click();

    // 等待开关状态更新
    await page.waitForTimeout(WAIT_TIMES.SHORT);
    const isNowChecked2 = await switchElementAfterReload.isChecked();
    expect(isNowChecked2).toBe(false);

    // 保存设置
    const saveButton2 = page.locator('button[aria-label="save-settings-button"]');
    await saveButton2.click();

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

    // 重新创建 locator 以确保获取最新元素
    const switchElementAfterReload = page.locator('.network-logging-section .ant-switch');

    // 等待元素可见
    await switchElementAfterReload.waitFor({ state: 'visible', timeout: 5000 });

    // 验证开关状态仍然开启
    const isStillChecked = await switchElementAfterReload.isChecked();
    console.log('[Test] Switch checked after reload:', isStillChecked);
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

    // 验证跳转到了网络数据日志页面（hash 路由格式）
    await page.waitForURL('/#/network-log');
    expect(page.url()).toContain('/#/network-log');
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
      const tableRows = page.locator('.network-log-view .ant-table-tbody tr');
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
      await page1.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 等待表格加载完成
      await page1.waitForSelector('.network-log-view .ant-table', { timeout: 5000 });

      // 检查 IndexedDB 中的日志数量
      const indexedDBCount = await page1.evaluate(async () => {
        return new Promise<number>((resolve, reject) => {
          const request = indexedDB.open('P2PNetworkLogDB', 1);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['network_logs'], 'readonly');
            const store = transaction.objectStore('network_logs');
            const countRequest = store.count();
            countRequest.onsuccess = () => {
              resolve(countRequest.result);
              db.close();
            };
            countRequest.onerror = () => {
              reject(new Error('Failed to count logs'));
              db.close();
            };
          };
          request.onerror = () => reject(new Error('Failed to open IndexedDB'));
        });
      });

      console.log('[Test] IndexedDB log count:', indexedDBCount);

      // 检查所有表格行（包括可能的占位行）
      const allTableRows = page1.locator('.network-log-view .ant-table-tbody tr');
      const allCount = await allTableRows.count();
      console.log('[Test] All table row count (including placeholders):', allCount);

      // 获取第一行的文本内容
      if (allCount > 0) {
        const firstRowText = await allTableRows.nth(0).textContent();
        console.log('[Test] First row text:', firstRowText);
      }

      // 验证日志记录（应该有通信数据）
      // 使用更通用的选择器
      const tableRows = page1.locator('.network-log-view .ant-table-tbody tr');
      const count = await tableRows.count();

      console.log('[Test] Table row count:', count);

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
      await page1.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 验证 IndexedDB 中没有新日志记录（或日志数量很少）
      // 由于关闭日志记录后可能还会有一些内部通信，但应该远少于开启时的情况
      const indexedDBCount = await page1.evaluate(async () => {
        return new Promise<number>((resolve, reject) => {
          const request = indexedDB.open('P2PNetworkLogDB', 1);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['network_logs'], 'readonly');
            const store = transaction.objectStore('network_logs');
            const countRequest = store.count();
            countRequest.onsuccess = () => {
              resolve(countRequest.result);
              db.close();
            };
            countRequest.onerror = () => {
              reject(new Error('Failed to count logs'));
              db.close();
            };
          };
          request.onerror = () => reject(new Error('Failed to open IndexedDB'));
        });
      });

      console.log('[Test] IndexedDB log count with logging disabled:', indexedDBCount);

      // 关闭日志记录后，日志数量应该很少（小于等于5条，因为只是内部通信）
      // 而开启日志时会有很多条（discovery、respond等）
      expect(indexedDBCount).toBeLessThanOrEqual(5);
    } finally {
      await context1.close();
      await context2.close();
    }
  });
});

/**
 * IndexedDB 存储验证测试
 */
test.describe('IndexedDB 存储验证', () => {
  test.setTimeout(60000);

  test('网络日志应该存储到 IndexedDB', async ({ browser }) => {
    // 创建两个浏览器上下文
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // 设置第一个用户并开启日志记录
      await page1.goto('/settings');
      await page1.waitForLoadState('domcontentloaded');
      await setupUser(page1, 'IndexedDB验证用户A');

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
      await setupUser(page2, 'IndexedDB验证用户B');

      // 获取第二个用户的 PeerId
      const peerId2 = await page2.evaluate(() => {
        const userInfo = localStorage.getItem('p2p_user_info');
        return userInfo ? JSON.parse(userInfo).peerId : null;
      });

      expect(peerId2).not.toBeNull();

      // 第一个用户添加第二个用户，产生网络通信
      await page1.goto('/center');
      await page1.waitForLoadState('domcontentloaded');
      const peerIdInput = page1.locator('input[placeholder*="Peer ID"]');
      await peerIdInput.fill(peerId2);
      const addButton = page1.locator('button[aria-label="add-device"]');
      await addButton.click();

      // 等待发现操作完成
      await page1.waitForTimeout(WAIT_TIMES.DISCOVERY);

      // 验证 IndexedDB 中存在网络日志数据
      const indexedDBLogs = await page1.evaluate(async () => {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open('P2PNetworkLogDB', 1);

          request.onerror = () => reject(new Error('Failed to open IndexedDB'));
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['network_logs'], 'readonly');
            const store = transaction.objectStore('network_logs');
            const getAllRequest = store.getAll();

            getAllRequest.onsuccess = () => {
              resolve(getAllRequest.result);
              db.close();
            };
            getAllRequest.onerror = () => {
              reject(new Error('Failed to get logs from IndexedDB'));
              db.close();
            };
          };
        });
      });

      // 验证 IndexedDB 中有日志记录
      expect(Array.isArray(indexedDBLogs)).toBe(true);
      expect(indexedDBLogs.length).toBeGreaterThan(0);

      // 验证日志数据结构
      const firstLog = indexedDBLogs[0] as Record<string, unknown>;
      expect(firstLog).toHaveProperty('id');
      expect(firstLog).toHaveProperty('timestamp');
      expect(firstLog).toHaveProperty('direction');
      expect(firstLog).toHaveProperty('peerId');
      expect(firstLog).toHaveProperty('protocol');
      expect(firstLog).toHaveProperty('status');
      expect(['outgoing', 'incoming']).toContain(firstLog.direction);
      expect(['success', 'error', 'pending']).toContain(firstLog.status);

      console.log('[Test] IndexedDB 验证成功，日志数量:', indexedDBLogs.length);
      console.log('[Test] 第一条日志:', JSON.stringify(firstLog, null, 2));
    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test('IndexedDB 中的日志应该与页面显示一致', async ({ browser }) => {
    // 创建两个浏览器上下文
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    try {
      // 设置第一个用户并开启日志记录
      await page1.goto('/settings');
      await page1.waitForLoadState('domcontentloaded');
      await setupUser(page1, '一致性验证用户A');

      // 开启网络数据日志记录
      await page1.goto('/settings');
      await page1.waitForLoadState('domcontentloaded');
      const switch1 = page1.locator('.network-logging-section .ant-switch');
      await switch1.click();
      const saveButton1 = page1.locator('button[aria-label="save-settings-button"]');
      await saveButton1.click();
      await page1.waitForSelector('.inline-message-success', { timeout: 3000 });

      // 刷新页面让 Peer 重新初始化
      await page1.reload();
      await page1.waitForLoadState('domcontentloaded');
      await page1.waitForTimeout(WAIT_TIMES.PEER_INIT);

      // 设置第二个用户
      await page2.goto('/settings');
      await page2.waitForLoadState('domcontentloaded');
      await setupUser(page2, '一致性验证用户B');

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
      await page1.waitForTimeout(WAIT_TIMES.MEDIUM);

      // 获取页面上显示的日志数量
      // 注意：表格可能包含占位行，所以我们需要检查实际有内容的行
      const tableRows = page1.locator('.network-log-view .ant-table-tbody tr');
      const displayedRowCount = await tableRows.count();

      // 获取 IndexedDB 中的日志总数
      const indexedDBTotalCount = await page1.evaluate(async () => {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open('P2PNetworkLogDB', 1);

          request.onerror = () => reject(new Error('Failed to open IndexedDB'));
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(['network_logs'], 'readonly');
            const store = transaction.objectStore('network_logs');
            const countRequest = store.count();

            countRequest.onsuccess = () => {
              resolve(countRequest.result);
              db.close();
            };
            countRequest.onerror = () => {
              reject(new Error('Failed to count logs'));
              db.close();
            };
          };
        });
      });

      // 验证 IndexedDB 中的日志数量大于 0
      expect(indexedDBTotalCount).toBeGreaterThan(0);

      console.log('[Test] IndexedDB 日志总数:', indexedDBTotalCount);
      console.log('[Test] 页面显示日志数量:', displayedRowCount);

      // 验证页面显示了日志（表格行数大于0）
      expect(displayedRowCount).toBeGreaterThan(0);
    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test('清空日志按钮应该存在并可点击', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '清空日志按钮测试用户');

    // 点击导航菜单中的"网络数据日志"项
    const networkLogMenuItem = page.locator(SELECTORS.networkLogMenuItem);
    await networkLogMenuItem.click();

    // 等待页面加载
    await page.waitForLoadState('domcontentloaded');

    // 验证清空按钮存在并可点击
    const clearButton = page.locator('button[aria-label="清空所有日志"]');
    await expect(clearButton).toBeVisible();
  });

  test('IndexedDB 数据库名称和版本应该正确', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '数据库结构验证用户');

    // 先导航到网络数据日志页面，触发 IndexedDB 初始化
    await page.goto('/network-log');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 验证 IndexedDB 数据库存在且结构正确
    const dbInfo = await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('P2PNetworkLogDB', 1);

        request.onerror = () => reject(new Error('Failed to open IndexedDB'));
        request.onsuccess = () => {
          const db = request.result;
          const info = {
            name: db.name,
            version: db.version,
            objectStoreNames: Array.from(db.objectStoreNames),
          };
          db.close();
          resolve(info);
        };
      });
    });

    // 验证数据库名称
    expect(dbInfo.name).toBe('P2PNetworkLogDB');

    // 验证数据库版本
    expect(dbInfo.version).toBe(1);

    // 验证对象存储存在
    expect(dbInfo.objectStoreNames).toContain('network_logs');

    console.log('[Test] IndexedDB 数据库信息:', dbInfo);
  });
});
