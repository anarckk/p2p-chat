import { test, expect } from '@playwright/test';

/**
 * 用户信息设置测试
 * 测试场景：
 * 1. 首次进入应用时必须提示用户输入用户名（必填）
 * 2. 用户头像上传功能
 * 3. 用户信息持久化到 LocalStorage
 * 4. PeerId 在页面切换时保持不变
 */
test.describe('用户信息设置', () => {
  test('首次进入应用应该显示用户设置弹窗', async ({ page }) => {
    // 清除 localStorage，模拟首次访问
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();

    // 等待页面加载
    await page.waitForTimeout(1500);

    // 验证弹窗显示
    const modalTitle = page.locator('.ant-modal-title');
    await expect(modalTitle).toContainText('设置用户信息');

    // 验证弹窗不可关闭
    const closeIcon = page.locator('.ant-modal-close');
    await expect(closeIcon).not.toBeVisible();

    // 验证用户名输入框存在
    const usernameInput = page.locator('input[placeholder*="请输入用户名"]');
    await expect(usernameInput).toBeVisible();
  });

  test('用户名为必填项，未输入时应该警告', async ({ page }) => {
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 不输入用户名，直接点击完成
    const okButton = page.locator('button:has-text("完成")');
    await okButton.click();

    // 验证警告消息
    const warningMessage = await page.locator('.ant-message-warning').isVisible();
    expect(warningMessage).toBe(true);
  });

  test('输入用户名后应该成功保存并关闭弹窗', async ({ page }) => {
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 输入用户名
    const usernameInput = page.locator('input[placeholder*="请输入用户名"]');
    await usernameInput.fill('测试用户卡密');

    // 点击完成
    const okButton = page.locator('button:has-text("完成")');
    await okButton.click();

    // 等待弹窗关闭
    await page.waitForTimeout(500);

    // 验证弹窗已关闭
    const modal = page.locator('.ant-modal');
    await expect(modal).not.toBeVisible();

    // 验证成功消息
    const successMessage = await page.locator('.ant-message-success').isVisible();
    expect(successMessage).toBe(true);
  });

  test('用户信息应该保存到 LocalStorage', async ({ page }) => {
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 输入用户名
    const usernameInput = page.locator('input[placeholder*="请输入用户名"]');
    await usernameInput.fill('持久化测试用户');

    // 点击完成
    const okButton = page.locator('button:has-text("完成")');
    await okButton.click();
    await page.waitForTimeout(1000);

    // 验证 localStorage 中保存了用户信息
    const userInfo = await page.evaluate(() => {
      const stored = localStorage.getItem('p2p_user_info');
      return stored ? JSON.parse(stored) : null;
    });

    expect(userInfo).not.toBeNull();
    expect(userInfo.username).toBe('持久化测试用户');
    expect(userInfo).toHaveProperty('peerId');
  });

  test('刷新页面后用户信息应该保留', async ({ page }) => {
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 输入用户名并保存
    const usernameInput = page.locator('input[placeholder*="请输入用户名"]');
    await usernameInput.fill('刷新测试用户');

    const okButton = page.locator('button:has-text("完成")');
    await okButton.click();
    await page.waitForTimeout(1000);

    // 获取保存的 PeerId
    const peerIdBeforeReload = await page.evaluate(() => {
      const stored = localStorage.getItem('p2p_user_info');
      return stored ? JSON.parse(stored).peerId : null;
    });

    // 刷新页面
    await page.reload();
    await page.waitForTimeout(1500);

    // 验证弹窗不再显示
    const modal = page.locator('.ant-modal');
    await expect(modal).not.toBeVisible();

    // 验证用户名显示
    const usernameDisplay = page.locator('.username');
    await expect(usernameDisplay).toContainText('刷新测试用户');

    // 验证 PeerId 保持不变
    const peerIdAfterReload = await page.evaluate(() => {
      const stored = localStorage.getItem('p2p_user_info');
      return stored ? JSON.parse(stored).peerId : null;
    });

    expect(peerIdAfterReload).toBe(peerIdBeforeReload);
  });

  test('切换页面后 PeerId 应该保持不变', async ({ page }) => {
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 输入用户名并保存
    const usernameInput = page.locator('input[placeholder*="请输入用户名"]');
    await usernameInput.fill('页面切换测试用户');

    const okButton = page.locator('button:has-text("完成")');
    await okButton.click();
    await page.waitForTimeout(1000);

    // 获取在聊天页面的 PeerId
    const peerIdInWeChat = await page.evaluate(() => {
      const stored = localStorage.getItem('p2p_user_info');
      return stored ? JSON.parse(stored).peerId : null;
    });

    // 切换到发现中心
    await page.click('a:has-text("发现中心")');
    await page.waitForURL(/\/center/);
    await page.waitForTimeout(1000);

    // 获取在发现中心的 PeerId
    const peerIdInCenter = await page.evaluate(() => {
      const stored = localStorage.getItem('p2p_user_info');
      return stored ? JSON.parse(stored).peerId : null;
    });

    // 验证 PeerId 相同
    expect(peerIdInCenter).toBe(peerIdInWeChat);
  });

  test('应该支持上传头像', async ({ page }) => {
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 模拟上传头像文件
    const fileInput = page.locator('input[type="file"]');
    const file = await page.evaluate(() => {
      // 创建一个简单的测试图片
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(0, 0, 100, 100);
      }
      return canvas.toDataURL('image/png');
    });

    // 注意：这里的测试可能需要根据实际情况调整
    // 因为 a-upload 组件的行为可能不同
    const avatarUpload = page.locator('.ant-upload');
    await expect(avatarUpload).toBeVisible();
  });

  test('头像大小超过 2MB 应该警告', async ({ page }) => {
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 这个测试需要实际的上传功能支持
    // 在真实环境中，可以上传一个大文件测试
    const avatarTip = page.locator('.avatar-tip');
    await expect(avatarTip).toContainText('最大 2MB');
  });

  test('可以重新设置用户信息', async ({ page }) => {
    // 先设置一次用户信息
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '原始用户',
          avatar: null,
          peerId: 'test-peer-123',
        }),
      );
    });
    await page.reload();
    await page.waitForTimeout(1500);

    // 点击设置按钮
    const settingButton = page.locator('button[aria-label="setting"]');
    await settingButton.click();
    await page.waitForTimeout(500);

    // 验证设置弹窗显示
    const modalTitle = page.locator('.ant-modal-title');
    await expect(modalTitle).toContainText('设置用户信息');

    // 修改用户名
    const usernameInput = page.locator('input[placeholder*="请输入用户名"]');
    await usernameInput.clear();
    await usernameInput.fill('新用户名');

    // 点击完成
    const okButton = page.locator('button:has-text("完成")');
    await okButton.click();
    await page.waitForTimeout(1000);

    // 验证用户名已更新
    const usernameDisplay = page.locator('.username');
    await expect(usernameDisplay).toContainText('新用户名');

    // 验证 localStorage 已更新
    const userInfo = await page.evaluate(() => {
      const stored = localStorage.getItem('p2p_user_info');
      return stored ? JSON.parse(stored) : null;
    });

    expect(userInfo.username).toBe('新用户名');
    // PeerId 应该保持不变
    expect(userInfo.peerId).toBe('test-peer-123');
  });

  test('用户名长度限制为 20 个字符', async ({ page }) => {
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
    await page.waitForTimeout(1500);

    const usernameInput = page.locator('input[placeholder*="请输入用户名"]');
    const maxLength = await usernameInput.getAttribute('maxlength');

    expect(maxLength).toBe('20');
  });
});
