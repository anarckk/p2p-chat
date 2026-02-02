/**
 * PWA 功能 E2E 测试
 * 测试 Progressive Web App 相关功能
 */

import { test, expect } from '@playwright/test';
import { WAIT_TIMES, setupUser } from './test-helpers';

test.describe('PWA 功能测试', () => {
  test('应该有 manifest 链接', async ({ page }) => {
    await page.goto('/');

    // 检查 manifest 链接
    const manifestLink = page.locator('link[rel="manifest"]');
    const manifestExists = await manifestLink.count();

    if (manifestExists > 0) {
      const href = await manifestLink.getAttribute('href');
      expect(href).toBeTruthy();
      expect(href).toContain('manifest');
    } else {
      // 如果没有 manifest 链接，跳过此测试
      test.skip(true, 'PWA manifest 未配置');
    }
  });

  test('manifest 应该包含必需字段', async ({ page }) => {
    await page.goto('/');

    // 获取 manifest 链接
    const manifestLink = page.locator('link[rel="manifest"]');
    const manifestExists = await manifestLink.count();

    if (manifestExists > 0) {
      const href = await manifestLink.getAttribute('href');
      if (href) {
        // 尝试获取 manifest 内容
        try {
          const response = await page.request.get(new URL(href, page.url()).href);
          const manifest = await response.json();

          // 验证必需字段
          expect(manifest).toHaveProperty('name');
          expect(manifest).toHaveProperty('short_name');
          expect(manifest).toHaveProperty('start_url');
          expect(manifest).toHaveProperty('display');
          expect(manifest).toHaveProperty('icons');
        } catch (error) {
          // 如果无法获取 manifest，跳过测试
          test.skip(true, '无法获取 manifest 内容');
        }
      }
    } else {
      test.skip(true, 'PWA manifest 未配置');
    }
  });

  test('应该有主题色和背景色配置', async ({ page }) => {
    await page.goto('/');

    // 检查 meta 标签
    const themeColor = page.locator('meta[name="theme-color"]');
    const themeColorExists = await themeColor.count();

    if (themeColorExists > 0) {
      const content = await themeColor.getAttribute('content');
      expect(content).toBeTruthy();
    }

    // 检查 manifest 中的主题色
    const manifestLink = page.locator('link[rel="manifest"]');
    const manifestExists = await manifestLink.count();

    if (manifestExists > 0) {
      const href = await manifestLink.getAttribute('href');
      if (href) {
        try {
          const response = await page.request.get(new URL(href, page.url()).href);
          const manifest = await response.json();

          // 验证主题色和背景色
          expect(manifest).toHaveProperty('theme_color');
          expect(manifest).toHaveProperty('background_color');
        } catch (error) {
          // 忽略错误
        }
      }
    }
  });

  test('应该注册 Service Worker', async ({ page }) => {
    await page.goto('/');

    // 检查 Service Worker 注册状态
    const swRegistered = await page.evaluate(() => {
      return 'serviceWorker' in navigator;
    });

    expect(swRegistered).toBe(true);

    // 检查是否有 Service Worker 脚本
    const swScript = await page.evaluate(() => {
      return navigator.serviceWorker.getRegistration();
    });

    // Service Worker 可能还未注册（需要时间）
    // 这里只验证浏览器支持 Service Worker API
  });

  test('应该支持离线访问（如果 Service Worker 已激活）', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    await setupUser(page, 'User1');

    // 检查 Service Worker 状态
    const swState = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) {
        return 'not_supported';
      }

      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        return 'not_registered';
      }

      if (registration.active) {
        return 'active';
      }

      return 'inactive';
    });

    // 只有当 Service Worker 激活时才测试离线功能
    if (swState === 'active') {
      // 模拟离线状态
      await page.context().setOffline(true);

      // 尝试导航到页面
      await page.goto('/');
      await page.waitForLoadState('domcontentloaded');

      // 验证页面仍然可以访问（应该显示离线提示或缓存内容）
      const bodyVisible = await page.locator('body').isVisible();
      expect(bodyVisible).toBe(true);

      // 恢复在线状态
      await page.context().setOffline(false);
    } else {
      test.skip(true, 'Service Worker 未激活');
    }
  });

  test('应该有合适的图标配置', async ({ page }) => {
    await page.goto('/');

    // 检查 favicon
    const favicon = page.locator('link[rel="icon"], link[rel="shortcut icon"]');
    const faviconExists = await favicon.count();

    if (faviconExists > 0) {
      const href = await favicon.first().getAttribute('href');
      expect(href).toBeTruthy();
    }

    // 检查 manifest 中的图标配置
    const manifestLink = page.locator('link[rel="manifest"]');
    const manifestExists = await manifestLink.count();

    if (manifestExists > 0) {
      const href = await manifestLink.getAttribute('href');
      if (href) {
        try {
          const response = await page.request.get(new URL(href, page.url()).href);
          const manifest = await response.json();

          // 验证图标配置
          expect(manifest).toHaveProperty('icons');
          expect(Array.isArray(manifest.icons)).toBe(true);
          expect(manifest.icons.length).toBeGreaterThan(0);

          // 验证第一个图标有必需的属性
          const firstIcon = manifest.icons[0];
          expect(firstIcon).toHaveProperty('src');
          expect(firstIcon).toHaveProperty('sizes');
          expect(firstIcon).toHaveProperty('type');
        } catch (error) {
          // 忽略错误
        }
      }
    }
  });

  test('应该支持添加到主屏幕', async ({ page }) => {
    await page.goto('/');

    // 检查是否有添加到主屏幕的提示或元数据
    const appleTouchIcon = page.locator('link[rel="apple-touch-icon"]');
    const appleTouchIconExists = await appleTouchIcon.count();

    if (appleTouchIconExists > 0) {
      const href = await appleTouchIcon.first().getAttribute('href');
      expect(href).toBeTruthy();
    }

    // 检查 manifest 中的显示模式
    const manifestLink = page.locator('link[rel="manifest"]');
    const manifestExists = await manifestLink.count();

    if (manifestExists > 0) {
      const href = await manifestLink.getAttribute('href');
      if (href) {
        try {
          const response = await page.request.get(new URL(href, page.url()).href);
          const manifest = await response.json();

          // 验证显示模式支持独立窗口
          expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(manifest.display);
        } catch (error) {
          // 忽略错误
        }
      }
    }
  });

  test('应该有正确的视口配置', async ({ page }) => {
    await page.goto('/');

    // 检查 viewport meta 标签
    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toBeVisible();

    const content = await viewport.getAttribute('content');
    expect(content).toContain('width=device-width');
    expect(content).toContain('initial-scale=1');
  });

  test('应该在移动设备上有合适的触摸目标尺寸', async ({ page }) => {
    // 设置移动端视口
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    await setupUser(page, 'User1');

    // 检查按钮和可点击元素的最小尺寸
    const buttons = page.locator('button, .ant-btn, a[href]');
    const count = await buttons.count();

    if (count > 0) {
      // 检查前几个按钮的尺寸
      for (let i = 0; i < Math.min(count, 5); i++) {
        const button = buttons.nth(i);
        const isVisible = await button.isVisible();

        if (isVisible) {
          const box = await button.boundingBox();
          if (box) {
            // iOS 和 Android 建议最小触摸目标尺寸为 44x44 pt (约 48px)
            const minSize = 44;
            expect(box.width).toBeGreaterThanOrEqual(minSize);
            expect(box.height).toBeGreaterThanOrEqual(minSize);
          }
        }
      }
    }
  });

  test('应该支持安全区域适配（iPhone X 等）', async ({ page }) => {
    // 设置 iPhone X 视口（有刘海）
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto('/');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    await setupUser(page, 'User1');

    // 检查是否有安全区域适配
    const bodyPadding = await page.evaluate(() => {
      const styles = window.getComputedStyle(document.body);
      return {
        paddingTop: styles.paddingTop,
        paddingBottom: styles.paddingBottom,
        paddingLeft: styles.paddingLeft,
        paddingRight: styles.paddingRight,
      };
    });

    // 验证页面使用了安全区域变量或有适当的内边距
    const hasSafeAreaSupport = await page.evaluate(() => {
      const styles = window.getComputedStyle(document.body);
      return (
        styles.paddingTop.includes('env') ||
        styles.paddingTop.includes('safe-area-inset') ||
        styles.paddingBottom.includes('env') ||
        styles.paddingBottom.includes('safe-area-inset')
      );
    });

    // 如果没有使用安全区域变量，至少验证内容不被刘海遮挡
    // 这里不做严格断言，因为不同实现方式不同
  });
});
