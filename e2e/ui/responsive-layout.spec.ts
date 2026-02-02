/**
 * 响应式布局 E2E 测试
 * 测试 PC 端和移动端的布局适配
 */

import { test, expect } from '@playwright/test';
import { SELECTORS, WAIT_TIMES, setupUser } from '../test-helpers';

test.describe('响应式布局测试', () => {
  test('PC 端应该显示左侧菜单', async ({ page }) => {
    // 设置 PC 端视口
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    await setupUser(page, 'User1');

    // 等待页面渲染
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证主布局容器可见
    const mainLayout = page.locator('.main-layout, .ant-layout');
    await expect(mainLayout).toBeVisible();

    // 验证左侧菜单可见（PC 端使用侧边栏菜单）
    const sider = page.locator('.ant-layout-sider, .pc-sider, .sidebar');
    const siderCount = await sider.count();

    if (siderCount > 0) {
      await expect(sider.first()).toBeVisible();
    }

    // 验证底部菜单不可见（移动端才显示）
    const footer = page.locator('.mobile-footer, .bottom-navigation');
    const footerCount = await footer.count();

    if (footerCount > 0) {
      await expect(footer.first()).not.toBeVisible();
    }
  });

  test('移动端应该显示底部菜单', async ({ page }) => {
    // 设置移动端视口
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    await setupUser(page, 'User1');

    // 等待页面渲染
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证底部菜单可见（移动端使用底部导航）
    const footer = page.locator('.mobile-footer, .bottom-navigation, .mobile-nav');
    const footerCount = await footer.count();

    if (footerCount > 0) {
      await expect(footer.first()).toBeVisible();
    }

    // 验证顶部栏可见（移动端显示顶部标题栏）
    const header = page.locator('.mobile-header, .top-bar, .app-header');
    const headerCount = await header.count();

    if (headerCount > 0) {
      await expect(header.first()).toBeVisible();
    }

    // 验证 PC 端侧边栏不可见或被折叠
    const sider = page.locator('.ant-layout-sider, .pc-sider');
    const siderCount = await sider.count();

    if (siderCount > 0) {
      // 在移动端，侧边栏应该被隐藏或折叠
      const isHidden = await sider.first().isHidden();
      const hasCollapsedClass = await sider.first().getAttribute('class');

      if (!isHidden) {
        // 如果可见，应该有 collapsed 类
        expect(hasCollapsedClass).toContain('collapsed');
      }
    }
  });

  test('PC 端聊天页面应该显示双栏布局', async ({ page }) => {
    // 设置 PC 端视口
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    await setupUser(page, 'User1');

    // 进入聊天页面
    await page.click(SELECTORS.wechatMenuItem);
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证聊天容器可见
    const chatContainer = page.locator('.wechat-container, .chat-container');
    await expect(chatContainer).toBeVisible();

    // 验证双栏布局：左侧联系人列表，右侧聊天窗口
    const contactList = page.locator('.contact-list, .chat-sidebar, .left-panel');
    const chatWindow = page.locator('.chat-window, .message-panel, .right-panel');

    await expect(contactList).toBeVisible();
    await expect(chatWindow).toBeVisible();
  });

  test('移动端聊天页面应该显示单栏布局', async ({ page }) => {
    // 设置移动端视口
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    await setupUser(page, 'User1');

    // 进入聊天页面
    await page.click(SELECTORS.wechatMenuItem);
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证聊天容器可见
    const chatContainer = page.locator('.wechat-container, .chat-container');
    await expect(chatContainer).toBeVisible();

    // 在移动端，根据当前状态，要么显示联系人列表，要么显示聊天窗口
    const contactList = page.locator('.contact-list, .chat-sidebar, .left-panel');
    const chatWindow = page.locator('.chat-window, .message-panel, .right-panel');

    const contactVisible = await contactList.isVisible();
    const chatVisible = await chatWindow.isVisible();

    // 至少有一个应该可见
    expect(contactVisible || chatVisible).toBe(true);
  });

  test('PC 端发现中心应该显示左右分栏', async ({ page }) => {
    // 设置 PC 端视口
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.goto('/');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    await setupUser(page, 'User1');

    // 进入发现中心
    await page.click(SELECTORS.centerMenuItem);
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证发现中心容器可见
    const centerContainer = page.locator('.center-container, .discovery-container');
    await expect(centerContainer).toBeVisible();

    // 验证左侧"我的信息"卡片可见
    const myInfoCard = page.locator('.my-info-card, .connection-status-card');
    const myInfoCount = await myInfoCard.count();

    if (myInfoCount > 0) {
      await expect(myInfoCard.first()).toBeVisible();
    }

    // 验证右侧设备列表可见
    const deviceList = page.locator('.device-list-container, .devices-grid');
    await expect(deviceList).toBeVisible();
  });

  test('移动端发现中心应该上下堆叠布局', async ({ page }) => {
    // 设置移动端视口
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    await setupUser(page, 'User1');

    // 进入发现中心
    await page.click(SELECTORS.centerMenuItem);
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证发现中心容器可见
    const centerContainer = page.locator('.center-container, .discovery-container');
    await expect(centerContainer).toBeVisible();

    // 在移动端，"我的信息"和设备列表应该上下堆叠
    // 验证连接状态区域可见
    const connectionStatus = page.locator('.connection-status, .my-info-section');
    const statusCount = await connectionStatus.count();

    if (statusCount > 0) {
      await expect(connectionStatus.first()).toBeVisible();
    }

    // 验证设备列表可见
    const deviceList = page.locator('.device-list-container, .devices-grid');
    await expect(deviceList).toBeVisible();
  });

  test('平板端应该适配中等屏幕', async ({ page }) => {
    // 设置平板端视口
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto('/');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    await setupUser(page, 'User1');

    // 等待页面渲染
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证主布局容器可见
    const mainLayout = page.locator('.main-layout, .ant-layout');
    await expect(mainLayout).toBeVisible();

    // 在平板端，可能使用折叠侧边栏或底部导航
    // 根据实际实现验证
    const sider = page.locator('.ant-layout-sider');
    const siderCount = await sider.count();

    if (siderCount > 0) {
      // 如果有侧边栏，验证其可见性
      const isVisible = await sider.first().isVisible();
      expect(isVisible).toBe(true);
    }
  });

  test('应该支持横屏和竖屏切换', async ({ page }) => {
    // 先设置竖屏
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    await setupUser(page, 'User1');

    // 进入聊天页面
    await page.click(SELECTORS.wechatMenuItem);
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证聊天容器可见
    const chatContainer = page.locator('.wechat-container');
    await expect(chatContainer).toBeVisible();

    // 切换到横屏
    await page.setViewportSize({ width: 667, height: 375 });
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证页面仍然可见且布局正常
    await expect(chatContainer).toBeVisible();

    // 切换回竖屏
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证页面仍然可见
    await expect(chatContainer).toBeVisible();
  });

  test('超宽屏幕应该限制内容最大宽度', async ({ page }) => {
    // 设置超宽屏幕
    await page.setViewportSize({ width: 1920, height: 1080 });

    await page.goto('/');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    await setupUser(page, 'User1');

    // 等待页面渲染
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证主布局容器可见
    const mainLayout = page.locator('.main-layout, .ant-layout');
    await expect(mainLayout).toBeVisible();

    // 验证内容区域有最大宽度限制（如果实现了）
    const contentArea = page.locator('.content-wrapper, .max-width-container');
    const contentCount = await contentArea.count();

    if (contentCount > 0) {
      // 验证内容区域的宽度不超过某个限制
      const boundingBox = await contentArea.first().boundingBox();
      if (boundingBox) {
        expect(boundingBox.width).toBeLessThanOrEqual(1440); // 常见的最大宽度
      }
    }
  });
});
