import { test, expect } from '@playwright/test';
import {
  setupUser,
  clearAllStorage,
  WAIT_TIMES,
} from './test-helpers.js';

/**
 * 头像显示测试
 * 测试场景：
 * 1. 在设置页面上传头像后，切换到发现中心，自己的头像应该显示
 */
test.describe('头像显示测试', () => {
  test.setTimeout(90000);

  test.beforeEach(async ({ page }) => {
    // 清理存储
    await clearAllStorage(page);
  });

  test('在设置页面上传头像后，发现中心应该显示自己的头像', async ({ page }) => {
    console.log('[Test] 开始测试：上传头像后在发现中心显示');

    // 导航到设置页面并完成用户设置
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '头像测试用户');

    // 等待页面加载完成
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 再次导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    console.log('[Test] 导航到设置页面，准备上传头像');

    // 创建一个简单的测试图片（使用 Canvas 绘制红色方块）
    const avatarDataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(0, 0, 100, 100);
      }
      return canvas.toDataURL('image/png');
    });

    console.log('[Test] 测试图片已创建');

    // 找到文件上传按钮
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached();

    // 创建文件对象并上传
    const buffer = Buffer.from(avatarDataUrl.split(',')[1], 'base64');
    await fileInput.setInputFiles({
      name: 'test-avatar.png',
      mimeType: 'image/png',
      buffer: buffer,
    });

    console.log('[Test] 头像已上传');

    // 等待预览出现
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证预览图片显示
    const avatarPreview = page.locator('.avatar-section .ant-avatar img');
    await expect(avatarPreview).toBeVisible();
    const previewSrc = await avatarPreview.getAttribute('src');
    expect(previewSrc).toContain('data:image');

    console.log('[Test] 头像预览已显示');

    // 点击保存按钮
    const saveButton = page.locator('button[aria-label="save-settings-button"]');
    await saveButton.click();

    // 等待保存成功提示
    await page.waitForSelector('.ant-message-success', { timeout: 5000 });
    console.log('[Test] 设置已保存');

    // 等待一段时间确保数据已保存到 localStorage
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 验证头像已保存到 localStorage
    const savedAvatar = await page.evaluate(() => {
      const stored = localStorage.getItem('p2p_user_info');
      return stored ? JSON.parse(stored).avatar : null;
    });
    expect(savedAvatar).not.toBeNull();
    expect(savedAvatar).toContain('data:image');
    console.log('[Test] 头像已保存到 localStorage');

    // 导航到发现中心
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    console.log('[Test] 导航到发现中心');

    // 等待设备卡片出现
    await page.waitForSelector('.device-card', { timeout: 10000 });
    console.log('[Test] 设备卡片已出现');

    // 找到自己的设备卡片（带有"我"标签的卡片）
    const myDeviceCard = page.locator('.device-card.is-me');
    await expect(myDeviceCard).toBeVisible({ timeout: 5000 });
    console.log('[Test] 找到自己的设备卡片');

    // 检查自己的设备卡片中的头像
    const myAvatar = myDeviceCard.locator('.ant-avatar img');

    // 等待头像出现（这是关键的断言）
    try {
      await expect(myAvatar).toBeVisible({ timeout: 5000 });
      console.log('[Test] 自己的头像在发现中心已显示');

      // 验证头像的 src 属性
      const avatarSrc = await myAvatar.getAttribute('src');
      expect(avatarSrc).toContain('data:image');
      console.log('[Test] 头像 src 验证通过:', avatarSrc?.substring(0, 50) + '...');
    } catch (error) {
      // 如果头像没有显示，记录当前状态
      const cardHtml = await myDeviceCard.innerHTML();
      console.error('[Test] 自己的设备卡片 HTML:', cardHtml);

      const avatarExists = await myAvatar.count();
      console.error('[Test] 头像元素数量:', avatarExists);

      throw new Error('自己的头像在发现中心没有显示！');
    }
  });

  test('用户已在发现中心列表中时更新头像，应该立即显示新头像', async ({ page }) => {
    console.log('[Test] 开始测试：用户已在列表中时更新头像');

    // 先导航到发现中心，确保用户被添加到 deviceStore
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '已存在用户');

    // 等待 Peer 初始化和设备列表加载
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);

    // 验证用户已在列表中
    const myDeviceCard = page.locator('.device-card.is-me');
    await expect(myDeviceCard).toBeVisible({ timeout: 5000 });
    console.log('[Test] 用户已在发现中心列表中');

    // 验证此时没有头像（显示默认首字母）
    const myAvatar = myDeviceCard.locator('.ant-avatar img');
    const avatarCount = await myAvatar.count();
    expect(avatarCount).toBe(0);
    console.log('[Test] 确认初始状态无头像');

    // 导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    console.log('[Test] 导航到设置页面');

    // 创建并上传头像
    const avatarDataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#00FF00'; // 使用绿色区分
        ctx.fillRect(0, 0, 100, 100);
      }
      return canvas.toDataURL('image/png');
    });

    const fileInput = page.locator('input[type="file"]');
    const buffer = Buffer.from(avatarDataUrl.split(',')[1], 'base64');
    await fileInput.setInputFiles({
      name: 'test-avatar-green.png',
      mimeType: 'image/png',
      buffer: buffer,
    });

    // 等待预览出现
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证预览图片显示
    const avatarPreview = page.locator('.avatar-section .ant-avatar img');
    await expect(avatarPreview).toBeVisible();
    console.log('[Test] 头像预览已显示');

    // 保存设置
    const saveButton = page.locator('button[aria-label="save-settings-button"]');
    await saveButton.click();

    // 等待保存成功提示
    await page.waitForSelector('.ant-message-success', { timeout: 5000 });
    console.log('[Test] 设置已保存');

    // 等待数据保存完成
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 切换回发现中心
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    console.log('[Test] 切换回发现中心');

    // 找到自己的设备卡片
    const myDeviceCardAfter = page.locator('.device-card.is-me');
    await expect(myDeviceCardAfter).toBeVisible({ timeout: 5000 });

    // 关键断言：验证头像现在显示了（这是修复前会失败的场景）
    const myAvatarAfter = myDeviceCardAfter.locator('.ant-avatar img');

    try {
      await expect(myAvatarAfter).toBeVisible({ timeout: 5000 });
      console.log('[Test] 新头像已显示！');

      // 验证头像的 src 属性
      const avatarSrc = await myAvatarAfter.getAttribute('src');
      expect(avatarSrc).toContain('data:image');
      console.log('[Test] 新头像 src 验证通过');
    } catch (error) {
      // 记录失败时的状态
      const cardHtml = await myDeviceCardAfter.innerHTML();
      console.error('[Test] 失败时的卡片 HTML:', cardHtml);
      throw new Error('用户已在列表中时更新头像后，头像没有显示！这是修复前的 bug！');
    }
  });

  test('没有上传头像时，发现中心应该显示默认头像（首字母）', async ({ page }) => {
    console.log('[Test] 开始测试：没有头像时显示默认头像');

    // 导航到设置页面并完成用户设置
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置（不上传头像）
    await setupUser(page, '测试用户');

    // 等待页面加载完成
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 导航到发现中心
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    console.log('[Test] 导航到发现中心');

    // 等待设备卡片出现
    await page.waitForSelector('.device-card', { timeout: 10000 });

    // 找到自己的设备卡片
    const myDeviceCard = page.locator('.device-card.is-me');
    await expect(myDeviceCard).toBeVisible({ timeout: 5000 });

    // 检查头像：应该没有 img 元素，而是显示首字母
    const myAvatar = myDeviceCard.locator('.ant-avatar img');
    const avatarCount = await myAvatar.count();
    expect(avatarCount).toBe(0);

    // 验证显示的是首字母（用户名的第一个字符）
    const avatarText = myDeviceCard.locator('.ant-avatar');
    await expect(avatarText).toContainText('测');
    console.log('[Test] 默认头像（首字母）显示正确');
  });
});
