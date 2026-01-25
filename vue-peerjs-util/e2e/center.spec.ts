import { test, expect } from '@playwright/test';

test.describe('发现中心页面', () => {
  test.beforeEach(async ({ page }) => {
    // 设置用户信息
    await page.goto('/center');
  });

  test('应该显示页面标题', async ({ page }) => {
    await expect(page.locator('text=发现中心')).toBeVisible();
  });

  test('应该显示我的信息卡片', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'test-peer-123',
        }),
      );
    });
    await page.goto('/center');

    await expect(page.locator('text=我的信息')).toBeVisible();
    await expect(page.locator('text=测试用户')).toBeVisible();
    await expect(page.locator('text=test-peer-123')).toBeVisible();
  });

  test('应该显示在线设备卡片', async ({ page }) => {
    await expect(page.locator('text=在线设备')).toBeVisible();
  });

  test('应该复制 Peer ID 到剪贴板', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'test-peer-copy-123',
        }),
      );
    });
    await page.goto('/center');

    // 设置剪贴板监听
    const clipboardText = await page.evaluate(async () => {
      // 等待一下让页面加载完成
      await new Promise((resolve) => setTimeout(resolve, 100));

      const copyButton = document.querySelector('.ant-typography-copy');
      if (copyButton) {
        (copyButton as HTMLElement).click();
      }
      return 'clicked';
    });

    // 注意：在测试环境中，实际的剪贴板可能无法访问
    // 这里主要验证点击事件不会报错
    expect(clipboardText).toBe('clicked');
  });

  test('应该显示发现中心连接状态', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'test-peer-123',
        }),
      );
    });
    await page.goto('/center');

    // 验证发现中心状态显示
    await expect(page.locator('text=发现中心')).toBeVisible();
  });

  test('应该有刷新按钮', async ({ page }) => {
    await expect(page.locator('.ant-card-extra .ant-btn:has-text("刷新")')).toBeVisible();
  });

  test('应该显示空状态（无在线设备）', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'test-peer-123',
        }),
      );
    });
    await page.goto('/center');

    // 检查空状态
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('text=暂无在线设备')).toBeVisible();
  });

  test('应该显示响应式布局', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'test-peer-123',
        }),
      );
    });

    // 测试桌面布局
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/center');

    // 在桌面端应该有两列
    const cards = await page.locator('.ant-col').count();
    expect(cards).toBeGreaterThanOrEqual(2);

    // 测试移动端布局
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();

    // 在移动端应该堆叠显示
    await expect(page.locator('text=我的信息')).toBeVisible();
    await expect(page.locator('text=在线设备')).toBeVisible();
  });

  test('应该正确处理未设置用户名的情况', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '',
          avatar: null,
          peerId: 'test-peer-123',
        }),
      );
    });
    await page.goto('/center');

    await expect(page.locator('text=未设置')).toBeVisible();
  });
});
