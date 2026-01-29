import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 发现中心首屏加载时间测试 - 真实场景（含头像）
 *
 * 测试目标：
 * 1. 模拟真实用户场景：10 个设备，每个都有 Base64 头像
 * 2. 复现用户报告的 6 秒加载问题
 * 3. 定位性能瓶颈
 */
test.describe('发现中心首屏加载时间 - 真实场景', () => {
  test.beforeEach(async ({ page }) => {
    // 先导航到页面初始化环境
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // 清理并设置用户信息（模拟已经输入过姓名的用户，包含头像）
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();

      // 创建一个小的测试头像 Base64（1x1 像素的红色 PNG）
      const smallAvatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QD0ADQG0Un4E5wAAAAASUVORK5CYII=';

      const userInfo = {
        username: '测试用户',
        avatar: smallAvatar,
        peerId: 'test-peer-123',
        version: 1,
      };
      localStorage.setItem('user-info', JSON.stringify(userInfo));
    });

    // 刷新页面使用户信息生效
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  });

  test('应该复现设备含大型 Base64 头像的加载缓慢问题', async ({ page }) => {
    // 监听所有控制台日志
    const consoleLogs: { type: string; text: string; time: number }[] = [];
    page.on('console', (msg) => {
      consoleLogs.push({
        type: msg.type(),
        text: msg.text(),
        time: Date.now(),
      });
    });

    // 创建一个大型 Base64 头像数据（模拟真实的 GIF 文件）
    // 注意：localStorage 有配额限制（通常 5-10MB），所以只测试 2 个设备
    await page.evaluate(() => {
      // 创建一个约 1MB 的 Base64 头像字符串（模拟 1.8MB GIF 文件转 Base64）
      const smallAvatar = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      const largeAvatarBase64 = smallAvatar + 'A'.repeat(1200000); // 约 1.2MB

      const devices = [];
      const now = Date.now();

      // 只创建 2 个设备（避免超过 localStorage 限制）
      for (let i = 1; i <= 2; i++) {
        devices.push({
          peerId: `online-device-${String(i).padStart(3, '0')}`,
          username: `在线设备${i}`,
          avatar: largeAvatarBase64, // 大型 Base64 头像
          lastHeartbeat: now - 1000,
          firstDiscovered: now - 10 * 60 * 1000,
          isOnline: true,
        });
      }

      localStorage.setItem('discovered_devices', JSON.stringify(devices));
    });

    console.log('[Test] 已在 localStorage 中存入 2 个在线设备（每个都包含约 1.2MB 的 Base64 头像）');

    // 记录开始时间
    const startTime = Date.now();

    // 导航到发现中心页面
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');

    // 等待页面容器出现
    await page.waitForSelector('.center-container', { timeout: 15000 });

    const containerLoadTime = Date.now() - startTime;
    console.log('[Performance] 页面容器加载时间:', containerLoadTime, 'ms');

    // 等待设备列表渲染完成（大型头像可能需要更长时间）
    const renderStart = Date.now();
    await page.waitForSelector('.device-card', { timeout: 30000 });
    const renderTime = Date.now() - renderStart;
    console.log('[Performance] 设备列表渲染时间:', renderTime, 'ms');

    const totalTime = Date.now() - startTime;
    console.log('[Performance] 总加载时间:', totalTime, 'ms');

    // 获取设备卡片数量
    const deviceCount = await page.locator('.device-card').count();
    console.log('[Test] 渲染的设备卡片数量:', deviceCount);

    // 检查头像是否加载
    const avatarCount = await page.locator('.ant-avatar img').count();
    console.log('[Test] 渲染的头像数量:', avatarCount);

    // 分析控制台日志
    const perfLogs = consoleLogs.filter((msg) =>
      msg.text.includes('[Performance]') ||
      msg.text.includes('[Center-Performance]') ||
      msg.text.includes('[Peer-Performance]') ||
      msg.text.includes('[Bootstrap-Performance]')
    );

    console.log('[Performance] ===== 所有性能日志 =====');
    perfLogs.forEach((msg) => {
      const relativeTime = msg.time - startTime;
      console.log(`[Performance] +${relativeTime}ms [${msg.type}] ${msg.text}`);
    });
    console.log('[Performance] =====================');

    // 分析关键时间点
    const bootstrapLog = perfLogs.find((log) =>
      log.text.includes('Bootstrap-Performance') &&
      (log.text.includes('connected') || log.text.includes('error'))
    );

    if (bootstrapLog) {
      const bootstrapTime = bootstrapLog.time - startTime;
      console.log('[Performance] 宇宙启动者连接时间:', bootstrapTime, 'ms');
    }

    // 分析自定义性能日志
    const customPerformanceLogs = await page.evaluate(() => {
      return (window as any).__performanceLogs || [];
    });

    console.log('[Performance] ===== 组件挂载详细日志 =====');
    customPerformanceLogs.forEach((log: any) => {
      const duration = log.duration ? ` (${log.duration}ms)` : '';
      console.log(`[Performance] ${log.timestamp} [${log.phase}]${duration} ${log.message}`);
    });
    console.log('[Performance] =====================');

    // 断言
    expect(deviceCount).toBeGreaterThan(0);
    expect(avatarCount).toBeGreaterThan(0);

    // 如果加载时间超过 3 秒，记录警告
    if (totalTime > 3000) {
      console.log('[Performance] ⚠️  加载时间超过 3 秒，可能存在性能问题！');
      console.log('[Performance] 总加载时间:', totalTime, 'ms');
      console.log('[Performance] 这表明大型 Base64 头像导致加载缓慢！');
    }
  });

  test('应该对比有无头像的加载时间差异', async ({ page }) => {
    // 第一次测试：无头像场景
    await page.evaluate(() => {
      const devices = [];
      const now = Date.now();

      for (let i = 1; i <= 10; i++) {
        devices.push({
          peerId: `device-no-avatar-${String(i).padStart(3, '0')}`,
          username: `无头像设备${i}`,
          avatar: null,
          lastHeartbeat: now - 1000,
          firstDiscovered: now - 10 * 60 * 1000,
          isOnline: true,
        });
      }

      localStorage.setItem('discovered_devices', JSON.stringify(devices));
    });

    const startTime1 = Date.now();
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('.device-card', { timeout: 5000 });
    const loadTimeWithoutAvatar = Date.now() - startTime1;

    console.log('[Performance] 无头像场景加载时间:', loadTimeWithoutAvatar, 'ms');

    // 第二次测试：有头像场景
    await page.evaluate(() => {
      const devices = [];
      const now = Date.now();

      // 创建一个小的测试头像 Base64
      const smallAvatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QD0ADQG0Un4E5wAAAAASUVORK5CYII=';

      for (let i = 1; i <= 10; i++) {
        devices.push({
          peerId: `device-with-avatar-${String(i).padStart(3, '0')}`,
          username: `有头像设备${i}`,
          avatar: smallAvatar,
          lastHeartbeat: now - 1000,
          firstDiscovered: now - 10 * 60 * 1000,
          isOnline: true,
        });
      }

      localStorage.setItem('discovered_devices', JSON.stringify(devices));
    });

    const startTime2 = Date.now();
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('.device-card', { timeout: 10000 });
    const loadTimeWithAvatar = Date.now() - startTime2;

    console.log('[Performance] 有头像场景加载时间:', loadTimeWithAvatar, 'ms');

    // 计算差异
    const diff = loadTimeWithAvatar - loadTimeWithoutAvatar;
    console.log('[Performance] 头像导致的加载时间差异:', diff, 'ms');

    // 断言
    expect(loadTimeWithoutAvatar).toBeLessThan(5000);
    expect(loadTimeWithAvatar).toBeLessThan(10000); // 有头像可能需要更多时间
  });

  test('应该测量并记录完整的加载流程时间线', async ({ page }) => {
    // 监听所有控制台日志
    const consoleLogs: { type: string; text: string; time: number }[] = [];
    page.on('console', (msg) => {
      consoleLogs.push({
        type: msg.type(),
        text: msg.text(),
        time: Date.now(),
      });
    });

    // 模拟真实场景：10 个设备，每个都包含 Base64 头像
    await page.evaluate(() => {
      const devices = [];
      const now = Date.now();

      // 创建一个小的测试头像 Base64
      const smallAvatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QD0ADQG0Un4E5wAAAAASUVORK5CYII=';

      for (let i = 1; i <= 10; i++) {
        devices.push({
          peerId: `device-${String(i).padStart(3, '0')}`,
          username: `设备${i}`,
          avatar: smallAvatar,
          lastHeartbeat: now - 1000,
          firstDiscovered: now - 10 * 60 * 1000,
          isOnline: true,
        });
      }

      localStorage.setItem('discovered_devices', JSON.stringify(devices));
    });

    const startTime = Date.now();

    // 导航到发现中心页面
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');

    // 等待页面容器出现
    await page.waitForSelector('.center-container', { timeout: 15000 });

    // 等待设备列表渲染完成
    await page.waitForSelector('.device-card', { timeout: 15000 });

    const totalTime = Date.now() - startTime;
    console.log('[Performance] ===== 完整加载流程时间线 =====');
    console.log('[Performance] 总加载时间:', totalTime, 'ms');

    // 分析关键时间点
    const timeline: { event: string; time: number }[] = [];

    const perfLogs = consoleLogs.filter((msg) =>
      msg.text.includes('[Center-Performance]') ||
      msg.text.includes('[Bootstrap-Performance]') ||
      msg.text.includes('[Peer-Performance]')
    );

    perfLogs.forEach((msg) => {
      const relativeTime = msg.time - startTime;

      // 提取关键事件
      if (msg.text.includes('[start] 组件开始挂载')) {
        timeline.push({ event: '组件开始挂载', time: relativeTime });
      } else if (msg.text.includes('[complete] 组件挂载完成')) {
        timeline.push({ event: '组件挂载完成', time: relativeTime });
      } else if (msg.text.includes('Bootstrap Peer 创建完成')) {
        timeline.push({ event: 'Bootstrap Peer 创建', time: relativeTime });
      } else if (msg.text.includes('Bootstrap 已存在') || msg.text.includes('Bootstrap 连接失败')) {
        timeline.push({ event: 'Bootstrap 连接失败', time: relativeTime });
      } else if (msg.text.includes('Peer 连接成功')) {
        timeline.push({ event: 'Peer 连接成功', time: relativeTime });
      } else if (msg.text.includes('收到设备列表')) {
        timeline.push({ event: '收到设备列表', time: relativeTime });
      }
    });

    timeline.forEach((item) => {
      console.log(`[Performance] +${item.time}ms ${item.event}`);
    });

    console.log('[Performance] =====================');

    // 分析性能瓶颈
    if (totalTime > 3000) {
      console.log('[Performance] ⚠️  加载时间超过 3 秒！');
      console.log('[Performance] 可能的瓶颈：');

      // 检查是否收到设备列表很慢
      const deviceListReceived = timeline.find((t) => t.event === '收到设备列表');
      if (deviceListReceived && deviceListReceived.time > 2000) {
        console.log('[Performance] - 向宇宙启动者请求设备列表耗时:', deviceListReceived.time, 'ms');
        console.log('[Performance] - 建议：优化设备列表请求机制，减少等待时间');
      }

      // 检查组件挂载时间
      const componentMounted = timeline.find((t) => t.event === '组件挂载完成');
      if (componentMounted && componentMounted.time > 100) {
        console.log('[Performance] - 组件挂载耗时:', componentMounted.time, 'ms');
        console.log('[Performance] - 建议：优化组件初始化逻辑');
      }
    }

    // 断言
    const deviceCount = await page.locator('.device-card').count();
    expect(deviceCount).toBeGreaterThan(0);
  });
});
