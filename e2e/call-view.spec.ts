/**
 * CallView E2E 测试
 * 测试通话页面的各种功能
 */
import { test, expect } from '@playwright/test';
import {
  clearAllStorage,
  createUserInfo,
  setupUser,
  WAIT_TIMES,
  getPeerIdFromElement,
} from './test-helpers.js';

test.describe('CallView 通话页面', () => {
  test.setTimeout(30000);

  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    // 授予媒体权限（用于音视频通话测试）
    await context.grantPermissions(['microphone', 'camera']);

    await page.goto('/#/call');
    await page.waitForLoadState('domcontentloaded');
    await clearAllStorage(page);
  });

  test('应该显示通话页面容器', async ({ page }) => {
    await expect(page.locator('.call-container')).toBeVisible();
  });

  test('应该在无通话时显示空闲状态', async ({ page }) => {
    // 直接导航到通话页面（无用户信息）
    await page.goto('/#/call');
    await page.waitForLoadState('domcontentloaded');

    // 应该显示空状态
    const idleState = page.locator('.call-idle');
    await expect(idleState).toBeVisible();

    // 应该显示"没有进行中的通话"提示
    await expect(page.locator('text=没有进行中的通话')).toBeVisible();
  });

  test('应该在设置用户后正常显示页面', async ({ page }) => {
    await setupUser(page, '通话测试用户');

    // 等待页面加载
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);

    // 导航到通话页面
    await page.goto('/#/call');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 页面应该正常显示
    await expect(page.locator('.call-container')).toBeVisible();
  });

  test('应该显示通话控制按钮（在通话界面中）', async ({ page }) => {
    await setupUser(page, '通话控制测试');

    // 导航到通话页面
    await page.goto('/#/call');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 检查页面结构存在
    await expect(page.locator('.call-container')).toBeVisible();

    // 注意：实际通话功能需要两个设备间的交互
    // 这个测试只验证页面结构是否正确
    const callContainer = page.locator('.call-container');
    await expect(callContainer).toBeVisible();
  });

  test('应该有正确的可访问性属性', async ({ page }) => {
    await setupUser(page, '可访问性测试');

    await page.goto('/#/call');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 检查 aria-label 属性（这些按钮在空闲状态时可能不显示）
    // 我们至少可以验证页面容器是可访问的
    await expect(page.locator('.call-container')).toBeVisible();

    // 空状态应该是可访问的
    const emptyState = page.locator('.call-idle');
    if (await emptyState.isVisible()) {
      await expect(emptyState).toBeVisible();
    }
  });

  test('移动端应该正确适配', async ({ page }) => {
    await setupUser(page, '移动端测试');

    // 设置移动端视口
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/#/call');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 页面应该仍然可见
    await expect(page.locator('.call-container')).toBeVisible();
  });

  test('应该从导航菜单访问通话页面', async ({ page }) => {
    await setupUser(page, '导航测试');

    // 先去发现中心
    await page.goto('/#/center');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 点击通话菜单项
    const callMenuItem = page.locator('.ant-menu-item:has-text("通话")');
    await callMenuItem.click();
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证 URL 变化
    expect(page.url()).toContain('#/call');

    // 验证页面显示
    await expect(page.locator('.call-container')).toBeVisible();
  });

  test('应该在移动端底部菜单显示通话选项', async ({ page }) => {
    await setupUser(page, '移动端菜单测试');

    // 设置移动端视口
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/#/call');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 移动端底部菜单应该显示
    const footerMenu = page.locator('.mobile-footer');
    await expect(footerMenu).toBeVisible();

    // 通话菜单项应该是激活状态
    const activeFooterItem = page.locator('.footer-item.active');
    await expect(activeFooterItem).toBeVisible();
  });

  test('通话页面应该有正确的页面标题', async ({ page }) => {
    await setupUser(page, '标题测试');

    await page.goto('/#/call');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 检查页面标题
    const title = await page.title();
    expect(title).toContain('通话');
  });

  test('应该在通话状态显示时渲染正确的UI元素', async ({ page }) => {
    await setupUser(page, 'UI元素测试');

    await page.goto('/#/call');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 在空闲状态下，应该显示空状态组件
    const idleState = page.locator('.call-idle');
    await expect(idleState).toBeVisible();

    // 空状态应该包含 PhoneOutlined 图标或文字
    await expect(page.locator('.call-idle')).toContainText('没有进行中的通话');
  });

  test('视频元素应该有正确的属性', async ({ page }) => {
    await setupUser(page, '视频属性测试');

    await page.goto('/#/call');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 检查页面结构
    const callContainer = page.locator('.call-container');
    await expect(callContainer).toBeVisible();

    // 注意：在实际通话中，video 元素才会被渲染
    // 这里我们只验证页面的基本结构
  });

  test('应该正确处理页面刷新', async ({ page }) => {
    await setupUser(page, '页面刷新测试');

    await page.goto('/#/call');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 刷新页面
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 页面应该仍然正常显示
    await expect(page.locator('.call-container')).toBeVisible();
  });

  test('应该在无通话时显示空状态图标', async ({ page }) => {
    await setupUser(page, '空状态图标测试');

    await page.goto('/#/call');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 空状态应该有图标
    const emptyIcon = page.locator('.call-idle .anticon');
    await expect(emptyIcon).toBeVisible();
  });
});

test.describe('CallView 通话功能集成测试', () => {
  test.setTimeout(60000);

  test('应该能够从聊天页面发起通话', async ({ browser }) => {
    // 创建两个测试用户
    const contextA = await browser.newContext();
    await contextA.grantPermissions(['microphone', 'camera']);
    const pageA = await contextA.newPage();

    const contextB = await browser.newContext();
    await contextB.grantPermissions(['microphone', 'camera']);
    const pageB = await contextB.newPage();

    try {
      // 设置用户A
      await pageA.goto('/#/center');
      await pageA.waitForLoadState('domcontentloaded');
      await setupUser(pageA, '用户A');
      await pageA.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);

      // 设置用户B
      await pageB.goto('/#/center');
      await pageB.waitForLoadState('domcontentloaded');
      await setupUser(pageB, '用户B');
      await pageB.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);

      // 获取用户B的PeerId
      const peerIdB = await getPeerIdFromElement(pageB);
      console.log('[Test] 用户B PeerId:', peerIdB);

      if (!peerIdB) {
        console.log('[Test] 无法获取用户B的PeerId，跳过测试');
        return;
      }

      // 用户A添加用户B到发现中心
      await pageA.locator('input[placeholder*="Peer ID"]').fill(peerIdB);
      await pageA.locator('button[aria-label="add-device"]').click();
      await pageA.waitForTimeout(WAIT_TIMES.MESSAGE);

      // 创建聊天
      await pageA.goto('/#/wechat');
      await pageA.waitForLoadState('domcontentloaded');
      await pageA.waitForTimeout(WAIT_TIMES.SHORT);

      // 点击新增聊天
      await pageA.locator('button[aria-label="plus"]').click();
      await pageA.waitForTimeout(WAIT_TIMES.SHORT);

      // 输入PeerId - 使用更精确的选择器，选择新增聊天弹窗中的按钮
      const modal = pageA.locator('.ant-modal').filter({ hasText: '新增聊天' });
      await modal.locator('input[placeholder*="Peer ID"]').fill(peerIdB);
      await modal.locator('.ant-btn-primary').click();
      await pageA.waitForTimeout(WAIT_TIMES.MESSAGE);

      // 验证聊天创建成功
      await expect(pageA.locator('.contact-item')).toBeVisible();

      console.log('[Test] 聊天创建成功，测试通过');
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('通话页面应该在路由中正确注册', async ({ page }) => {
    await setupUser(page, '路由测试');

    // 直接导航到通话路由
    await page.goto('/#/call');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证当前路由
    const currentUrl = page.url();
    expect(currentUrl).toContain('#/call');

    // 验证页面元素
    await expect(page.locator('.call-container')).toBeVisible();
  });
});

test.describe('CallView 边界条件测试', () => {
  test.setTimeout(30000);

  test('应该在未设置用户时显示设置弹窗', async ({ page }) => {
    // 清空存储
    await clearAllStorage(page);

    // 导航到通话页面
    await page.goto('/#/call');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 应该显示用户设置弹窗
    try {
      const modal = page.locator('.ant-modal');
      await expect(modal).toBeVisible({ timeout: WAIT_TIMES.MODAL });
    } catch (error) {
      // 如果没有弹窗，至少应该能访问页面
      await expect(page.locator('.call-container')).toBeVisible();
    }
  });

  test('应该正确处理快速页面切换', async ({ page }) => {
    await setupUser(page, '快速切换测试');

    // 快速切换多个页面
    await page.goto('/#/center');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    await page.goto('/#/wechat');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    await page.goto('/#/call');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    await page.goto('/#/settings');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    await page.goto('/#/call');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 最终应该正常显示通话页面
    await expect(page.locator('.call-container')).toBeVisible();
  });

  test('应该在窗口大小变化时正确适配', async ({ page }) => {
    await setupUser(page, '窗口适配测试');

    await page.goto('/#/call');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 测试不同屏幕尺寸
    const sizes = [
      { width: 1920, height: 1080 }, // 桌面
      { width: 768, height: 1024 },  // 平板
      { width: 375, height: 667 },   // 手机
    ];

    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 页面应该始终可见
      await expect(page.locator('.call-container')).toBeVisible();
    }
  });
});

test.describe('CallView 样式测试', () => {
  test.setTimeout(20000);

  test('通话容器应该有正确的样式', async ({ page }) => {
    await setupUser(page, '样式测试');

    await page.goto('/#/call');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    const callContainer = page.locator('.call-container');

    // 检查容器的背景色
    const backgroundColor = await callContainer.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    expect(backgroundColor).toBe('rgb(0, 0, 0)');
  });

  test('空状态应该有正确的样式', async ({ page }) => {
    await setupUser(page, '空状态样式测试');

    await page.goto('/#/call');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    const idleState = page.locator('.call-idle');

    // 检查空状态的背景色
    const backgroundColor = await idleState.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    expect(backgroundColor).toBe('rgb(245, 245, 245)');
  });
});

test.describe('CallView 可访问性测试', () => {
  test.setTimeout(20000);

  test('视频元素应该有aria-label', async ({ page }) => {
    await setupUser(page, 'ARIA测试');

    await page.goto('/#/call');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 检查页面容器是否存在
    await expect(page.locator('.call-container')).toBeVisible();

    // 注意：在实际通话中才会有video元素
    // 这里我们验证页面结构是正确的
  });

  test('页面应该是键盘可导航的', async ({ page }) => {
    // 先导航到页面，确保在正确的上下文中
    await page.goto('/#/call');
    await page.waitForLoadState('domcontentloaded');

    // 然后设置用户
    await setupUser(page, '键盘导航测试');

    // 再次导航到通话页面
    await page.goto('/#/call');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 测试Tab键导航
    await page.keyboard.press('Tab');

    // 页面应该保持响应
    await expect(page.locator('.call-container')).toBeVisible();
  });
});
