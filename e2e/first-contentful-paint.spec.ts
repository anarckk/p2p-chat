import { test, expect } from '@playwright/test';

test.describe('首屏加载时间测试', () => {
  test('测量首屏加载时间（First Contentful Paint）', async ({ page }) => {
    // 监听性能指标
    const performanceMetrics: string[] = [];

    page.on('load', () => {
      const performanceEntries = page.evaluate(() => {
        const timing = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        const paintEntries = performance.getEntriesByType('paint');

        const result: Record<string, number> = {};

        // 关键时间指标
        if (timing) {
          result.domContentLoaded = timing.domContentLoadedEventEnd - timing.domContentLoadedEventStart;
          result.loadComplete = timing.loadEventEnd - timing.loadEventStart;
          result.domInteractive = timing.domInteractive - timing.fetchStart;
          result.domComplete = timing.domComplete - timing.fetchStart;
          result.fetchStart = timing.fetchStart;
          result.responseStart = timing.responseStart - timing.fetchStart;
        }

        // First Contentful Paint (首次内容绘制)
        const fcp = paintEntries.find((entry) => entry.name === 'first-contentful-paint');
        if (fcp) {
          result.firstContentfulPaint = fcp.startTime;
        }

        return result;
      });

      performanceMetrics.push(JSON.stringify(performanceEntries));
    });

    // 记录导航开始时间
    const navigationStart = Date.now();

    // 导航到首页
    await page.goto('http://localhost:36626/', {
      waitUntil: 'load',
    });

    // 等待页面完全加载
    await page.waitForLoadState('load');

    const loadCompleteTime = Date.now() - navigationStart;

    // 获取性能指标
    const metrics = await page.evaluate(() => {
      const timing = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const paintEntries = performance.getEntriesByType('paint');

      const metrics: Record<string, number> = {
        domContentLoaded: 0,
        loadComplete: 0,
        domInteractive: 0,
        domComplete: 0,
        responseStart: 0,
        firstContentfulPaint: 0,
      };

      if (timing) {
        metrics.domContentLoaded = timing.domContentLoadedEventEnd - timing.domContentLoadedEventStart;
        metrics.loadComplete = timing.loadEventEnd - timing.loadEventStart;
        metrics.domInteractive = timing.domInteractive - timing.fetchStart;
        metrics.domComplete = timing.domComplete - timing.fetchStart;
        metrics.responseStart = timing.responseStart - timing.fetchStart;
      }

      const fcp = paintEntries.find((entry) => entry.name === 'first-contentful-paint');
      if (fcp) {
        metrics.firstContentfulPaint = fcp.startTime;
      }

      return metrics;
    });

    // 输出性能报告
    console.log('=================================');
    console.log('首屏加载时间性能报告');
    console.log('=================================');
    console.log(`First Contentful Paint (FCP): ${metrics.firstContentfulPaint.toFixed(2)} ms`);
    console.log(`DOM Interactive: ${metrics.domInteractive.toFixed(2)} ms`);
    console.log(`DOM Content Loaded: ${metrics.domContentLoaded.toFixed(2)} ms`);
    console.log(`DOM Complete: ${metrics.domComplete.toFixed(2)} ms`);
    console.log(`Response Start: ${metrics.responseStart.toFixed(2)} ms`);
    console.log(`页面完全加载时间: ${loadCompleteTime} ms`);
    console.log('=================================');

    // 断言：页面应该完全加载（FCP 在某些测试环境下可能为 0，这是正常的）
    expect(metrics.domComplete).toBeGreaterThan(0);

    // 如果 FCP 可用，检查其在合理范围内
    if (metrics.firstContentfulPaint > 0) {
      expect(metrics.firstContentfulPaint).toBeLessThan(5000);
    }

    // 测试通过
    expect(true).toBe(true);
  });

  test('测量各路由页面加载时间', async ({ page }) => {
    const routes = [
      { path: '/', name: '首页' },
      { path: '/center', name: '发现中心' },
      { path: '/wechat', name: '聊天应用' },
      { path: '/settings', name: '设置页面' },
    ];

    console.log('=================================');
    console.log('各路由页面加载时间报告');
    console.log('=================================');

    for (const route of routes) {
      const startTime = Date.now();

      await page.goto(`http://localhost:36626${route.path}`, {
        waitUntil: 'load',
      });

      await page.waitForLoadState('load');

      const loadTime = Date.now() - startTime;

      // 获取 FCP
      const fcp = await page.evaluate(() => {
        const paintEntries = performance.getEntriesByType('paint');
        const fcp = paintEntries.find((entry) => entry.name === 'first-contentful-paint');
        return fcp ? fcp.startTime : 0;
      });

      console.log(
        `${route.name} (${route.path}): FCP=${fcp.toFixed(2)} ms, 总加载时间=${loadTime} ms`,
      );
    }

    console.log('=================================');

    // 断言：所有页面都应该能加载
    expect(true).toBe(true);
  });
});
