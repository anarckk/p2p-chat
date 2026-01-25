import { test, expect } from '@playwright/test';

test.describe('WeChat 页面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/wechat');
  });

  test('应该显示用户设置弹窗（首次访问）', async ({ page, context }) => {
    // 清除 localStorage 以模拟首次访问
    await context.clearCookies();
    await page.goto('/wechat');

    await expect(page.locator('.ant-modal').filter({ hasText: '设置用户信息' })).toBeVisible();
    await expect(page.locator('input[placeholder*="用户名"]')).toBeVisible();
  });

  test('应该能够设置用户信息', async ({ page }) => {
    // 等待设置弹窗
    await expect(page.locator('.ant-modal').filter({ hasText: '设置用户信息' })).toBeVisible();

    // 输入用户名
    await page.fill('input[placeholder*="用户名"]', '测试用户');

    // 点击完成
    await page.click('.ant-modal button:has-text("完成")');

    // 等待弹窗关闭
    await expect(page.locator('.ant-modal').filter({ hasText: '设置用户信息' })).not.toBeVisible();

    // 验证用户名显示
    await expect(page.locator('.username')).toHaveText('测试用户');
  });

  test('应该显示两栏布局', async ({ page }) => {
    // 设置用户信息（通过 localStorage）
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: null,
        }),
      );
    });

    await page.goto('/wechat');

    // 检查联系人面板
    await expect(page.locator('.contacts-panel')).toBeVisible();

    // 检查聊天面板
    await expect(page.locator('.chat-panel')).toBeVisible();
  });

  test('应该能够打开设置弹窗', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: null,
        }),
      );
    });

    await page.goto('/wechat');

    // 点击设置按钮
    await page.click('.contacts-header .ant-btn');

    // 验证设置弹窗显示
    await expect(page.locator('.ant-modal').filter({ hasText: '设置用户信息' })).toBeVisible();
  });

  test('应该显示空联系人列表', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: null,
        }),
      );
      localStorage.removeItem('p2p_contacts');
    });

    await page.goto('/wechat');

    // 检查空状态
    await expect(page.locator('.empty-contacts')).toBeVisible();
    await expect(page.locator('text=暂无聊天')).toBeVisible();
  });

  test('应该显示空聊天窗口', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: null,
        }),
      );
    });

    await page.goto('/wechat');

    // 检查空聊天状态
    await expect(page.locator('.no-chat-selected')).toBeVisible();
    await expect(page.locator('text=选择一个联系人开始聊天')).toBeVisible();
  });

  test('应该显示已有的联系人', async ({ page }) => {
    const testContact = {
      peerId: 'test-peer-123',
      username: '测试联系人',
      avatar: null,
      online: true,
      lastSeen: Date.now(),
      unreadCount: 0,
    };

    await page.evaluate((contact) => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: null,
        }),
      );
      localStorage.setItem('p2p_contacts', JSON.stringify({ [contact.peerId]: contact }));
    }, testContact);

    await page.goto('/wechat');

    // 等待联系人加载
    await expect(page.locator('.contact-item')).toBeVisible();

    // 验证联系人信息
    await expect(page.locator('.contact-name')).toHaveText('测试联系人');
    await expect(page.locator('.contact-peer-id')).toContainText('test-peer-123');
  });

  test('应该能够选择联系人', async ({ page }) => {
    const testContact = {
      peerId: 'test-peer-123',
      username: '测试联系人',
      avatar: null,
      online: true,
      lastSeen: Date.now(),
      unreadCount: 0,
    };

    await page.evaluate((contact) => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: null,
        }),
      );
      localStorage.setItem('p2p_contacts', JSON.stringify({ [contact.peerId]: contact }));
    }, testContact);

    await page.goto('/wechat');

    // 点击联系人
    await page.click('.contact-item');

    // 验证聊天窗口显示联系人信息
    await expect(page.locator('.chat-name')).toHaveText('测试联系人');
  });

  test('应该能够发送消息', async ({ page }) => {
    const testContact = {
      peerId: 'test-peer-123',
      username: '测试联系人',
      avatar: null,
      online: true,
      lastSeen: Date.now(),
      unreadCount: 0,
    };

    await page.evaluate((contact) => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'my-peer-456',
        }),
      );
      localStorage.setItem('p2p_contacts', JSON.stringify({ [contact.peerId]: contact }));
    }, testContact);

    await page.goto('/wechat');

    // 选择联系人
    await page.click('.contact-item');

    // 输入消息
    await page.fill('.input-area input', '测试消息');

    // 发送消息
    await page.click('.input-area .ant-btn-primary');

    // 验证消息显示在聊天窗口
    await expect(page.locator('.message-bubble').filter({ hasText: '测试消息' })).toBeVisible();
  });

  test('移动端应该显示返回按钮', async ({ page }) => {
    const testContact = {
      peerId: 'test-peer-123',
      username: '测试联系人',
      avatar: null,
      online: true,
      lastSeen: Date.now(),
      unreadCount: 0,
    };

    await page.evaluate((contact) => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: null,
        }),
      );
      localStorage.setItem('p2p_contacts', JSON.stringify({ [contact.peerId]: contact }));
    }, testContact);

    // 模拟移动端视口
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/wechat');

    // 选择联系人
    await page.click('.contact-item');

    // 验证返回按钮显示
    await expect(page.locator('.back-button')).toBeVisible();
  });

  test('未读消息应该显示徽章', async ({ page }) => {
    const testContact = {
      peerId: 'test-peer-123',
      username: '测试联系人',
      avatar: null,
      online: true,
      lastSeen: Date.now(),
      unreadCount: 3,
    };

    await page.evaluate((contact) => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: null,
        }),
      );
      localStorage.setItem('p2p_contacts', JSON.stringify({ [contact.peerId]: contact }));
    }, testContact);

    await page.goto('/wechat');

    // 验证未读徽章
    await expect(page.locator('.contact-item .ant-badge').first()).toHaveAttribute('title', '3');
  });

  test('应该显示在线状态', async ({ page }) => {
    const testContact = {
      peerId: 'test-peer-123',
      username: '测试联系人',
      avatar: null,
      online: true,
      lastSeen: Date.now(),
      unreadCount: 0,
    };

    await page.evaluate((contact) => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: null,
        }),
      );
      localStorage.setItem('p2p_contacts', JSON.stringify({ [contact.peerId]: contact }));
    }, testContact);

    await page.goto('/wechat');

    // 选择联系人
    await page.click('.contact-item');

    // 验证在线状态
    await expect(page.locator('.chat-status').locator('text=在线')).toBeVisible();
  });
});
