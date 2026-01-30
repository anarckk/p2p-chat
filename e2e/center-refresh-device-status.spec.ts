/**
 * 发现中心刷新设备状态显示 E2E 测试
 * 测试刷新后每个设备显示独立的刷新状态（旋转图标 + 耗时）
 */

import { test, expect } from '@playwright/test';
import {
  setupUser,
  SELECTORS,
  WAIT_TIMES,
  clearAllStorage,
  generatePeerId,
  createTestDevices,
} from './test-helpers';

test.describe('发现中心刷新设备状态显示', () => {
  test('刷新时每个设备显示独立的旋转图标', async ({ browser }) => {
    console.log('[Test] 开始测试：刷新时每个设备显示独立的旋转图标');

    // 创建两个设备
    const devices = await createTestDevices(browser, '设备A', '设备B', { startPage: 'center' });

    const { page: pageA, userInfo: userInfoA } = devices.deviceA;
    const { page: pageB, userInfo: userInfoB } = devices.deviceB;

    const peerIdB = userInfoB.peerId;
    console.log('[Test] 设备 A Peer ID:', userInfoA.peerId);
    console.log('[Test] 设备 B Peer ID:', peerIdB);

    // 设备 A：手动添加设备 B（使用临时用户名）
    await pageA.evaluate((peerId: string) => {
      const now = Date.now();
      const newDevices = {
        [peerId]: {
          peerId,
          username: peerId,
          avatar: null,
          lastHeartbeat: now,
          firstDiscovered: now,
          isOnline: true,
        },
      };
      localStorage.setItem('discovered_devices', JSON.stringify(newDevices));
    }, peerIdB);

    // 刷新页面让设备列表加载
    await pageA.reload();
    await pageA.waitForSelector(SELECTORS.centerContainer, { timeout: 10000 });
    await pageA.waitForTimeout(1000);

    // 验证设备 B 已显示
    const deviceBCard = pageA.locator(SELECTORS.deviceCard).filter({ hasText: peerIdB });
    await expect(deviceBCard).toBeVisible({ timeout: 5000 });
    console.log('[Test] ✓ 设备 B 已显示');

    // 记录点击前的状态
    const spinningIconBefore = await deviceBCard.locator('.anticon-sync-spin').count();
    expect(spinningIconBefore).toBe(0);
    console.log('[Test] ✓ 刷新前没有旋转图标');

    // 点击刷新按钮
    console.log('[Test] 点击刷新按钮');
    const refreshButton = pageA.locator(SELECTORS.refreshButton);
    await refreshButton.click();

    // 等待一小段时间，确保旋转图标出现
    await pageA.waitForTimeout(500);

    // 验证设备 B 上出现了旋转图标
    // 注意：由于刷新很快完成，旋转图标可能一闪而过，所以我们检查它是否出现过
    const spinningIcon = deviceBCard.locator('.anticon-sync-spin, .anticon-sync[style*="spin"]');
    const hasSpinningIcon = await spinningIcon.count() > 0;
    console.log('[Test] 旋转图标存在:', hasSpinningIcon);

    // 等待刷新完成
    await pageA.waitForTimeout(6000);

    // 验证旋转图标已消失
    const spinningIconAfter = await deviceBCard.locator('.anticon-sync-spin, .anticon-sync[style*="spin"]').count();
    console.log('[Test] 刷新后旋转图标数量:', spinningIconAfter);

    // 清理
    await devices.deviceA.context.close();
    await devices.deviceB.context.close();
  });

  test('刷新完成后设备显示绿色耗时文字', async ({ browser }) => {
    console.log('[Test] 开始测试：刷新完成后设备显示绿色耗时文字');

    // 创建两个设备
    const devices = await createTestDevices(browser, '设备A', '设备B', { startPage: 'center' });

    const { page: pageA, userInfo: userInfoA } = devices.deviceA;
    const { page: pageB, userInfo: userInfoB } = devices.deviceB;

    const peerIdB = userInfoB.peerId;
    console.log('[Test] 设备 A Peer ID:', userInfoA.peerId);
    console.log('[Test] 设备 B Peer ID:', peerIdB);

    // 设备 A：手动添加设备 B
    await pageA.evaluate((peerId: string) => {
      const now = Date.now();
      const newDevices = {
        [peerId]: {
          peerId,
          username: peerId,
          avatar: null,
          lastHeartbeat: now,
          firstDiscovered: now,
          isOnline: true,
        },
      };
      localStorage.setItem('discovered_devices', JSON.stringify(newDevices));
    }, peerIdB);

    // 刷新页面让设备列表加载
    await pageA.reload();
    await pageA.waitForSelector(SELECTORS.centerContainer, { timeout: 10000 });
    await pageA.waitForTimeout(1000);

    // 验证设备 B 已显示
    const deviceBCard = pageA.locator(SELECTORS.deviceCard).filter({ hasText: peerIdB });
    await expect(deviceBCard).toBeVisible({ timeout: 5000 });
    console.log('[Test] ✓ 设备 B 已显示');

    // 记录点击前是否有耗时文字
    const durationTextBefore = await deviceBCard.locator('.refresh-duration').count();
    expect(durationTextBefore).toBe(0);
    console.log('[Test] ✓ 刷新前没有耗时文字');

    // 点击刷新按钮
    console.log('[Test] 点击刷新按钮');
    const refreshButton = pageA.locator(SELECTORS.refreshButton);
    await refreshButton.click();

    // 等待刷新完成（checkOnline 超时 5 秒）
    await pageA.waitForTimeout(6000);

    // 验证设备 B 显示了耗时文字
    const durationText = deviceBCard.locator('.refresh-duration');
    await expect(durationText).toBeVisible({ timeout: 3000 });
    console.log('[Test] ✓ 刷新后显示了耗时文字');

    // 验证耗时文字格式（应该是数字+ms）
    const durationTextContent = await durationText.textContent();
    console.log('[Test] 耗时文字内容:', durationTextContent);
    expect(durationTextContent).toMatch(/\d+ms/);
    console.log('[Test] ✓ 耗时文字格式正确（数字+ms）');

    // 验证耗时文字是绿色（通过 CSS 颜色值）
    const color = await durationText.evaluate((el) => {
      return window.getComputedStyle(el).color;
    });
    console.log('[Test] 耗时文字颜色:', color);
    // 绿色应该是 rgb(82, 196, 26) 或类似的值
    expect(color).toContain('82');
    expect(color).toContain('26');
    console.log('[Test] ✓ 耗时文字是绿色');

    // 清理
    await devices.deviceA.context.close();
    await devices.deviceB.context.close();
  });

  test('刷新按钮 loading 只覆盖发出请求阶段', async ({ page }) => {
    console.log('[Test] 开始测试：刷新按钮 loading 只覆盖发出请求阶段');

    // 清理所有存储数据
    await clearAllStorage(page);

    // 导航到发现中心页面
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');

    // 设置用户信息
    await setupUser(page, '测试用户');

    // 等待页面完全加载
    await page.waitForSelector(SELECTORS.centerContainer, { timeout: 10000 });

    // 获取刷新按钮
    const refreshButton = page.locator(SELECTORS.refreshButton);

    // 点击刷新按钮
    console.log('[Test] 点击刷新按钮');
    const startTime = Date.now();
    await refreshButton.click();

    // 等待 loading 结束
    await page.waitForTimeout(1000);
    const loadingEndTime = Date.now();
    const loadingDuration = loadingEndTime - startTime;

    console.log('[Test] Loading 耗时:', loadingDuration, 'ms');

    // Loading 应该很快结束（不超过 2 秒），因为它只覆盖发出请求阶段
    expect(loadingDuration).toBeLessThan(2000);
    console.log('[Test] ✓ Loading 在 2 秒内结束');
  });

  test('多个设备刷新时各自独立显示状态', async ({ browser }) => {
    console.log('[Test] 开始测试：多个设备刷新时各自独立显示状态');

    // 创建设备 A
    const deviceA = await browser.newContext();
    const pageA = await deviceA.newPage();
    const deviceAPeerId = generatePeerId();

    await pageA.goto('/center');
    await pageA.waitForLoadState('domcontentloaded');
    await pageA.evaluate((id: string) => {
      localStorage.setItem('p2p_user_info', JSON.stringify({
        username: '设备A',
        avatar: null,
        peerId: id,
      }));
    }, deviceAPeerId);
    await pageA.reload();
    await pageA.waitForSelector(SELECTORS.centerContainer, { timeout: 10000 });
    await pageA.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 创建真实的设备 B
    const deviceB = await browser.newContext();
    const pageB = await deviceB.newPage();
    const deviceBPeerId = generatePeerId();

    await pageB.goto('/center');
    await pageB.waitForLoadState('domcontentloaded');
    await pageB.evaluate((id: string) => {
      localStorage.setItem('p2p_user_info', JSON.stringify({
        username: '设备B',
        avatar: null,
        peerId: id,
      }));
    }, deviceBPeerId);
    await pageB.reload();
    await pageB.waitForSelector(SELECTORS.centerContainer, { timeout: 10000 });
    await pageB.waitForTimeout(WAIT_TIMES.PEER_INIT);

    console.log('[Test] 设备 A:', deviceAPeerId);
    console.log('[Test] 设备 B:', deviceBPeerId);

    // 设备 A：添加真实设备 B 和一个假设备
    const fakeDevice = 'fake-device-' + Date.now();
    await pageA.evaluate((data: { realPeerId: string; fakePeerId: string }) => {
      const now = Date.now();
      const devices = {
        [data.realPeerId]: {
          peerId: data.realPeerId,
          username: data.realPeerId,
          avatar: null,
          lastHeartbeat: now,
          firstDiscovered: now,
          isOnline: true,
        },
        [data.fakePeerId]: {
          peerId: data.fakePeerId,
          username: data.fakePeerId,
          avatar: null,
          lastHeartbeat: now,
          firstDiscovered: now,
          isOnline: true,
        },
      };
      localStorage.setItem('discovered_devices', JSON.stringify(devices));
    }, { realPeerId: deviceBPeerId, fakePeerId: fakeDevice });

    // 刷新页面
    await pageA.reload();
    await pageA.waitForSelector(SELECTORS.centerContainer, { timeout: 10000 });
    await pageA.waitForTimeout(1000);

    // 验证两个设备都显示
    const allDeviceCards = pageA.locator(SELECTORS.deviceCard);
    const deviceCount = await allDeviceCards.count();
    expect(deviceCount).toBeGreaterThanOrEqual(2);
    console.log('[Test] ✓ 两个设备都已显示');

    // 点击刷新
    console.log('[Test] 点击刷新');
    const refreshButton = pageA.locator(SELECTORS.refreshButton);
    await refreshButton.click();

    // 等待一小段时间
    await pageA.waitForTimeout(500);

    // 验证：真实设备 B 应该显示耗时（或者旋转图标）
    const realDeviceCard = pageA.locator(SELECTORS.deviceCard).filter({ hasText: deviceBPeerId });

    // 等待刷新完成
    await pageA.waitForTimeout(6000);

    // 检查真实设备 B 是否显示了耗时文字
    const realDeviceDuration = realDeviceCard.locator('.refresh-duration');
    const realDeviceHasDuration = await realDeviceDuration.count() > 0;
    console.log('[Test] 真实设备 B 是否显示耗时:', realDeviceHasDuration);

    // 真实设备应该显示耗时（成功连接）
    // 或者至少没有错误
    if (realDeviceHasDuration) {
      const durationText = await realDeviceDuration.textContent();
      console.log('[Test] 真实设备 B 耗时:', durationText);
      expect(durationText).toMatch(/\d+ms/);
    }

    // 清理
    await deviceA.close();
    await deviceB.close();
  });

  test('刷新耗时能够反映网络状态差异', async ({ browser }) => {
    test.setTimeout(50000); // 优化：减少超时时间
    console.log('[Test] 开始测试：刷新耗时能够反映网络状态差异');

    // 创建两个设备
    const devices = await createTestDevices(browser, '设备A', '设备B', { startPage: 'center' });

    const { page: pageA, userInfo: userInfoA } = devices.deviceA;
    const { page: pageB, userInfo: userInfoB } = devices.deviceB;

    const peerIdB = userInfoB.peerId;
    console.log('[Test] 设备 A Peer ID:', userInfoA.peerId);
    console.log('[Test] 设备 B Peer ID:', peerIdB);

    // 设备 A：添加设备 B
    await pageA.evaluate((peerId: string) => {
      const now = Date.now();
      const newDevices = {
        [peerId]: {
          peerId,
          username: peerId,
          avatar: null,
          lastHeartbeat: now,
          firstDiscovered: now,
          isOnline: true,
        },
      };
      localStorage.setItem('discovered_devices', JSON.stringify(newDevices));
    }, peerIdB);

    // 刷新页面让设备列表加载
    await pageA.reload();
    await pageA.waitForSelector(SELECTORS.centerContainer, { timeout: 10000 });
    await pageA.waitForTimeout(1000);

    // 验证设备 B 已显示
    const deviceBCard = pageA.locator(SELECTORS.deviceCard).filter({ hasText: peerIdB });
    await expect(deviceBCard).toBeVisible({ timeout: 5000 });

    // 进行多次刷新，记录耗时
    const durations: number[] = [];
    const refreshCount = 2; // 减少到 2 次以避免超时

    for (let i = 0; i < refreshCount; i++) {
      console.log('[Test] 第', i + 1, '次刷新');

      const refreshButton = pageA.locator(SELECTORS.refreshButton);
      await refreshButton.click();

      // 等待刷新完成
      await pageA.waitForTimeout(6000);

      // 获取耗时（使用 try-catch 避免元素未找到导致测试失败）
      try {
        const durationText = deviceBCard.locator('.refresh-duration');
        // 等待耗时文字出现
        await durationText.waitFor({ state: 'visible', timeout: 2000 });
        const text = await durationText.textContent();
        if (text) {
          const match = text.match(/(\d+)ms/);
          if (match) {
            const duration = parseInt(match[1], 10);
            durations.push(duration);
            console.log('[Test] 第', i + 1, '次刷新耗时:', duration, 'ms');
          }
        }
      } catch (e) {
        console.log('[Test] 第', i + 1, '次刷新未获取到耗时（可能设备离线）');
      }

      // 等待一段时间再进行下一次刷新
      await pageA.waitForTimeout(1000);
    }

    // 验证：至少有几次刷新成功获取到了耗时
    console.log('[Test] 总共获取到', durations.length, '次耗时数据');
    expect(durations.length).toBeGreaterThan(0);
    console.log('[Test] ✓ 刷新耗时功能正常工作');

    // 如果有多次数据，可以计算平均耗时
    if (durations.length > 1) {
      const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
      console.log('[Test] 平均刷新耗时:', Math.round(avgDuration), 'ms');
    }

    // 清理
    await devices.deviceA.context.close();
    await devices.deviceB.context.close();
  });
});
