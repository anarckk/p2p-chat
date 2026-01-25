import { test, expect } from '@playwright/test';

test.describe('发现中心页面', () => {
  test.beforeEach(async ({ page }) => {
    // 设置默认用户信息
    await page.goto('/center');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '测试用户',
          avatar: null,
          peerId: 'test-peer-123',
        }),
      );
    });
    await page.reload();
    await page.waitForTimeout(1500);
  });

  test('应该显示页面内容', async ({ page }) => {
    // 检查页面容器
    await expect(page.locator('.center-container')).toBeVisible();
  });

  test('应该显示发现中心相关元素', async ({ page }) => {
    // 验证页面包含"发现中心"文本
    const pageContent = await page.content();
    expect(pageContent).toContain('发现中心');
  });
});

/**
 * P2P 发现功能的多浏览器 Session 测试
 *
 * 测试场景：
 * 1. 设备 A（主动发现方）- 负责主动查询其他设备
 * 2. 设备 B（被动发现方）- 被设备 A 发现
 *
 * 预期结果：设备 B 应该出现在设备 A 的发现中心列表中
 */
test.describe('P2P 发现功能 - 多设备测试', () => {
  test('设备 A 添加设备 B 时，设备 B 应该在设备 A 的发现列表中', async ({ browser }) => {
    // 创建两个独立的浏览器上下文（模拟两个不同的用户/设备）
    const deviceAContext = await browser.newContext();
    const deviceBContext = await browser.newContext();

    // 创建两个页面
    const deviceAPage = await deviceAContext.newPage();
    const deviceBPage = await deviceBContext.newPage();

    // 设备 A 配置：用户名为 "设备A"
    await deviceAPage.goto('/center');
    await deviceAPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '设备A',
          avatar: null,
          peerId: 'device-a-peer-id-123',
        }),
      );
    });
    await deviceAPage.reload();
    // 等待 Peer 初始化完成
    await deviceAPage.waitForTimeout(3000);

    // 获取设备 A 实际的 PeerId（可能和设置的不一样）
    const deviceAPeerId = await deviceAPage.evaluate(() => {
      const userInfo = localStorage.getItem('p2p_user_info');
      if (userInfo) {
        return JSON.parse(userInfo).peerId;
      }
      return null;
    });
    console.log('设备 A 的 PeerId:', deviceAPeerId);

    // 设备 B 配置：用户名为 "设备B"
    await deviceBPage.goto('/center');
    await deviceBPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '设备B',
          avatar: null,
          peerId: 'device-b-peer-id-456',
        }),
      );
    });
    await deviceBPage.reload();
    // 等待 Peer 初始化完成
    await deviceBPage.waitForTimeout(3000);

    // 获取设备 B 的 PeerId（从页面中读取）
    const deviceBPeerId = await deviceBPage.evaluate(() => {
      const userInfo = localStorage.getItem('p2p_user_info');
      if (userInfo) {
        return JSON.parse(userInfo).peerId;
      }
      return null;
    });

    console.log('设备 B 的 PeerId:', deviceBPeerId);

    // 检查连接状态
    const deviceAConnected = await deviceAPage.locator('.ant-badge-status-processing').count();
    const deviceBConnected = await deviceBPage.locator('.ant-badge-status-processing').count();
    console.log('设备 A 连接状态:', deviceAConnected > 0 ? '已连接' : '未连接');
    console.log('设备 B 连接状态:', deviceBConnected > 0 ? '已连接' : '未连接');

    // 设备 A 在输入框中输入设备 B 的 PeerId 并点击"添加"按钮
    await deviceAPage.fill('input[placeholder*="Peer ID"]', deviceBPeerId);
    await deviceAPage.click('button:has-text("添加")');

    // 等待发现结果和消息提示
    await deviceAPage.waitForTimeout(5000);

    // 打印设备列表中的所有卡片，用于调试
    const deviceCards = await deviceAPage.locator('.device-card').all();
    console.log('设备 A 的设备列表数量:', deviceCards.length);
    for (let i = 0; i < deviceCards.length; i++) {
      const text = await deviceCards[i].textContent();
      console.log(`设备卡片 ${i}:`, text);
    }

    // 验证设备 B 出现在设备 A 的发现列表中
    // 检查设备列表是否包含设备 B（可能显示用户名或 PeerId）
    const hasDeviceBByName = await deviceAPage.locator('.device-card').filter({ hasText: '设备B' }).count();
    const hasDeviceBByPeerId = await deviceAPage.locator('.device-card').filter({ hasText: deviceBPeerId }).count();
    expect(hasDeviceBByName + hasDeviceBByPeerId).toBeGreaterThan(0);

    // 清理
    await deviceAContext.close();
    await deviceBContext.close();
  });

  test('设备 A 添加设备 B 时，设备 A 应该出现在设备 B 的发现中心列表中（被动发现）', async ({
    browser,
  }) => {
    // 创建两个独立的浏览器上下文
    const deviceAContext = await browser.newContext();
    const deviceBContext = await browser.newContext();

    // 创建两个页面
    const deviceAPage = await deviceAContext.newPage();
    const deviceBPage = await deviceBContext.newPage();

    // 设备 A 配置
    await deviceAPage.goto('/center');
    await deviceAPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '发现者A',
          avatar: null,
          peerId: 'discoverer-a-123',
        }),
      );
    });
    await deviceAPage.reload();
    await deviceAPage.waitForTimeout(3000);

    // 设备 B 配置
    await deviceBPage.goto('/center');
    await deviceBPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '被发现的B',
          avatar: null,
          peerId: 'discovered-b-456',
        }),
      );
    });
    await deviceBPage.reload();
    await deviceBPage.waitForTimeout(3000);

    // 获取设备 A 和设备 B 的 PeerId
    const deviceAPeerId = await deviceAPage.evaluate(() => {
      const userInfo = localStorage.getItem('p2p_user_info');
      if (userInfo) {
        return JSON.parse(userInfo).peerId;
      }
      return null;
    });

    const deviceBPeerId = await deviceBPage.evaluate(() => {
      const userInfo = localStorage.getItem('p2p_user_info');
      if (userInfo) {
        return JSON.parse(userInfo).peerId;
      }
      return null;
    });

    console.log('设备 A 的 PeerId:', deviceAPeerId);
    console.log('设备 B 的 PeerId:', deviceBPeerId);

    // 记录设备 B 当前的设备列表数量
    const deviceBCardsBefore = await deviceBPage.locator('.device-card').all();
    console.log('设备 B 的设备列表数量（添加前）:', deviceBCardsBefore.length);

    // 设备 A 添加设备 B
    await deviceAPage.fill('input[placeholder*="Peer ID"]', deviceBPeerId);
    await deviceAPage.click('button:has-text("添加")');

    // 等待发现通知发送和处理（自动刷新）
    await deviceAPage.waitForTimeout(3000);
    await deviceBPage.waitForTimeout(3000);

    // 打印设备 B 的设备列表中的所有卡片，用于调试
    const deviceBCardsAfter = await deviceBPage.locator('.device-card').all();
    console.log('设备 B 的设备列表数量（添加后）:', deviceBCardsAfter.length);
    for (let i = 0; i < deviceBCardsAfter.length; i++) {
      const text = await deviceBCardsAfter[i].textContent();
      console.log(`设备 B - 设备卡片 ${i}:`, text);
    }

    // 验证设备 A（发现者A）出现在设备 B 的发现中心列表中
    // 被动发现功能：设备 B 应该收到了设备 A 的发现通知，并将设备 A 添加到发现列表
    const hasDiscovererAByName = await deviceBPage.locator('.device-card').filter({ hasText: '发现者A' }).count();
    const hasDiscovererAByPeerId = await deviceBPage.locator('.device-card').filter({ hasText: deviceAPeerId }).count();
    expect(hasDiscovererAByName + hasDiscovererAByPeerId).toBeGreaterThan(0);

    // 清理
    await deviceAContext.close();
    await deviceBContext.close();
  });

  test('使用 browser.newPage() 创建两个独立 session', async ({ browser }) => {
    // 方式 2：直接创建两个独立的 page
    const deviceAPage = await browser.newPage();
    const deviceBPage = await browser.newPage();

    // 设备 A 设置
    await deviceAPage.goto('/center');
    await deviceAPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '用户A',
          avatar: null,
          peerId: 'user-a-peer-001',
        }),
      );
    });
    await deviceAPage.reload();
    await deviceAPage.waitForTimeout(3000);

    // 设备 B 设置
    await deviceBPage.goto('/center');
    await deviceBPage.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '用户B',
          avatar: null,
          peerId: 'user-b-peer-002',
        }),
      );
    });
    await deviceBPage.reload();
    await deviceBPage.waitForTimeout(3000);

    // 设备 A 添加设备 B（使用"添加"而不是"查询"，因为设备 B 可能还没有发现任何设备）
    const deviceBPeerId = await deviceBPage.evaluate(() => {
      const userInfo = localStorage.getItem('p2p_user_info');
      if (userInfo) {
        return JSON.parse(userInfo).peerId;
      }
      return null;
    });

    await deviceAPage.fill('input[placeholder*="Peer ID"]', deviceBPeerId);
    await deviceAPage.click('button:has-text("添加")');
    await deviceAPage.waitForTimeout(5000);

    // 验证设备 B 出现在设备 A 的发现列表中
    // 可能显示用户名或 PeerId
    const hasUserBByName = await deviceAPage.locator('.device-card').filter({ hasText: '用户B' }).count();
    const hasUserBByPeerId = await deviceAPage.locator('.device-card').filter({ hasText: deviceBPeerId }).count();
    expect(hasUserBByName + hasUserBByPeerId).toBeGreaterThan(0);

    // 关闭页面
    await deviceAPage.close();
    await deviceBPage.close();
  });
});
