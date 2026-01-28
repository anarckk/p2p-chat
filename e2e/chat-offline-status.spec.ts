import { test, expect } from '@playwright/test';
import {
  setupUser,
  SELECTORS,
  WAIT_TIMES,
  getPeerIdFromStorage,
} from './test-helpers';

/**
 * 聊天离线状态测试
 *
 * 测试场景：设备下线后，发现中心和聊天列表都要显示离线状态
 *
 * Bug: WeChatView.vue:69 和 77 行使用了 `device.isOnline || true`，导致设备离线时仍显示在线
 */
test.describe('聊天离线状态测试', () => {
  test('设备下线后，发现中心和聊天列表都要显示离线状态', async ({ browser }) => {
    // 增加测试超时时间，因为需要等待心跳超时（65秒）
    test.setTimeout(120000);
    // 创建两个浏览器 session
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // 步骤1: 用户A设置用户名
      await pageA.goto('http://localhost:36626');
      await pageA.waitForLoadState('domcontentloaded');
      await setupUser(pageA, 'UserA');
      await pageA.waitForTimeout(3000);

      // 步骤2: 用户B设置用户名
      await pageB.goto('http://localhost:36626');
      await pageB.waitForLoadState('domcontentloaded');
      await setupUser(pageB, 'UserB');
      await pageB.waitForTimeout(3000);

      // 获取双方 PeerId
      const peerIdA = await getPeerIdFromStorage(pageA);
      const peerIdB = await getPeerIdFromStorage(pageB);

      console.log('[Test] UserA PeerId:', peerIdA);
      console.log('[Test] UserB PeerId:', peerIdB);

      // 步骤3: 用户A添加用户B到发现中心
      await pageA.goto('http://localhost:36626/center');
      await pageA.waitForTimeout(2000);

      // 输入用户B的PeerId
      await pageA.fill(SELECTORS.peerIdInput, peerIdB || '');
      // 点击"添加"按钮（不是查询按钮）
      await pageA.click('button[aria-label="add-device"]');
      await pageA.waitForTimeout(3000);

      // 验证用户B出现在用户A的发现中心，且状态为在线
      const deviceListA = await pageA.locator('.device-card').allTextContents();
      console.log('[Test] Device list A:', deviceListA);
      expect(deviceListA.some((text) => text.includes('UserB'))).toBeTruthy();

      // 检查用户B在发现中心的在线状态
      const onlineStatusA = await pageA
        .locator('.device-card')
        .filter({ hasText: 'UserB' })
        .locator('text=在线')
        .count();
      expect(onlineStatusA).toBeGreaterThan(0);
      console.log('[Test] UserB 显示在线在 UserA 的发现中心');

      // 步骤4: 用户B进入聊天页面，应该能看到用户A
      await pageB.goto('http://localhost:36626/wechat');
      await pageB.waitForTimeout(2000);

      // 验证用户A出现在用户B的聊天列表，且状态为在线
      const chatListB = await pageB.locator('.contact-item').allTextContents();
      console.log('[Test] Chat list B:', chatListB);
      expect(chatListB.some((text) => text.includes('UserA'))).toBeTruthy();

      // 检查用户A在聊天列表的在线状态
      const onlineStatusB = await pageB
        .locator('.contact-item')
        .filter({ hasText: 'UserA' })
        .locator('text=在线')
        .count();
      expect(onlineStatusB).toBeGreaterThan(0);
      console.log('[Test] UserA 显示在线在 UserB 的聊天列表');

      // 步骤5: 用户B点击用户A进入聊天
      await pageB.click('.contact-item:first-child');
      await pageB.waitForTimeout(1000);

      // 验证聊天头部显示用户A在线
      const chatHeaderStatus = await pageB
        .locator('.chat-header')
        .locator('text=在线')
        .count();
      expect(chatHeaderStatus).toBeGreaterThan(0);
      console.log('[Test] UserA 显示在线在聊天头部');

      // 步骤6: 用户A下线（关闭页面）
      await contextA.close();

      // 步骤7: 模拟设备A离线（通过修改 lastHeartbeat）
      console.log('[Test] 模拟设备A离线...');
      await pageB.evaluate((peerIdA) => {
        const stored = localStorage.getItem('discovered_devices');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed[peerIdA]) {
            // 将 lastHeartbeat 设置为 11 分钟前，超过 OFFLINE_THRESHOLD（10 分钟）
            parsed[peerIdA].lastHeartbeat = Date.now() - 11 * 60 * 1000;
            localStorage.setItem('discovered_devices', JSON.stringify(parsed));
            console.log('[Test] 已将设备A的lastHeartbeat设置为11分钟前');
          }
        }
      }, peerIdA || '');

      // 刷新页面以触发心跳检查和状态更新
      await pageB.reload();
      await pageB.waitForTimeout(3000);

      // 重新点击用户A进入聊天页面（刷新后可能被重定向到聊天列表）
      await pageB.click('.contact-item:first-child');
      await pageB.waitForTimeout(1000);

      // 验证用户A在聊天列表显示离线
      const offlineStatusB = await pageB
        .locator('.contact-item')
        .filter({ hasText: 'UserA' })
        .locator('text=离线')
        .count();
      expect(offlineStatusB).toBeGreaterThan(0);
      console.log('[Test] UserA 显示离线在 UserB 的聊天列表');

      // 验证聊天头部也显示离线
      const chatHeaderOfflineStatus = await pageB
        .locator('.chat-header')
        .locator('text=离线')
        .count();
      expect(chatHeaderOfflineStatus).toBeGreaterThan(0);
      console.log('[Test] UserA 显示离线在聊天头部');

      // 步骤8: 切换到发现中心，验证用户A也显示离线
      await pageB.goto('http://localhost:36626/center');
      await pageB.waitForTimeout(2000);

      // 验证用户A在发现中心显示离线
      const centerOfflineStatusB = await pageB
        .locator('.device-card')
        .filter({ hasText: 'UserA' })
        .locator('text=离线')
        .count();
      expect(centerOfflineStatusB).toBeGreaterThan(0);
      console.log('[Test] UserA 显示离线在 UserB 的发现中心');

      console.log('[Test] 测试通过：设备下线后，发现中心和聊天列表都正确显示离线状态');
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('设备下线后重新上线，状态应该正确更新', async ({ browser }) => {
    // 增加测试超时时间，因为需要等待心跳超时和重新上线检测
    test.setTimeout(120000);
    // 创建两个浏览器 session
    let contextA = await browser.newContext();
    const contextB = await browser.newContext();

    let pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      // 步骤1: 用户A和用户B设置用户名
      await pageA.goto('http://localhost:36626');
      await pageA.waitForLoadState('domcontentloaded');
      await setupUser(pageA, 'UserA');
      await pageA.waitForTimeout(3000);

      await pageB.goto('http://localhost:36626');
      await pageB.waitForLoadState('domcontentloaded');
      await setupUser(pageB, 'UserB');
      await pageB.waitForTimeout(3000);

      const peerIdA = await getPeerIdFromStorage(pageA);
      const peerIdB = await getPeerIdFromStorage(pageB);

      // 步骤2: 用户A添加用户B
      await pageA.goto('http://localhost:36626/center');
      await pageA.waitForTimeout(2000);
      await pageA.fill(SELECTORS.peerIdInput, peerIdB || '');
      await pageA.click('button[aria-label="add-device"]');
      await pageA.waitForTimeout(3000);

      // 步骤3: 用户B进入聊天页面
      await pageB.goto('http://localhost:36626/wechat');
      await pageB.waitForTimeout(2000);

      // 验证初始状态为在线
      const initialOnlineStatus = await pageB
        .locator('.contact-item')
        .filter({ hasText: 'UserA' })
        .locator('text=在线')
        .count();
      expect(initialOnlineStatus).toBeGreaterThan(0);
      console.log('[Test] 初始状态：UserA 显示在线');

      // 步骤4: 用户A下线
      await contextA.close();

      // 步骤5: 模拟设备A离线（通过修改 lastHeartbeat）
      console.log('[Test] 模拟设备A离线...');
      await pageB.evaluate((peerIdA) => {
        const stored = localStorage.getItem('discovered_devices');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed[peerIdA]) {
            // 将 lastHeartbeat 设置为 11 分钟前，超过 OFFLINE_THRESHOLD（10 分钟）
            parsed[peerIdA].lastHeartbeat = Date.now() - 11 * 60 * 1000;
            localStorage.setItem('discovered_devices', JSON.stringify(parsed));
            console.log('[Test] 已将设备A的lastHeartbeat设置为11分钟前');
          }
        }
      }, peerIdA || '');

      // 刷新页面以触发状态更新
      await pageB.reload();
      await pageB.waitForTimeout(3000);

      // 验证显示离线
      const offlineStatus = await pageB
        .locator('.contact-item')
        .filter({ hasText: 'UserA' })
        .locator('text=离线')
        .count();
      expect(offlineStatus).toBeGreaterThan(0);
      console.log('[Test] UserA 下线后显示离线');

      // 步骤6: 用户A重新上线（创建新的 context 和 page）
      contextA = await browser.newContext();
      pageA = await contextA.newPage();
      await pageA.goto('http://localhost:36626');
      await pageA.waitForLoadState('domcontentloaded');
      // 用户A不需要重新设置用户名，因为会从 localStorage 读取
      await pageA.waitForTimeout(3000);

      // 步骤7: 等待用户B检测到用户A重新上线
      // 由于心跳检查有定时器，等待一段时间
      console.log('[Test] 等待检测到 UserA 重新上线...');

      // 等待设备A完全初始化
      await pageA.waitForTimeout(3000);

      // 模拟用户B检测到设备A重新上线（更新 lastHeartbeat）
      await pageB.evaluate((peerIdA) => {
        const stored = localStorage.getItem('discovered_devices');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed[peerIdA]) {
            // 将 lastHeartbeat 设置为当前时间
            parsed[peerIdA].lastHeartbeat = Date.now();
            localStorage.setItem('discovered_devices', JSON.stringify(parsed));
            console.log('[Test] 已将设备A的lastHeartbeat更新为当前时间');
          }
        }
      }, peerIdA || '');

      await pageB.reload();
      await pageB.waitForTimeout(3000);

      // 验证显示在线
      const onlineStatus = await pageB
        .locator('.contact-item')
        .filter({ hasText: 'UserA' })
        .locator('text=在线')
        .count();
      expect(onlineStatus).toBeGreaterThan(0);
      console.log('[Test] UserA 重新上线后显示在线');

      console.log('[Test] 测试通过：设备重新上线后状态正确更新');
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
