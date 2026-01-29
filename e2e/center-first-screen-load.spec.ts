import { test, expect } from '@playwright/test';

/**
 * 发现中心首屏加载时间测试
 *
 * 测试目标：
 * 1. 测量从打开网址到网页渲染出元素的时间
 * 2. 通过性能日志分析哪些地方加载缓慢
 *
 * 性能指标：
 * - 首屏渲染时间 (FCP): First Contentful Paint
 * - 最大内容绘制时间 (LCP): Largest Contentful Paint
 * - DOM 内容加载完成时间 (DOMContentLoaded)
 * - 页面完全加载时间 (Load)
 *
 * 预期：首屏加载时间应在 2 秒内完成
 */
test.describe('发现中心首屏加载时间', () => {
  test('应该快速渲染发现中心页面 (预期 < 2秒)', async ({ page }) => {
    // 记录开始时间
    const startTime = Date.now();

    // 导航到发现中心页面
    await page.goto('/center');

    // 等待页面加载完成（等待关键元素出现）
    await page.waitForSelector('.center-container', { timeout: 10000 });

    // 记录首屏渲染完成时间
    const firstContentPaintTime = Date.now() - startTime;
    console.log('[Performance] 首屏渲染时间:', firstContentPaintTime, 'ms');

    // 获取性能指标
    const performanceMetrics = await page.evaluate(() => {
      const perfData = window.performance.timing;
      const navigationStart = perfData.navigationStart;

      // DNS 查询时间
      const dnsTime = perfData.domainLookupEnd - perfData.domainLookupStart;

      // TCP 连接时间
      const tcpTime = perfData.connectEnd - perfData.connectStart;

      // 请求响应时间 (TTFB)
      const ttfbTime = perfData.responseStart - perfData.requestStart;

      // DOM 解析时间
      const domParseTime = perfData.domComplete - perfData.responseEnd;

      // DOM 内容加载完成时间
      const domContentLoadedTime = perfData.domContentLoadedEventEnd - navigationStart;

      // 页面完全加载时间
      const loadTime = perfData.loadEventEnd - navigationStart;

      // 获取 PerformanceObserver 数据（如果支持）
      let fcp = 0;
      let lcp = 0;

      if (window.PerformanceObserver) {
        // 尝试获取 Paint Timing API 数据
        const paintEntries = performance.getEntriesByType('paint');
        const fcpEntry = paintEntries.find((entry: any) => entry.name === 'first-contentful-paint');
        if (fcpEntry) {
          fcp = fcpEntry.startTime;
        }

        // 尝试获取 LCP（需要 PerformanceObserver 支持）
        const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
        if (lcpEntries && lcpEntries.length > 0) {
          lcp = lcpEntries[lcpEntries.length - 1].startTime;
        }
      }

      return {
        dnsTime,
        tcpTime,
        ttfbTime,
        domParseTime,
        domContentLoadedTime,
        loadTime,
        fcp,
        lcp,
      };
    });

    // 输出性能指标
    console.log('[Performance] ===== 性能指标 =====');
    console.log('[Performance] DNS 查询时间:', performanceMetrics.dnsTime, 'ms');
    console.log('[Performance] TCP 连接时间:', performanceMetrics.tcpTime, 'ms');
    console.log('[Performance] TTFB (首字节时间):', performanceMetrics.ttfbTime, 'ms');
    console.log('[Performance] DOM 解析时间:', performanceMetrics.domParseTime, 'ms');
    console.log('[Performance] DOM 内容加载完成时间:', performanceMetrics.domContentLoadedTime, 'ms');
    console.log('[Performance] 页面完全加载时间:', performanceMetrics.loadTime, 'ms');
    console.log('[Performance] FCP (First Contentful Paint):', performanceMetrics.fcp, 'ms');
    console.log('[Performance] LCP (Largest Contentful Paint):', performanceMetrics.lcp, 'ms');
    console.log('[Performance] =====================');

    // 获取自定义性能日志
    const customPerformanceLogs = await page.evaluate(() => {
      return (window as any).__performanceLogs || [];
    });

    console.log('[Performance] ===== 自定义性能日志 =====');
    customPerformanceLogs.forEach((log: any) => {
      const duration = log.duration ? ` (${log.duration}ms)` : '';
      console.log(`[Performance] ${log.timestamp} [${log.phase}]${duration} ${log.message}`);
    });
    console.log('[Performance] =====================');

    // 断言：关键元素应该可见
    await expect(page.locator('.center-container')).toBeVisible();
    await expect(page.locator('.ant-card-head-title:has-text("发现中心")')).toBeVisible();
    await expect(page.locator('.ant-card-head-title:has-text("我的信息")')).toBeVisible();

    // 性能断言（根据实际情况调整阈值）
    // 注意：首次测试时可能需要调整这个阈值
    expect(firstContentPaintTime).toBeLessThan(5000); // 至少在 5 秒内完成
    expect(performanceMetrics.domContentLoadedTime).toBeLessThan(5000);

    // 分析性能日志，找出瓶颈
    if (customPerformanceLogs.length > 0) {
      // 找出最慢的阶段
      const slowestPhase = customPerformanceLogs
        .filter((log: any) => log.duration)
        .sort((a: any, b: any) => b.duration - a.duration)[0];

      if (slowestPhase) {
        console.log(`[Performance] 最慢的阶段: ${slowestPhase.phase} (${slowestPhase.duration}ms) - ${slowestPhase.message}`);
      }
    }
  });

  test('应该测量 Peer 连接初始化时间', async ({ page }) => {
    // 监听控制台日志
    const consoleLogs: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'log' || msg.type() === 'info' || msg.type() === 'warning') {
        consoleLogs.push(msg.text());
      }
    });

    const startTime = Date.now();

    await page.goto('/center');

    // 等待页面容器出现
    await page.waitForSelector('.center-container', { timeout: 10000 });

    // 等待 Peer 连接成功（检查连接状态变为"已连接"）
    // 注意：如果连接状态是"未连接"，说明可能没有启动 Peer Server
    await page.waitForSelector('.ant-badge:has-text("已连接"), .ant-badge:has-text("未连接")', { timeout: 15000 });

    const peerConnectionTime = Date.now() - startTime;
    const isConnected = await page.locator('.ant-badge:has-text("已连接")').isVisible();

    console.log('[Performance] Peer 连接初始化时间:', peerConnectionTime, 'ms');
    console.log('[Performance] 连接状态:', isConnected ? '已连接' : '未连接');

    // 输出相关控制台日志
    const peerLogs = consoleLogs.filter((log) =>
      log.includes('[Peer]') || log.includes('[Center]') || log.includes('[Performance]')
    );
    console.log('[Performance] ===== Peer 相关日志 =====');
    peerLogs.forEach((log) => console.log('[Console]', log));
    console.log('[Performance] =====================');

    // 断言：Peer 连接尝试应在合理时间内完成
    expect(peerConnectionTime).toBeLessThan(10000);
  });

  test('应该测量设备列表渲染时间', async ({ page }) => {
    await page.goto('/center');

    // 等待页面容器出现
    await page.waitForSelector('.center-container', { timeout: 10000 });

    // 记录设备列表开始渲染时间
    const renderStartTime = Date.now();

    // 等待设备列表出现（可能是空状态或实际列表）
    await page.waitForSelector('.empty-state, .ant-list', { timeout: 5000 });

    const renderTime = Date.now() - renderStartTime;
    console.log('[Performance] 设备列表渲染时间:', renderTime, 'ms');

    // 断言：设备列表应快速渲染
    expect(renderTime).toBeLessThan(1000);
  });

  test('应该在控制台输出详细的性能日志', async ({ page }) => {
    // 收集所有控制台消息
    const consoleMessages: { type: string; text: string; time: number }[] = [];

    page.on('console', (msg) => {
      consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        time: Date.now(),
      });
    });

    const startTime = Date.now();
    await page.goto('/center');

    // 等待页面完全加载
    await page.waitForSelector('.center-container', { timeout: 10000 });
    await page.waitForTimeout(1000); // 额外等待 1 秒确保所有日志输出

    const totalTime = Date.now() - startTime;
    console.log('[Performance] 总加载时间:', totalTime, 'ms');

    // 分析控制台日志中的性能相关信息
    const perfLogs = consoleMessages.filter((msg) =>
      msg.text.includes('[Performance]') ||
      msg.text.includes('[Peer]') ||
      msg.text.includes('[Center]') ||
      msg.text.includes('Loading')
    );

    console.log('[Performance] ===== 所有相关控制台日志 =====');
    perfLogs.forEach((msg) => {
      const relativeTime = msg.time - startTime;
      console.log(`[Performance] +${relativeTime}ms [${msg.type}] ${msg.text}`);
    });
    console.log('[Performance] =====================');
  });
});
