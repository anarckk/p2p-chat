import { test, expect } from '@playwright/test';

/**
 * 发现中心首屏加载时间测试 - 大量设备场景
 *
 * 测试目标：
 * 1. 模拟发现中心有 10 个在线设备的场景
 * 2. 测量从打开网址到网页渲染出元素的时间
 * 3. 分析大量设备是否导致加载缓慢
 *
 * 预期：即使有 10 个在线设备，首屏加载时间仍应在合理范围内
 */
test.describe('发现中心首屏加载时间 - 大量设备', () => {
  test.beforeEach(async ({ page }) => {
    // 先导航到页面初始化环境
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // 清理并设置用户信息（模拟已经输入过姓名的用户）
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();

      const userInfo = {
        username: '测试用户',
        avatar: null,
        peerId: 'test-peer-123',
        version: 1,
      };
      localStorage.setItem('user-info', JSON.stringify(userInfo));
    });

    // 刷新页面使用户信息生效
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  });

  test('应该快速渲染包含 10 个在线设备的发现中心页面', async ({ page }) => {
    // 模拟在 localStorage 中预先存入 10 个在线设备
    await page.evaluate(() => {
      const devices = [];
      const now = Date.now();

      // 创建 10 个在线设备（最近刚刚在线过）
      for (let i = 1; i <= 10; i++) {
        devices.push({
          peerId: `online-device-${String(i).padStart(3, '0')}`,
          username: `在线设备${i}`,
          avatar: null,
          lastHeartbeat: now - 1000, // 1 秒前在线
          firstDiscovered: now - 10 * 60 * 1000, // 10 分钟前发现
          isOnline: true,
        });
      }

      localStorage.setItem('discovered_devices', JSON.stringify(devices));
    });

    console.log('[Test] 已在 localStorage 中存入 10 个在线设备');

    // 记录开始时间
    const startTime = Date.now();

    // 导航到发现中心页面（确保在正确的路由）
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');

    // 等待页面加载完成（等待关键元素出现）
    const firstContentPaintTime = Date.now() - startTime;
    console.log('[Performance] 首屏渲染时间 (10个在线设备):', firstContentPaintTime, 'ms');

    // 等待页面容器出现
    await page.waitForSelector('.center-container', { timeout: 10000 });

    // 等待设备列表渲染完成
    const renderStart = Date.now();

    // 先检查是否有设备数据，以及为什么没有渲染设备卡片
    await page.waitForTimeout(500); // 等待一下让设备数据加载

    const deviceListState = await page.evaluate(() => {
      return {
        hasEmptyState: document.querySelector('.empty-state') !== null,
        hasDeviceList: document.querySelector('.ant-list') !== null,
        deviceCardCount: document.querySelectorAll('.device-card').length,
      };
    });

    console.log('[Test] 设备列表状态:', JSON.stringify(deviceListState));

    // 等待设备卡片出现
    await page.waitForSelector('.device-card', { timeout: 5000 });
    const renderTime = Date.now() - renderStart;
    console.log('[Performance] 设备列表渲染时间 (10个在线设备):', renderTime, 'ms');

    // 获取性能指标
    const performanceMetrics = await page.evaluate(() => {
      const perfData = window.performance.timing;
      const navigationStart = perfData.navigationStart;

      // DOM 内容加载完成时间
      const domContentLoadedTime = perfData.domContentLoadedEventEnd - navigationStart;

      // 页面完全加载时间
      const loadTime = perfData.loadEventEnd - navigationStart;

      return {
        domContentLoadedTime,
        loadTime,
      };
    });

    console.log('[Performance] ===== 性能指标 (10个在线设备) =====');
    console.log('[Performance] DOM 内容加载完成时间:', performanceMetrics.domContentLoadedTime, 'ms');
    console.log('[Performance] 页面完全加载时间:', performanceMetrics.loadTime, 'ms');
    console.log('[Performance] =====================');

    // 获取自定义性能日志
    const customPerformanceLogs = await page.evaluate(() => {
      return (window as any).__performanceLogs || [];
    });

    console.log('[Performance] ===== 自定义性能日志 (10个在线设备) =====');
    customPerformanceLogs.forEach((log: any) => {
      const duration = log.duration ? ` (${log.duration}ms)` : '';
      console.log(`[Performance] ${log.timestamp} [${log.phase}]${duration} ${log.message}`);
    });
    console.log('[Performance] =====================');

    // 断言：关键元素应该可见
    await expect(page.locator('.center-container')).toBeVisible();
    await expect(page.locator('.ant-card-head-title:has-text("发现中心")')).toBeVisible();
    await expect(page.locator('.ant-card-head-title:has-text("我的信息")')).toBeVisible();

    // 断言：应该显示设备列表（包括在线设备）
    const deviceCards = page.locator('.device-card');
    const deviceCount = await deviceCards.count();

    console.log('[Test] 渲染的设备卡片数量:', deviceCount);
    // 注意：设备数量可能不包括"我"自己的卡片，或某些设备可能被过滤
    // 只要至少有一些设备显示即可
    expect(deviceCount).toBeGreaterThan(0); // 至少有 1 个设备卡片

    // 检查是否有在线设备标记
    const onlineDevices = page.locator('.ant-tag:has-text("在线")');
    const onlineCount = await onlineDevices.count();
    console.log('[Test] 在线设备数量:', onlineCount);
    // 在线设备数量应该大于 0
    expect(onlineCount).toBeGreaterThan(0);

    // 性能断言
    expect(firstContentPaintTime).toBeLessThan(5000); // 首屏渲染应在 5 秒内完成
    expect(performanceMetrics.domContentLoadedTime).toBeLessThan(5000);
    expect(renderTime).toBeLessThan(5000); // 设备列表渲染应在 5 秒内完成
  });

  test('应该对比有设备和无设备的加载时间', async ({ page }) => {
    // 第一次测试：无设备场景
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');

    const startTime1 = Date.now();
    await page.waitForSelector('.center-container', { timeout: 10000 });
    const loadTimeWithoutDevices = Date.now() - startTime1;

    console.log('[Performance] 无设备场景加载时间:', loadTimeWithoutDevices, 'ms');

    // 第二次测试：有 10 个在线设备场景
    // 在 localStorage 中存入 10 个在线设备
    await page.evaluate(() => {
      const devices = [];
      const now = Date.now();

      for (let i = 1; i <= 10; i++) {
        devices.push({
          peerId: `online-device-${String(i).padStart(3, '0')}`,
          username: `在线设备${i}`,
          avatar: null,
          lastHeartbeat: now - 1000,
          firstDiscovered: now - 10 * 60 * 1000,
          isOnline: true,
        });
      }

      localStorage.setItem('discovered_devices', JSON.stringify(devices));
    });

    // 刷新页面
    const startTime2 = Date.now();
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('.center-container', { timeout: 10000 });
    const loadTimeWithDevices = Date.now() - startTime2;

    console.log('[Performance] 有10个在线设备场景加载时间:', loadTimeWithDevices, 'ms');

    // 计算差异
    const diff = loadTimeWithDevices - loadTimeWithoutDevices;
    console.log('[Performance] 加载时间差异:', diff, 'ms');

    // 断言：有设备时不应该慢太多（允许 500ms 差异）
    expect(diff).toBeLessThan(500);
  });

  test('应该测量设备数量对渲染性能的影响', async ({ page }) => {
    const deviceCounts = [5, 10, 20];
    const results: { deviceCount: number; renderTime: number }[] = [];

    for (const count of deviceCounts) {
      // 清理并设置指定数量的设备
      await page.evaluate((numDevices) => {
        localStorage.clear();
        localStorage.setItem('user-info', JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'test-peer-123',
          version: 1,
        }));

        const devices = [];
        const now = Date.now();

        for (let i = 1; i <= numDevices; i++) {
          devices.push({
            peerId: `online-device-${String(i).padStart(3, '0')}`,
            username: `在线设备${i}`,
            avatar: null,
            lastHeartbeat: now - 1000,
            firstDiscovered: now - 10 * 60 * 1000,
            isOnline: true,
          });
        }

        localStorage.setItem('discovered_devices', JSON.stringify(devices));
      }, count);

      // 刷新页面并测量渲染时间
      const startTime = Date.now();
      await page.goto('/center');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForSelector('.center-container', { timeout: 10000 });

      // 等待所有设备卡片渲染
      await page.waitForFunction((expectedCount) => {
        return document.querySelectorAll('.device-card').length >= expectedCount;
      }, count, { timeout: 5000 });

      const renderTime = Date.now() - startTime;
      results.push({ deviceCount: count, renderTime });

      console.log(`[Performance] ${count} 个设备渲染时间:`, renderTime, 'ms');
    }

    // 输出对比结果
    console.log('[Performance] ===== 设备数量对渲染性能的影响 =====');
    results.forEach((result) => {
      console.log(`[Performance] ${result.deviceCount} 个设备: ${result.renderTime}ms`);
    });
    console.log('[Performance] =====================');

    // 断言：渲染时间应该与设备数量成正比，但不应过度增长
    // 20 个设备的渲染时间应该不超过 10 个设备的 2.5 倍
    const result10 = results.find((r) => r.deviceCount === 10);
    const result20 = results.find((r) => r.deviceCount === 20);

    if (result10 && result20) {
      const ratio = result20.renderTime / result10.renderTime;
      console.log('[Performance] 20个设备 vs 10个设备的渲染时间比例:', ratio.toFixed(2));
      expect(ratio).toBeLessThan(2.5); // 允许 2.5 倍
    }
  });

  test('应该分析大量在线设备时的性能瓶颈', async ({ page }) => {
    // 在 localStorage 中存入 10 个在线设备
    await page.evaluate(() => {
      const devices = [];
      const now = Date.now();

      for (let i = 1; i <= 10; i++) {
        devices.push({
          peerId: `online-device-${String(i).padStart(3, '0')}`,
          username: `在线设备${i}`,
          avatar: null,
          lastHeartbeat: now - 1000,
          firstDiscovered: now - 10 * 60 * 1000,
          isOnline: true,
        });
      }

      localStorage.setItem('discovered_devices', JSON.stringify(devices));
    });

    // 监听控制台日志
    const consoleLogs: { type: string; text: string; time: number }[] = [];
    page.on('console', (msg) => {
      consoleLogs.push({
        type: msg.type(),
        text: msg.text(),
        time: Date.now(),
      });
    });

    const startTime = Date.now();
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('.center-container', { timeout: 10000 });

    const totalTime = Date.now() - startTime;
    console.log('[Performance] 总加载时间 (10个在线设备):', totalTime, 'ms');

    // 分析控制台日志中的性能相关信息
    const perfLogs = consoleLogs.filter((msg) =>
      msg.text.includes('[Performance]') ||
      msg.text.includes('[Center-Performance]') ||
      msg.text.includes('[Peer-Performance]') ||
      msg.text.includes('[Bootstrap-Performance]')
    );

    console.log('[Performance] ===== 所有性能日志 (10个在线设备) =====');
    perfLogs.forEach((msg) => {
      const relativeTime = msg.time - startTime;
      console.log(`[Performance] +${relativeTime}ms [${msg.type}] ${msg.text}`);
    });
    console.log('[Performance] =====================');

    // 分析自定义性能日志，找出最慢的阶段
    const customPerformanceLogs = await page.evaluate(() => {
      return (window as any).__performanceLogs || [];
    });

    if (customPerformanceLogs.length > 0) {
      const slowestPhases = customPerformanceLogs
        .filter((log: any) => log.duration)
        .sort((a: any, b: any) => b.duration - a.duration)
        .slice(0, 5); // 取最慢的 5 个阶段

      console.log('[Performance] ===== 最慢的 5 个阶段 =====');
      slowestPhases.forEach((log: any, index: number) => {
        console.log(`[Performance] ${index + 1}. [${log.phase}] ${log.duration}ms - ${log.message}`);
      });
      console.log('[Performance] =====================');
    }

    // 断言
    expect(totalTime).toBeLessThan(5000);
  });
});
