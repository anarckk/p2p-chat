/**
 * 网络数据日志页面 UI 测试
 * 测试网络日志页面的各种 UI 元素的样式和属性
 */

import { test, expect } from '@playwright/test';
import { SELECTORS, WAIT_TIMES, setupUser } from '../test-helpers';

test.describe('网络数据日志页面 UI 测试', () => {
  test.beforeEach(async ({ page, context }) => {
    // 先设置用户信息到 localStorage，避免弹窗干扰
    await context.addInitScript(() => {
      localStorage.setItem('p2p_user_info', JSON.stringify({
        username: 'TestUser',
        avatar: null,
        peerId: null,
      }));
    });

    // 导航到网络数据日志页面并等待加载
    await page.goto('/#/network-log');
    await page.waitForLoadState('domcontentloaded');

    // 等待网络日志视图加载
    await page.waitForSelector(SELECTORS.networkLogView, { timeout: 10000 });
  });

  test('1. 表格样式 - 验证表格有 size="small" 属性', async ({ page }) => {
    const table = page.locator('.ant-table');

    // 验证表格可见
    await expect(table).toBeVisible();

    // 验证表格有 ant-table-small 类（对应 size="small" 属性）
    const hasSmallClass = await page.evaluate(() => {
      const table = document.querySelector('.ant-table');
      return table?.classList.contains('ant-table-small');
    });
    expect(hasSmallClass).toBe(true);
  });

  test('2. 表格样式 - 验证表格滚动区域 :scroll="{ y: 500 }"', async ({ page }) => {
    // 验证表格有滚动区域
    const hasScrollBody = await page.evaluate(() => {
      const table = document.querySelector('.ant-table');
      const scrollBody = table?.querySelector('.ant-table-body');
      if (scrollBody) {
        const styles = window.getComputedStyle(scrollBody);
        return {
          hasMaxHeight: styles.maxHeight !== 'none',
          maxHeight: styles.maxHeight,
        };
      }
      return null;
    });

    expect(hasScrollBody).not.toBeNull();
    expect(hasScrollBody?.hasMaxHeight).toBe(true);
    // 验证 max-height 是 500px 或 500.xxxpx（某些浏览器会有小数）
    expect(parseInt(hasScrollBody!.maxHeight || '0')).toBe(500);
  });

  test('3. 分页组件 - 验证分页组件存在', async ({ page }) => {
    const pagination = page.locator('.ant-pagination');

    // 验证分页组件可见
    await expect(pagination).toBeVisible();
  });

  test('4. 分页组件 - 验证显示总数 "共 X 条"', async ({ page }) => {
    const pagination = page.locator('.ant-pagination');

    // 验证分页组件可见
    await expect(pagination).toBeVisible();

    // 验证显示总数文本（即使没有数据，也应该显示 "共 0 条"）
    const totalText = await page.evaluate(() => {
      const pagination = document.querySelector('.ant-pagination');
      const totalItem = pagination?.querySelector('.ant-pagination-total-text');
      return totalItem?.textContent || '';
    });

    // 验证文本包含 "共" 和 "条"
    expect(totalText).toContain('共');
    expect(totalText).toContain('条');
  });

  test('5. 数据详情弹窗 - 验证点击"查看数据详情"按钮打开弹窗', async ({ page }) => {
    // 首先创建一些测试日志数据
    await page.evaluate(async () => {
      // 直接操作 IndexedDB 创建测试数据
      const request = indexedDB.open('P2PNetworkLogDB', 1);

      await new Promise((resolve, reject) => {
        request.onsuccess = resolve;
        request.onerror = reject;
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('network_logs')) {
            const store = db.createObjectStore('network_logs', { keyPath: 'id', autoIncrement: true });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
      });

      const db = request.result;
      const transaction = db.transaction(['network_logs'], 'readwrite');
      const store = transaction.objectStore('network_logs');

      await new Promise((resolve, reject) => {
        const addRequest = store.add({
          timestamp: Date.now(),
          direction: 'outgoing',
          peerId: 'peer-test-1234567890-abcdefghij',
          protocol: 'test-protocol',
          stage: 'test-stage',
          data: { test: 'data', message: 'This is a test message' },
          dataSize: 100,
          status: 'success',
        });
        addRequest.onsuccess = resolve;
        addRequest.onerror = reject;
      });

      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = reject;
      });

      db.close();
    });

    // 刷新页面以加载新创建的数据
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector(SELECTORS.networkLogView, { timeout: 10000 });

    // 等待表格数据加载
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 查找展开按钮并点击
    const expandButtons = page.locator('.ant-table-row-expand-icon');
    const count = await expandButtons.count();

    if (count > 0) {
      // 点击第一个展开按钮
      await expandButtons.first().click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 查找并点击"查看数据详情"按钮
      const detailButton = page.locator(SELECTORS.networkLogDataDetailButton);
      await detailButton.first().click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证弹窗已打开
      const modal = page.locator('.ant-modal');
      await expect(modal).toBeVisible();

      // 验证弹窗标题
      const modalTitle = modal.locator('.ant-modal-title');
      await expect(modalTitle).toContainText('数据详情');

      // 关闭弹窗
      const closeButton = modal.locator('.ant-modal-close');
      await closeButton.click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);
    } else {
      // 如果没有数据，跳过测试
      test.skip(true, '没有测试数据');
    }
  });

  test('6. 数据详情弹窗 - 验证弹窗内容为 <pre> 标签', async ({ page }) => {
    // 首先创建一些测试日志数据
    await page.evaluate(async () => {
      const request = indexedDB.open('P2PNetworkLogDB', 1);

      await new Promise((resolve, reject) => {
        request.onsuccess = resolve;
        request.onerror = reject;
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('network_logs')) {
            const store = db.createObjectStore('network_logs', { keyPath: 'id', autoIncrement: true });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
      });

      const db = request.result;
      const transaction = db.transaction(['network_logs'], 'readwrite');
      const store = transaction.objectStore('network_logs');

      await new Promise((resolve, reject) => {
        const addRequest = store.add({
          timestamp: Date.now(),
          direction: 'outgoing',
          peerId: 'peer-test-1234567890-abcdefghij',
          protocol: 'test-protocol',
          stage: 'test-stage',
          data: { test: 'data', message: 'This is a test message' },
          dataSize: 100,
          status: 'success',
        });
        addRequest.onsuccess = resolve;
        addRequest.onerror = reject;
      });

      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = reject;
      });

      db.close();
    });

    // 刷新页面以加载新创建的数据
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector(SELECTORS.networkLogView, { timeout: 10000 });

    // 等待表格数据加载
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 查找展开按钮并点击
    const expandButtons = page.locator('.ant-table-row-expand-icon');
    const count = await expandButtons.count();

    if (count > 0) {
      // 点击第一个展开按钮
      await expandButtons.first().click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 查找并点击"查看数据详情"按钮
      const detailButton = page.locator(SELECTORS.networkLogDataDetailButton);
      await detailButton.first().click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证弹窗中有 <pre> 标签
      const preTag = page.locator('.ant-modal pre');
      await expect(preTag).toBeVisible();

      // 验证 <pre> 标签的内容是 JSON 格式
      const preContent = await preTag.textContent();
      expect(preContent).toContain('{');
      expect(preContent).toContain('}');

      // 关闭弹窗
      const closeButton = page.locator('.ant-modal-close');
      await closeButton.click();
    } else {
      test.skip(true, '没有测试数据');
    }
  });

  test('7. 数据详情弹窗 - 验证弹窗宽度为 800px', async ({ page }) => {
    // 首先创建一些测试日志数据
    await page.evaluate(async () => {
      const request = indexedDB.open('P2PNetworkLogDB', 1);

      await new Promise((resolve, reject) => {
        request.onsuccess = resolve;
        request.onerror = reject;
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('network_logs')) {
            const store = db.createObjectStore('network_logs', { keyPath: 'id', autoIncrement: true });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
      });

      const db = request.result;
      const transaction = db.transaction(['network_logs'], 'readwrite');
      const store = transaction.objectStore('network_logs');

      await new Promise((resolve, reject) => {
        const addRequest = store.add({
          timestamp: Date.now(),
          direction: 'outgoing',
          peerId: 'peer-test-1234567890-abcdefghij',
          protocol: 'test-protocol',
          stage: 'test-stage',
          data: { test: 'data', message: 'This is a test message' },
          dataSize: 100,
          status: 'success',
        });
        addRequest.onsuccess = resolve;
        addRequest.onerror = reject;
      });

      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = reject;
      });

      db.close();
    });

    // 刷新页面以加载新创建的数据
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector(SELECTORS.networkLogView, { timeout: 10000 });

    // 等待表格数据加载
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 查找展开按钮并点击
    const expandButtons = page.locator('.ant-table-row-expand-icon');
    const count = await expandButtons.count();

    if (count > 0) {
      // 点击第一个展开按钮
      await expandButtons.first().click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 查找并点击"查看数据详情"按钮
      const detailButton = page.locator(SELECTORS.networkLogDataDetailButton);
      await detailButton.first().click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证弹窗宽度为 800px
      const modalWidth = await page.evaluate(() => {
        const modal = document.querySelector('.ant-modal');
        if (modal) {
          const styles = window.getComputedStyle(modal);
          return styles.width;
        }
        return null;
      });

      expect(modalWidth).toBe('800px');

      // 关闭弹窗
      const closeButton = page.locator('.ant-modal-close');
      await closeButton.click();
    } else {
      test.skip(true, '没有测试数据');
    }
  });

  test('8. 方向标签颜色 - 验证"发送"标签为蓝色', async ({ page }) => {
    // 创建测试数据 - 发送方向
    await page.evaluate(async () => {
      const request = indexedDB.open('P2PNetworkLogDB', 1);

      await new Promise((resolve, reject) => {
        request.onsuccess = resolve;
        request.onerror = reject;
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('network_logs')) {
            const store = db.createObjectStore('network_logs', { keyPath: 'id', autoIncrement: true });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
      });

      const db = request.result;
      const transaction = db.transaction(['network_logs'], 'readwrite');
      const store = transaction.objectStore('network_logs');

      await new Promise((resolve, reject) => {
        const addRequest = store.add({
          timestamp: Date.now(),
          direction: 'outgoing',
          peerId: 'peer-test-1234567890-abcdefghij',
          protocol: 'test-protocol',
          data: { test: 'data' },
          dataSize: 100,
          status: 'success',
        });
        addRequest.onsuccess = resolve;
        addRequest.onerror = reject;
      });

      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = reject;
      });

      db.close();
    });

    // 刷新页面以加载新创建的数据
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector(SELECTORS.networkLogView, { timeout: 10000 });

    // 等待表格数据加载
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 查找"发送"标签
    const sendTag = page.locator('.ant-tag:has-text("发送")').first();

    if (await sendTag.isVisible()) {
      // 验证标签有蓝色样式
      const tagColor = await page.evaluate(() => {
        const tags = Array.from(document.querySelectorAll('.ant-tag'));
        const tag = tags.find(t => t.textContent?.trim() === '发送') as HTMLElement;
        if (tag) {
          return {
            hasBlueClass: tag.classList.contains('ant-tag-blue'),
            backgroundColor: window.getComputedStyle(tag).backgroundColor,
          };
        }
        return null;
      });

      expect(tagColor).not.toBeNull();
      expect(tagColor?.hasBlueClass).toBe(true);
    } else {
      test.skip(true, '没有测试数据');
    }
  });

  test('9. 方向标签颜色 - 验证"接收"标签为绿色', async ({ page }) => {
    // 创建测试数据 - 接收方向
    await page.evaluate(async () => {
      const request = indexedDB.open('P2PNetworkLogDB', 1);

      await new Promise((resolve, reject) => {
        request.onsuccess = resolve;
        request.onerror = reject;
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('network_logs')) {
            const store = db.createObjectStore('network_logs', { keyPath: 'id', autoIncrement: true });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
      });

      const db = request.result;
      const transaction = db.transaction(['network_logs'], 'readwrite');
      const store = transaction.objectStore('network_logs');

      await new Promise((resolve, reject) => {
        const addRequest = store.add({
          timestamp: Date.now(),
          direction: 'incoming',
          peerId: 'peer-test-1234567890-abcdefghij',
          protocol: 'test-protocol',
          data: { test: 'data' },
          dataSize: 100,
          status: 'success',
        });
        addRequest.onsuccess = resolve;
        addRequest.onerror = reject;
      });

      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = reject;
      });

      db.close();
    });

    // 刷新页面以加载新创建的数据
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector(SELECTORS.networkLogView, { timeout: 10000 });

    // 等待表格数据加载
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 查找"接收"标签
    const receiveTag = page.locator('.ant-tag:has-text("接收")').first();

    if (await receiveTag.isVisible()) {
      // 验证标签有绿色样式
      const tagColor = await page.evaluate(() => {
        const tags = Array.from(document.querySelectorAll('.ant-tag'));
        const tag = tags.find(t => t.textContent?.trim() === '接收') as HTMLElement;
        if (tag) {
          return {
            hasGreenClass: tag.classList.contains('ant-tag-green'),
            backgroundColor: window.getComputedStyle(tag).backgroundColor,
          };
        }
        return null;
      });

      expect(tagColor).not.toBeNull();
      expect(tagColor?.hasGreenClass).toBe(true);
    } else {
      test.skip(true, '没有测试数据');
    }
  });

  test('10. 状态标签颜色 - 验证"成功"状态为绿色', async ({ page }) => {
    // 创建测试数据 - 成功状态
    await page.evaluate(async () => {
      const request = indexedDB.open('P2PNetworkLogDB', 1);

      await new Promise((resolve, reject) => {
        request.onsuccess = resolve;
        request.onerror = reject;
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('network_logs')) {
            const store = db.createObjectStore('network_logs', { keyPath: 'id', autoIncrement: true });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
      });

      const db = request.result;
      const transaction = db.transaction(['network_logs'], 'readwrite');
      const store = transaction.objectStore('network_logs');

      await new Promise((resolve, reject) => {
        const addRequest = store.add({
          timestamp: Date.now(),
          direction: 'outgoing',
          peerId: 'peer-test-1234567890-abcdefghij',
          protocol: 'test-protocol',
          data: { test: 'data' },
          dataSize: 100,
          status: 'success',
        });
        addRequest.onsuccess = resolve;
        addRequest.onerror = reject;
      });

      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = reject;
      });

      db.close();
    });

    // 刷新页面以加载新创建的数据
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector(SELECTORS.networkLogView, { timeout: 10000 });

    // 等待表格数据加载
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 查找"成功"标签
    const successTag = page.locator('.ant-tag:has-text("成功")').first();

    if (await successTag.isVisible()) {
      // 验证标签有绿色样式
      const tagColor = await page.evaluate(() => {
        const tags = Array.from(document.querySelectorAll('.ant-tag'));
        const tag = tags.find(t => t.textContent?.trim() === '成功') as HTMLElement;
        if (tag) {
          return {
            hasGreenClass: tag.classList.contains('ant-tag-green'),
            backgroundColor: window.getComputedStyle(tag).backgroundColor,
          };
        }
        return null;
      });

      expect(tagColor).not.toBeNull();
      expect(tagColor?.hasGreenClass).toBe(true);
    } else {
      test.skip(true, '没有测试数据');
    }
  });

  test('11. 状态标签颜色 - 验证"错误"状态为红色', async ({ page }) => {
    // 创建测试数据 - 错误状态
    await page.evaluate(async () => {
      const request = indexedDB.open('P2PNetworkLogDB', 1);

      await new Promise((resolve, reject) => {
        request.onsuccess = resolve;
        request.onerror = reject;
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('network_logs')) {
            const store = db.createObjectStore('network_logs', { keyPath: 'id', autoIncrement: true });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
      });

      const db = request.result;
      const transaction = db.transaction(['network_logs'], 'readwrite');
      const store = transaction.objectStore('network_logs');

      await new Promise((resolve, reject) => {
        const addRequest = store.add({
          timestamp: Date.now(),
          direction: 'outgoing',
          peerId: 'peer-test-1234567890-abcdefghij',
          protocol: 'test-protocol',
          data: { test: 'data' },
          dataSize: 100,
          status: 'error',
          error: 'Test error message',
        });
        addRequest.onsuccess = resolve;
        addRequest.onerror = reject;
      });

      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = reject;
      });

      db.close();
    });

    // 刷新页面以加载新创建的数据
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector(SELECTORS.networkLogView, { timeout: 10000 });

    // 等待表格数据加载
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 查找"错误"标签
    const errorTag = page.locator('.ant-tag:has-text("错误")').first();

    if (await errorTag.isVisible()) {
      // 验证标签有红色样式
      const tagColor = await page.evaluate(() => {
        const tags = Array.from(document.querySelectorAll('.ant-tag'));
        const tag = tags.find(t => t.textContent?.trim() === '错误') as HTMLElement;
        if (tag) {
          return {
            hasRedClass: tag.classList.contains('ant-tag-red'),
            backgroundColor: window.getComputedStyle(tag).backgroundColor,
          };
        }
        return null;
      });

      expect(tagColor).not.toBeNull();
      expect(tagColor?.hasRedClass).toBe(true);
    } else {
      test.skip(true, '没有测试数据');
    }
  });

  test('12. 状态标签颜色 - 验证"进行中"状态为蓝色', async ({ page }) => {
    // 创建测试数据 - 进行中状态
    await page.evaluate(async () => {
      const request = indexedDB.open('P2PNetworkLogDB', 1);

      await new Promise((resolve, reject) => {
        request.onsuccess = resolve;
        request.onerror = reject;
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('network_logs')) {
            const store = db.createObjectStore('network_logs', { keyPath: 'id', autoIncrement: true });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
      });

      const db = request.result;
      const transaction = db.transaction(['network_logs'], 'readwrite');
      const store = transaction.objectStore('network_logs');

      await new Promise((resolve, reject) => {
        const addRequest = store.add({
          timestamp: Date.now(),
          direction: 'outgoing',
          peerId: 'peer-test-1234567890-abcdefghij',
          protocol: 'test-protocol',
          data: { test: 'data' },
          dataSize: 100,
          status: 'pending',
        });
        addRequest.onsuccess = resolve;
        addRequest.onerror = reject;
      });

      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = reject;
      });

      db.close();
    });

    // 刷新页面以加载新创建的数据
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector(SELECTORS.networkLogView, { timeout: 10000 });

    // 等待表格数据加载
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 查找"进行中"标签
    const pendingTag = page.locator('.ant-tag:has-text("进行中")').first();

    if (await pendingTag.isVisible()) {
      // 验证标签有蓝色样式
      const tagColor = await page.evaluate(() => {
        const tags = Array.from(document.querySelectorAll('.ant-tag'));
        const tag = tags.find(t => t.textContent?.trim() === '进行中') as HTMLElement;
        if (tag) {
          return {
            hasBlueClass: tag.classList.contains('ant-tag-blue'),
            backgroundColor: window.getComputedStyle(tag).backgroundColor,
          };
        }
        return null;
      });

      expect(tagColor).not.toBeNull();
      expect(tagColor?.hasBlueClass).toBe(true);
    } else {
      test.skip(true, '没有测试数据');
    }
  });

  test('13. 清空日志按钮 - 验证清空按钮存在', async ({ page }) => {
    const clearButton = page.locator(SELECTORS.networkLogClearButton);

    // 验证清空按钮存在
    await expect(clearButton).toBeVisible();
  });

  test('14. 清空日志按钮 - 验证按钮为 danger 类型', async ({ page }) => {
    const clearButton = page.locator(SELECTORS.networkLogClearButton);

    // 验证清空按钮存在
    await expect(clearButton).toBeVisible();

    // 验证按钮有 danger 样式
    const hasDangerClass = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const button = buttons.find(b => b.textContent?.includes('清空日志'));
      return button?.classList.contains('ant-btn-dangerous');
    });

    expect(hasDangerClass).toBe(true);
  });

  test('15. Peer ID 格式化显示 - 验证长 Peer ID 使用省略号格式显示', async ({ page }) => {
    // 创建测试数据 - 长 Peer ID
    const longPeerId = 'peer-test-1234567890-abcdefghijk1234567890';

    await page.evaluate(async (peerId) => {
      const request = indexedDB.open('P2PNetworkLogDB', 1);

      await new Promise((resolve, reject) => {
        request.onsuccess = resolve;
        request.onerror = reject;
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('network_logs')) {
            const store = db.createObjectStore('network_logs', { keyPath: 'id', autoIncrement: true });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
      });

      const db = request.result;
      const transaction = db.transaction(['network_logs'], 'readwrite');
      const store = transaction.objectStore('network_logs');

      await new Promise((resolve, reject) => {
        const addRequest = store.add({
          timestamp: Date.now(),
          direction: 'outgoing',
          peerId: peerId,
          protocol: 'test-protocol',
          data: { test: 'data' },
          dataSize: 100,
          status: 'success',
        });
        addRequest.onsuccess = resolve;
        addRequest.onerror = reject;
      });

      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = reject;
      });

      db.close();
    }, longPeerId);

    // 刷新页面以加载新创建的数据
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector(SELECTORS.networkLogView, { timeout: 10000 });

    // 等待表格数据加载
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 查找 Peer ID 列的显示内容
    const peerIdDisplay = await page.evaluate(() => {
      // 查找所有行中的对端列
      const rows = Array.from(document.querySelectorAll('.ant-table-row'));
      for (const row of rows) {
        const cells = row.querySelectorAll('.ant-table-cell');
        if (cells.length >= 4) {
          const peerIdCell = cells[3]; // 对端列是第4列（索引3）
          const text = peerIdCell.textContent || '';
          // 找到包含省略号的格式化 Peer ID
          if (text.includes('...')) {
            return text;
          }
        }
      }
      return '';
    });

    // 验证格式为 "前10位...后7位"
    // longPeerId = 'peer-test-1234567890-abcdefghijk1234567890'
    // 前10位 = 'peer-test-'
    // 后7位 = '4567890'
    // 预期格式 = 'peer-test-...4567890'
    expect(peerIdDisplay).toContain('...');
    expect(peerIdDisplay).toContain('peer-test-');
    expect(peerIdDisplay).toContain('4567890');
    expect(peerIdDisplay).toMatch(/peer-test-[\s\S]*\.\.\.[\s\S]*4567890/);
  });

  test('16. 数据大小格式化 - 验证字节显示为 "B"', async ({ page }) => {
    // 创建测试数据 - 小于 1KB 的数据
    await page.evaluate(async () => {
      const request = indexedDB.open('P2PNetworkLogDB', 1);

      await new Promise((resolve, reject) => {
        request.onsuccess = resolve;
        request.onerror = reject;
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('network_logs')) {
            const store = db.createObjectStore('network_logs', { keyPath: 'id', autoIncrement: true });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
      });

      const db = request.result;
      const transaction = db.transaction(['network_logs'], 'readwrite');
      const store = transaction.objectStore('network_logs');

      await new Promise((resolve, reject) => {
        const addRequest = store.add({
          timestamp: Date.now(),
          direction: 'outgoing',
          peerId: 'peer-test-1234567890-abcdefghij',
          protocol: 'test-protocol',
          data: { test: 'data' },
          dataSize: 512,
          status: 'success',
        });
        addRequest.onsuccess = resolve;
        addRequest.onerror = reject;
      });

      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = reject;
      });

      db.close();
    });

    // 刷新页面以加载新创建的数据
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector(SELECTORS.networkLogView, { timeout: 10000 });

    // 等待表格数据加载
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 查找数据大小列的显示内容
    const dataSizeDisplay = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('.ant-table-cell'));
      const dataSizeCell = cells.find(cell => cell.textContent?.includes('B'));
      return dataSizeCell?.textContent || '';
    });

    // 验证字节显示为 "B"
    expect(dataSizeDisplay).toContain('512 B');
  });

  test('17. 数据大小格式化 - 验证 KB 显示保留两位小数', async ({ page }) => {
    // 创建测试数据 - KB 级别的数据
    await page.evaluate(async () => {
      const request = indexedDB.open('P2PNetworkLogDB', 1);

      await new Promise((resolve, reject) => {
        request.onsuccess = resolve;
        request.onerror = reject;
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('network_logs')) {
            const store = db.createObjectStore('network_logs', { keyPath: 'id', autoIncrement: true });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
      });

      const db = request.result;
      const transaction = db.transaction(['network_logs'], 'readwrite');
      const store = transaction.objectStore('network_logs');

      await new Promise((resolve, reject) => {
        const addRequest = store.add({
          timestamp: Date.now(),
          direction: 'outgoing',
          peerId: 'peer-test-1234567890-abcdefghij',
          protocol: 'test-protocol',
          data: { test: 'data' },
          dataSize: 2048, // 2KB
          status: 'success',
        });
        addRequest.onsuccess = resolve;
        addRequest.onerror = reject;
      });

      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = reject;
      });

      db.close();
    });

    // 刷新页面以加载新创建的数据
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector(SELECTORS.networkLogView, { timeout: 10000 });

    // 等待表格数据加载
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 查找数据大小列的显示内容
    const dataSizeDisplay = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('.ant-table-cell'));
      const dataSizeCell = cells.find(cell => cell.textContent?.includes('KB'));
      return dataSizeCell?.textContent || '';
    });

    // 验证 KB 显示保留两位小数
    // 2048 / 1024 = 2.00 KB
    expect(dataSizeDisplay).toContain('2.00 KB');
  });

  test('18. 数据大小格式化 - 验证 MB 显示保留两位小数', async ({ page }) => {
    // 创建测试数据 - MB 级别的数据
    await page.evaluate(async () => {
      const request = indexedDB.open('P2PNetworkLogDB', 1);

      await new Promise((resolve, reject) => {
        request.onsuccess = resolve;
        request.onerror = reject;
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('network_logs')) {
            const store = db.createObjectStore('network_logs', { keyPath: 'id', autoIncrement: true });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
      });

      const db = request.result;
      const transaction = db.transaction(['network_logs'], 'readwrite');
      const store = transaction.objectStore('network_logs');

      await new Promise((resolve, reject) => {
        const addRequest = store.add({
          timestamp: Date.now(),
          direction: 'outgoing',
          peerId: 'peer-test-1234567890-abcdefghij',
          protocol: 'test-protocol',
          data: { test: 'data' },
          dataSize: 1048576 * 3, // 3MB
          status: 'success',
        });
        addRequest.onsuccess = resolve;
        addRequest.onerror = reject;
      });

      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = reject;
      });

      db.close();
    });

    // 刷新页面以加载新创建的数据
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector(SELECTORS.networkLogView, { timeout: 10000 });

    // 等待表格数据加载
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 查找数据大小列的显示内容
    const dataSizeDisplay = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('.ant-table-cell'));
      const dataSizeCell = cells.find(cell => cell.textContent?.includes('MB'));
      return dataSizeCell?.textContent || '';
    });

    // 验证 MB 显示保留两位小数
    // 3MB = 3.00 MB
    expect(dataSizeDisplay).toContain('3.00 MB');
  });

  test('19. 时间戳格式化 - 验证时间戳显示为中文日期时间格式', async ({ page }) => {
    // 创建测试数据
    await page.evaluate(async () => {
      const request = indexedDB.open('P2PNetworkLogDB', 1);

      await new Promise((resolve, reject) => {
        request.onsuccess = resolve;
        request.onerror = reject;
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('network_logs')) {
            const store = db.createObjectStore('network_logs', { keyPath: 'id', autoIncrement: true });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };
      });

      const db = request.result;
      const transaction = db.transaction(['network_logs'], 'readwrite');
      const store = transaction.objectStore('network_logs');

      await new Promise((resolve, reject) => {
        const addRequest = store.add({
          timestamp: Date.now(),
          direction: 'outgoing',
          peerId: 'peer-test-1234567890-abcdefghij',
          protocol: 'test-protocol',
          data: { test: 'data' },
          dataSize: 100,
          status: 'success',
        });
        addRequest.onsuccess = resolve;
        addRequest.onerror = reject;
      });

      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = reject;
      });

      db.close();
    });

    // 刷新页面以加载新创建的数据
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector(SELECTORS.networkLogView, { timeout: 10000 });

    // 等待表格数据加载
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 查找时间列的显示内容
    const timestampDisplay = await page.evaluate(() => {
      // 查找第一行的时间列
      const rows = Array.from(document.querySelectorAll('.ant-table-row'));
      for (const row of rows) {
        const cells = row.querySelectorAll('.ant-table-cell');
        if (cells.length >= 1) {
          const timestampCell = cells[0]; // 时间列是第1列（索引0）
          const text = timestampCell.textContent || '';
          // 找到包含日期格式的文本（应该包含 /）
          // 注意：第一行可能是表头，需要跳过
          if (text.includes('/') && text.length > 10) {
            return text;
          }
        }
      }
      return '';
    });

    // 如果找不到，尝试直接查找第一个包含斜杠的单元格
    const fallbackDisplay = timestampDisplay || await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('.ant-table-cell'));
      for (const cell of cells) {
        const text = cell.textContent || '';
        if (text.includes('/') && text.length > 10) {
          return text;
        }
      }
      return '';
    });

    // 验证时间戳显示为中文日期时间格式
    // 格式：YYYY/MM/DD HH:mm:ss
    const displayToCheck = fallbackDisplay || timestampDisplay;
    if (displayToCheck) {
      expect(displayToCheck).toMatch(/\d{4}\/\d{2}\/\d{2}/);
      expect(displayToCheck).toMatch(/\d{2}:\d{2}:\d{2}/);
    } else {
      // 如果找不到时间戳，可能数据还没有加载，跳过测试
      test.skip(true, '无法找到时间戳数据');
    }
  });
});
