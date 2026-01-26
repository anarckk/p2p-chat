import { test, expect } from '@playwright/test';
import {
  clearAllStorage,
} from './test-helpers.js';

/**
 * 用户信息设置测试
 * 测试场景：
 * 1. 首次进入应用时必须提示用户输入用户名（必填）
 * 2. 用户信息持久化到 LocalStorage
 * 3. PeerId 在页面切换时保持不变
 */
test.describe('用户信息设置', () => {
  test('首次进入应用应该显示用户设置弹窗', async ({ page }) => {
    // 清除 localStorage，模拟首次访问
    await page.goto('/wechat');
    await clearAllStorage(page);
    await page.reload();

    // 等待弹窗出现
    await page.waitForSelector('.ant-modal', { timeout: 5000 });

    // 验证弹窗显示 - 使用更精确的选择器
    const modal = page.locator('.ant-modal');
    await expect(modal).toBeVisible();

    // 验证弹窗标题
    const modalTitle = page.locator('.ant-modal-title');
    await expect(modalTitle).toContainText('设置用户信息');

    // 验证用户名输入框存在
    const usernameInput = page.locator('input[placeholder*="请输入用户名"]');
    await expect(usernameInput).toBeVisible();
  });

  test('输入用户名后应该成功保存并关闭弹窗', async ({ page }) => {
    await page.goto('/wechat');
    await clearAllStorage(page);
    await page.reload();

    // 等待弹窗出现
    await page.waitForSelector('.ant-modal', { timeout: 5000 });

    // 输入用户名
    const usernameInput = page.locator('input[placeholder*="请输入用户名"]');
    await usernameInput.fill('测试用户卡密');

    // 点击完成 - 使用精确的选择器
    const okButton = page.locator('.ant-modal .ant-btn-primary');
    await okButton.click();

    // 等待按钮 loading 状态结束（Peer 初始化需要时间）
    await page.waitForSelector('.ant-modal .ant-btn-primary[disabled]', { state: 'hidden', timeout: 35000 }).catch(() => {
      // 可能已经完成，继续执行
    });

    // 等待弹窗关闭
    await page.waitForSelector('.ant-modal', { state: 'hidden', timeout: 5000 }).catch(() => {
      // 弹窗可能已经关闭，继续执行
    });

    // 验证用户信息已保存到 localStorage
    const userInfo = await page.evaluate(() => {
      const stored = localStorage.getItem('p2p_user_info');
      return stored ? JSON.parse(stored) : null;
    });
    expect(userInfo).not.toBeNull();
    expect(userInfo.username).toBe('测试用户卡密');
  });

  test('用户信息应该保存到 LocalStorage', async ({ page }) => {
    await page.goto('/wechat');
    await clearAllStorage(page);
    await page.reload();

    // 等待弹窗出现
    await page.waitForSelector('.ant-modal', { timeout: 5000 });

    // 输入用户名
    const usernameInput = page.locator('input[placeholder*="请输入用户名"]');
    await usernameInput.fill('持久化测试用户');

    // 点击完成
    const okButton = page.locator('.ant-modal .ant-btn-primary');
    await okButton.click();

    // 等待保存完成
    await page.waitForTimeout(1000);

    // 验证 localStorage 中保存了用户信息
    const userInfo = await page.evaluate(() => {
      const stored = localStorage.getItem('p2p_user_info');
      return stored ? JSON.parse(stored) : null;
    });

    expect(userInfo).not.toBeNull();
    expect(userInfo.username).toBe('持久化测试用户');
    expect(userInfo).toHaveProperty('peerId');
    expect(userInfo.peerId).toBeTruthy();
  });

  test('刷新页面后用户信息应该保留', async ({ page }) => {
    await page.goto('/wechat');
    await clearAllStorage(page);
    await page.reload();

    // 等待弹窗并设置用户信息
    await page.waitForSelector('.ant-modal', { timeout: 5000 });
    const usernameInput = page.locator('input[placeholder*="请输入用户名"]');
    await usernameInput.fill('刷新测试用户');

    const okButton = page.locator('.ant-modal .ant-btn-primary');
    await okButton.click();

    // 等待保存完成
    await page.waitForTimeout(1000);

    // 获取保存的 PeerId
    const peerIdBeforeReload = await page.evaluate(() => {
      const stored = localStorage.getItem('p2p_user_info');
      return stored ? JSON.parse(stored).peerId : null;
    });

    // 刷新页面
    await page.reload();
    await page.waitForTimeout(3000);

    // 验证 PeerId 保持不变
    const peerIdAfterReload = await page.evaluate(() => {
      const stored = localStorage.getItem('p2p_user_info');
      return stored ? JSON.parse(stored).peerId : null;
    });

    expect(peerIdAfterReload).toBe(peerIdBeforeReload);
  });

  test('用户名长度限制为 20 个字符', async ({ page }) => {
    await page.goto('/wechat');
    await clearAllStorage(page);
    await page.reload();

    // 等待弹窗出现
    await page.waitForSelector('.ant-modal', { timeout: 5000 });

    const usernameInput = page.locator('input[placeholder*="请输入用户名"]');
    const maxLength = await usernameInput.getAttribute('maxlength');

    expect(maxLength).toBe('20');
  });

  test('空用户名应该不能提交', async ({ page }) => {
    await page.goto('/wechat');
    await clearAllStorage(page);
    await page.reload();

    // 等待弹窗出现
    await page.waitForSelector('.ant-modal', { timeout: 5000 });

    // 不输入用户名，直接点击完成
    const okButton = page.locator('.ant-modal .ant-btn-primary');
    await okButton.click();

    // 验证弹窗仍然显示（说明提交失败）
    const modal = page.locator('.ant-modal');
    await expect(modal).toBeVisible();
  });

  /**
   * 中文用户名 Peer ID 生成测试
   * 测试场景：
   * 1. 输入中文用户名
   * 2. 验证 Peer ID 能正确生成（不是"连接中..."）
   * 3. 验证连接状态显示为"已连接"
   * 4. 验证弹窗能正常关闭
   */
  test.describe('中文用户名场景', () => {
    test('中文用户名应该能正常生成 Peer ID', async ({ page }) => {
      // 增加超时时间，因为 Peer 初始化需要时间
      test.setTimeout(40000);

      await page.goto('/center');
      await clearAllStorage(page);
      await page.reload();

      // 等待弹窗出现
      await page.waitForSelector('.ant-modal', { timeout: 5000 });

      // 输入中文用户名
      const usernameInput = page.locator('input[placeholder*="请输入用户名"]');
      await usernameInput.fill('测试用户');

      // 点击完成
      const okButton = page.locator('.ant-modal .ant-btn-primary');
      await okButton.click();

      // 等待按钮 loading 状态结束（最多 35 秒）
      await page.waitForSelector('.ant-modal .ant-btn-primary:not([disabled])', { timeout: 35000 }).catch(() => {
        // 如果按钮一直是 disabled 状态，说明 Peer 初始化卡住了
        throw new Error('Peer initialization timeout with Chinese username - button stuck in loading state');
      });

      // 等待弹窗关闭
      await page.waitForSelector('.ant-modal', { state: 'hidden', timeout: 5000 }).catch(() => {
        throw new Error('Modal did not close after Peer initialization');
      });

      // 验证"我的 Peer ID"显示的不是"连接中..."
      const peerIdElement = page.locator('.ant-descriptions-item-label:has-text("我的 Peer ID") + .ant-descriptions-item-content');
      const peerIdText = await peerIdElement.textContent();

      // Peer ID 不应该是"连接中..."，应该是实际的 ID
      expect(peerIdText).not.toBe('连接中...');
      expect(peerIdText).not.toContain('连接中');
      expect(peerIdText?.trim()).toBeTruthy();

      // 验证连接状态是"已连接"而不是"未连接"
      const connectionStatusElement = page.locator('.ant-descriptions-item-label:has-text("连接状态") + .ant-descriptions-item-content');
      const connectionStatus = await connectionStatusElement.textContent();

      expect(connectionStatus).not.toBe('未连接');
      expect(connectionStatus).toContain('已连接');
    });

    test('中文用户名在聊天页面也应该正常工作', async ({ page }) => {
      test.setTimeout(40000);

      await page.goto('/wechat');
      await clearAllStorage(page);
      await page.reload();

      // 等待弹窗出现
      await page.waitForSelector('.ant-modal', { timeout: 5000 });

      // 输入中文用户名
      const usernameInput = page.locator('input[placeholder*="请输入用户名"]');
      await usernameInput.fill('卡密先生');

      // 点击完成
      const okButton = page.locator('.ant-modal .ant-btn-primary');
      await okButton.click();

      // 等待按钮 loading 状态结束
      await page.waitForSelector('.ant-modal .ant-btn-primary:not([disabled])', { timeout: 35000 }).catch(() => {
        throw new Error('Peer initialization timeout in chat page');
      });

      // 等待弹窗关闭
      await page.waitForSelector('.ant-modal', { state: 'hidden', timeout: 5000 }).catch(() => {
        throw new Error('Modal did not close');
      });

      // 验证用户信息已保存
      const userInfo = await page.evaluate(() => {
        const stored = localStorage.getItem('p2p_user_info');
        return stored ? JSON.parse(stored) : null;
      });

      expect(userInfo).not.toBeNull();
      expect(userInfo.username).toBe('卡密先生');
      expect(userInfo.peerId).toBeTruthy();

      // Peer ID 不应该包含中文字符（因为 PeerJS 不支持）
      // 应该是纯字母数字组合
      const peerId = userInfo.peerId;
      const hasChinese = /[\u4e00-\u9fa5]/.test(peerId);
      expect(hasChinese).toBe(false);
    });

    test('混合中英文用户名也应该正常工作', async ({ page }) => {
      test.setTimeout(40000);

      await page.goto('/center');
      await clearAllStorage(page);
      await page.reload();

      // 等待弹窗出现
      await page.waitForSelector('.ant-modal', { timeout: 5000 });

      // 输入混合中英文用户名
      const usernameInput = page.locator('input[placeholder*="请输入用户名"]');
      await usernameInput.fill('用户User123');

      // 点击完成
      const okButton = page.locator('.ant-modal .ant-btn-primary');
      await okButton.click();

      // 等待初始化完成
      await page.waitForSelector('.ant-modal .ant-btn-primary:not([disabled])', { timeout: 35000 }).catch(() => {
        throw new Error('Peer initialization timeout with mixed username');
      });

      await page.waitForSelector('.ant-modal', { state: 'hidden', timeout: 5000 }).catch(() => {
        throw new Error('Modal did not close');
      });

      // 验证 Peer ID 正常显示
      const peerIdElement = page.locator('.ant-descriptions-item-label:has-text("我的 Peer ID") + .ant-descriptions-item-content');
      const peerIdText = await peerIdElement.textContent();

      expect(peerIdText).not.toBe('连接中...');
      expect(peerIdText?.trim()).toBeTruthy();
    });
  });
});
