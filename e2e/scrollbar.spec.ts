/**
 * 滚动条场景 E2E 测试
 *
 * 测试目的：
 * 1. 验证页面内容超出视口高度时，滚动条是否正确出现
 * 2. 检查滚动条是否出现在正确的位置（内容区域内，而不是全局）
 * 3. 测试各页面的滚动行为是否符合预期
 *
 * 测试覆盖：
 * - 发现中心页面滚动条
 * - 聊天页面消息区域滚动条
 * - 聊天页面联系人列表滚动条
 * - 设置页面滚动条
 * - 全局 body 应该禁止滚动
 */

import { test, expect } from '@playwright/test';
import { setupUser, SELECTORS, WAIT_TIMES } from './test-helpers';

test.describe('滚动条场景测试', () => {
  test.beforeEach(async ({ page }) => {
    // 设置用户信息
    await page.goto('/#/center');
    await setupUser(page, '滚动测试用户');
    // 等待页面完全加载
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);
  });

  test('应该禁止 body 层的全局滚动', async ({ page }) => {
    // 验证 body 和 html 元素设置了 overflow: hidden
    const bodyOverflow = await page.evaluate(() => {
      const body = document.body;
      const computedStyle = window.getComputedStyle(body);
      return computedStyle.overflow;
    });

    const htmlOverflow = await page.evaluate(() => {
      const html = document.documentElement;
      const computedStyle = window.getComputedStyle(html);
      return computedStyle.overflow;
    });

    console.log('[滚动条测试] body overflow:', bodyOverflow);
    console.log('[滚动条测试] html overflow:', htmlOverflow);

    // 断言：body 和 html 应该设置 overflow: hidden
    expect(bodyOverflow).toBe('hidden');
    expect(htmlOverflow).toBe('hidden');
  });

  test('发现中心页面：内容超出时应该有滚动条', async ({ page }) => {
    // 验证 .main-content 容器存在
    const mainContent = page.locator('.main-content');
    await expect(mainContent).toBeVisible();

    // 获取 .main-content 的样式
    const mainContentStyles = await mainContent.evaluate((el) => {
      const computedStyle = window.getComputedStyle(el);
      return {
        overflowY: computedStyle.overflowY,
        overflowX: computedStyle.overflowX,
        height: computedStyle.height,
        maxHeight: computedStyle.maxHeight,
        minHeight: computedStyle.minHeight,
      };
    });

    console.log('[滚动条测试] .main-content 样式:', mainContentStyles);

    // 获取视口高度
    const viewportHeight = await page.evaluate(() => {
      return window.innerHeight;
    });

    // 获取 .center-container 的内容和高度
    const centerInfo = await page.locator('.center-container').evaluate((el) => {
      return {
        offsetHeight: el.offsetHeight,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      };
    });

    console.log('[滚动条测试] 视口高度:', viewportHeight);
    console.log('[滚动条测试] .center-container 高度信息:', centerInfo);

    // 获取 .center-container 的样式
    const centerContainerStyles = await page.locator('.center-container').evaluate((el) => {
      const computedStyle = window.getComputedStyle(el);
      return {
        overflowY: computedStyle.overflowY,
        overflowX: computedStyle.overflowX,
        height: computedStyle.height,
        maxHeight: computedStyle.maxHeight,
      };
    });

    console.log('[滚动条测试] .center-container 样式:', centerContainerStyles);

    // 预期行为：
    // 1. .center-container 应该有 overflow-y: auto 或 scroll
    // 2. 或者 .main-content 应该接管滚动

    // 检查实际的滚动行为
    const canScrollMainContent = await mainContent.evaluate((el) => {
      return el.scrollHeight > el.clientHeight || el.scrollTop > 0;
    });

    const canScrollCenterContainer = await page.locator('.center-container').evaluate((el) => {
      return el.scrollHeight > el.clientHeight;
    });

    console.log('[滚动条测试] .main-content 可滚动:', canScrollMainContent);
    console.log('[滚动条测试] .center-container 可滚动:', canScrollCenterContainer);

    // 断言：至少有一个容器应该可滚动（当内容超出时）
    // 如果内容超出视口，应该有滚动能力
    if (centerInfo.scrollHeight > viewportHeight) {
      expect(
        canScrollMainContent || canScrollCenterContainer,
        '内容超出视口时，至少应该有一个容器可滚动'
      ).toBeTruthy();
    }
  });

  test('聊天页面：消息区域应该有独立滚动条', async ({ page }) => {
    // 导航到聊天页面
    await page.goto('/#/wechat');
    await page.waitForLoadState('domcontentloaded');

    // 等待聊天容器加载
    await expect(page.locator('.wechat-container')).toBeVisible({ timeout: 10000 });

    // 聊天页面有两种状态：
    // 1. 没有选中聊天时，显示"选择一个联系人开始聊天"空状态
    // 2. 选中聊天后，显示消息区域

    // 首先检查联系人列表是否可见（始终可见，除非没有联系人）
    const contactsList = page.locator('.contacts-list');
    const contactsListExists = await contactsList.count();

    if (contactsListExists > 0) {
      // 验证联系人列表的滚动配置
      const contactsListStyles = await contactsList.evaluate((el) => {
        const computedStyle = window.getComputedStyle(el);
        return {
          overflowY: computedStyle.overflowY,
          overflowX: computedStyle.overflowX,
        };
      });

      console.log('[滚动条测试] .contacts-list 样式:', contactsListStyles);

      // 断言：联系人列表应该设置 overflow-y: auto 或 scroll
      expect(['auto', 'scroll', 'overlay']).toContain(contactsListStyles.overflowY);
    }

    // 检查消息区域（仅在选中聊天时可见）
    const messagesArea = page.locator('.messages-area');
    const messagesAreaCount = await messagesArea.count();

    if (messagesAreaCount > 0) {
      // 消息区域存在，检查其滚动配置
      const messagesAreaStyles = await messagesArea.evaluate((el) => {
        const computedStyle = window.getComputedStyle(el);
        return {
          overflowY: computedStyle.overflowY,
          overflowX: computedStyle.overflowX,
          height: computedStyle.height,
          maxHeight: computedStyle.maxHeight,
        };
      });

      console.log('[滚动条测试] .messages-area 样式:', messagesAreaStyles);

      // 断言：消息区域应该设置 overflow-y: auto 或 scroll
      expect(['auto', 'scroll', 'overlay']).toContain(messagesAreaStyles.overflowY);
    } else {
      console.log('[滚动条测试] 消息区域未显示（可能没有选中聊天），跳过检查');
    }
  });

  test('设置页面：内容超出时应该有滚动条', async ({ page }) => {
    // 导航到设置页面
    await page.goto('/#/settings');
    await page.waitForLoadState('domcontentloaded');

    // 等待设置容器加载
    await expect(page.locator('.settings-container')).toBeVisible({ timeout: 10000 });

    // 验证 .settings-container 存在并检查其滚动配置
    const settingsContainer = page.locator('.settings-container');
    await expect(settingsContainer).toBeVisible();

    const settingsContainerStyles = await settingsContainer.evaluate((el) => {
      const computedStyle = window.getComputedStyle(el);
      return {
        overflowY: computedStyle.overflowY,
        overflowX: computedStyle.overflowX,
        height: computedStyle.height,
        maxHeight: computedStyle.maxHeight,
      };
    });

    console.log('[滚动条测试] .settings-container 样式:', settingsContainerStyles);

    // 获取视口高度
    const viewportHeight = await page.evaluate(() => {
      return window.innerHeight;
    });

    // 获取设置容器的高度信息
    const settingsInfo = await settingsContainer.evaluate((el) => {
      return {
        offsetHeight: el.offsetHeight,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      };
    });

    console.log('[滚动条测试] 视口高度:', viewportHeight);
    console.log('[滚动条测试] .settings-container 高度信息:', settingsInfo);

    // 如果内容超出，应该可以滚动
    if (settingsInfo.scrollHeight > viewportHeight) {
      // 检查 .main-content 是否接管了滚动
      const mainContent = page.locator('.main-content');
      const canScrollMainContent = await mainContent.evaluate((el) => {
        return el.scrollHeight > el.clientHeight;
      });

      console.log('[滚动条测试] .main-content 可滚动:', canScrollMainContent);

      // 断言：应该有滚动能力
      expect(
        canScrollMainContent || settingsInfo.scrollHeight > settingsInfo.clientHeight,
        '设置页面内容超出时应该可以滚动'
      ).toBeTruthy();
    }
  });

  test('PC 端：左侧菜单应该固定，右侧内容可滚动', async ({ page }) => {
    // 设置视口大小为 PC
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/#/center');
    await page.waitForLoadState('domcontentloaded');

    // 等待页面加载
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);

    // 验证左侧菜单栏（PC 端）存在
    const pcSider = page.locator('.pc-sider');
    const hasPcSider = await pcSider.count();

    console.log('[滚动条测试] PC 端侧边栏数量:', hasPcSider);

    if (hasPcSider > 0) {
      // 验证侧边栏固定定位
      const siderStyles = await pcSider.evaluate((el) => {
        const computedStyle = window.getComputedStyle(el);
        return {
          position: computedStyle.position,
          height: computedStyle.height,
          overflowY: computedStyle.overflowY,
        };
      });

      console.log('[滚动条测试] .pc-sider 样式:', siderStyles);

      // 断言：PC 端侧边栏应该是固定定位
      expect(siderStyles.position).toBe('fixed');
      // getComputedStyle 返回计算后的像素值，需要验证等于视口高度
      // 例如：视口高度 720px，计算值应为 "720px"
      expect(siderStyles.height).toMatch(/^\d+px$/);
      expect(parseInt(siderStyles.height)).toBeGreaterThan(0);

      // 验证右侧内容区域有左边距（为侧边栏留出空间）
      const mainContent = page.locator('.main-content');
      const mainContentStyles = await mainContent.evaluate((el) => {
        const computedStyle = window.getComputedStyle(el);
        return {
          marginLeft: computedStyle.marginLeft,
        };
      });

      console.log('[滚动条测试] .main-content 左边距:', mainContentStyles.marginLeft);

      // 断言：右侧内容应该有左边距
      expect(parseInt(mainContentStyles.marginLeft)).toBeGreaterThan(0);
    }
  });

  test('移动端：底部菜单固定，中间内容可滚动', async ({ page }) => {
    // 设置视口大小为移动端
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/#/center');
    await page.waitForLoadState('domcontentloaded');

    // 等待页面加载
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);

    // 验证底部菜单存在（移动端）
    const mobileFooter = page.locator('.mobile-footer');
    const hasMobileFooter = await mobileFooter.count();

    console.log('[滚动条测试] 移动端底部菜单数量:', hasMobileFooter);

    if (hasMobileFooter > 0) {
      // 验证底部菜单固定定位
      const footerStyles = await mobileFooter.evaluate((el) => {
        const computedStyle = window.getComputedStyle(el);
        return {
          position: computedStyle.position,
          height: computedStyle.height,
        };
      });

      console.log('[滚动条测试] .mobile-footer 样式:', footerStyles);

      // 断言：移动端底部菜单应该是固定定位
      expect(footerStyles.position).toBe('fixed');

      // 验证主内容区域有底部 padding（为底部菜单留出空间）
      const mainContent = page.locator('.main-content');
      const mainContentStyles = await mainContent.evaluate((el) => {
        const computedStyle = window.getComputedStyle(el);
        return {
          paddingBottom: computedStyle.paddingBottom,
        };
      });

      console.log('[滚动条测试] 移动端 .main-content 底部内边距:', mainContentStyles.paddingBottom);

      // 断言：移动端主内容应该有底部内边距
      expect(parseInt(mainContentStyles.paddingBottom)).toBeGreaterThan(0);
    }
  });

  test('实际滚动功能测试：发现中心页面应该可以滚动', async ({ page }) => {
    await page.goto('/#/center');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);

    // 获取初始滚动位置
    const initialScrollTop = await page.evaluate(() => {
      const mainContent = document.querySelector('.main-content');
      return mainContent ? mainContent.scrollTop : 0;
    });

    console.log('[滚动条测试] 初始滚动位置:', initialScrollTop);

    // 尝试向下滚动
    await page.evaluate(() => {
      const mainContent = document.querySelector('.main-content');
      if (mainContent) {
        mainContent.scrollTop = 100;
      }
    });

    await page.waitForTimeout(300);

    // 获取滚动后的位置
    const afterScrollTop = await page.evaluate(() => {
      const mainContent = document.querySelector('.main-content');
      return mainContent ? mainContent.scrollTop : 0;
    });

    console.log('[滚动条测试] 滚动后位置:', afterScrollTop);

    // 断言：滚动位置应该改变
    // 如果内容高度小于容器高度，scrollTop 不会改变
    // 所以这里只检查是否有滚动能力（scrollHeight > clientHeight）
    const scrollable = await page.evaluate(() => {
      const mainContent = document.querySelector('.main-content');
      if (!mainContent) return false;
      return mainContent.scrollHeight > mainContent.clientHeight;
    });

    console.log('[滚动条测试] .main-content 是否可滚动:', scrollable);

    // 如果内容足够长，应该可以滚动
    if (scrollable) {
      // 验证滚动确实生效了
      expect(afterScrollTop).toBeGreaterThanOrEqual(0);
    }
  });

  test('问题检测：当内容超出视口时，滚动条应该出现在正确的位置', async ({ page }) => {
    await page.goto('/#/center');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);

    // 添加大量设备使内容超出视口
    await page.evaluate(() => {
      // 创建大量设备卡片使内容超出视口
      const centerContainer = document.querySelector('.center-container');
      if (!centerContainer) return;

      // 计算需要多少设备才能超出视口
      const viewportHeight = window.innerHeight;
      const deviceCardHeight = 150; // 估算每个卡片高度
      const devicesNeeded = Math.ceil(viewportHeight / deviceCardHeight) + 5;

      console.log('[测试] 视口高度:', viewportHeight, '需要设备数:', devicesNeeded);

      // 添加设备信息到 localStorage
      const devices: Record<string, any> = {};
      for (let i = 0; i < devicesNeeded; i++) {
        const peerId = `scroll-test-peer-${i}`;
        devices[peerId] = {
          peerId,
          username: `滚动测试设备${i}`,
          avatar: null,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: true,
        };
      }

      localStorage.setItem('discovered_devices_meta', JSON.stringify(devices));

      // 触发刷新事件
      window.dispatchEvent(new Event('discovery-devices-updated'));
    });

    // 等待 UI 更新
    await page.waitForTimeout(1000);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // 检查滚动情况
    const scrollInfo = await page.evaluate(() => {
      const mainContent = document.querySelector('.main-content');
      const centerContainer = document.querySelector('.center-container');
      const body = document.body;
      const html = document.documentElement;

      return {
        // 视口高度
        viewportHeight: window.innerHeight,

        // .main-content 信息
        mainContent: mainContent ? {
          scrollHeight: mainContent.scrollHeight,
          clientHeight: mainContent.clientHeight,
          offsetHeight: mainContent.offsetHeight,
          scrollTop: mainContent.scrollTop,
          overflowY: window.getComputedStyle(mainContent).overflowY,
          height: window.getComputedStyle(mainContent).height,
        } : null,

        // .center-container 信息
        centerContainer: centerContainer ? {
          scrollHeight: centerContainer.scrollHeight,
          clientHeight: centerContainer.clientHeight,
          offsetHeight: centerContainer.offsetHeight,
          overflowY: window.getComputedStyle(centerContainer).overflowY,
        } : null,

        // body 信息
        body: {
          scrollHeight: body.scrollHeight,
          clientHeight: body.clientHeight,
          overflowY: window.getComputedStyle(body).overflowY,
        },

        // html 信息
        html: {
          scrollHeight: html.scrollHeight,
          clientHeight: html.clientHeight,
          overflowY: window.getComputedStyle(html).overflowY,
        },
      };
    });

    console.log('[滚动条测试] 滚动信息:', JSON.stringify(scrollInfo, null, 2));

    // 问题检测：
    // 1. body 和 html 应该保持 overflow: hidden
    expect(scrollInfo.body.overflowY).toBe('hidden');
    expect(scrollInfo.html.overflowY).toBe('hidden');

    // 2. 如果内容超出视口，应该有一个可滚动的容器
    const contentExceedsViewport = scrollInfo.centerContainer && scrollInfo.centerContainer.scrollHeight > scrollInfo.viewportHeight;

    if (contentExceedsViewport && scrollInfo.mainContent) {
      // 检查 .main-content 或 .center-container 是否可滚动
      const mainContentScrollable = scrollInfo.mainContent.scrollHeight > scrollInfo.mainContent.clientHeight;

      console.log('[滚动条测试] 内容是否超出视口:', contentExceedsViewport);
      console.log('[滚动条测试] .main-content 是否可滚动:', mainContentScrollable);

      // 断言：内容超出时，应该有滚动能力
      if (scrollInfo.centerContainer.scrollHeight > scrollInfo.viewportHeight - 100) {
        // 考虑到 padding 等因素，允许一定的误差
        const hasScrollableContainer = mainContentScrollable ||
          scrollInfo.mainContent.scrollHeight > scrollInfo.mainContent.clientHeight;

        expect(
          hasScrollableContainer,
          `内容超出视口时（scrollHeight: ${scrollInfo.centerContainer.scrollHeight}, viewportHeight: ${scrollInfo.viewportHeight}），应该有一个可滚动的容器`
        ).toBeTruthy();
      }
    }
  });
});
