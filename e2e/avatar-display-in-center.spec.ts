import { test, expect } from '@playwright/test';
import {
  setupUser,
  clearAllStorage,
  WAIT_TIMES,
} from './test-helpers.js';

test.describe('头像显示测试', () => {
  test.setTimeout(30000);

  test.beforeEach(async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    await clearAllStorage(page);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  });

  test('在设置页面上传头像后，发现中心应该显示自己的头像', async ({ page }) => {
    console.log('[Test] 开始测试：上传头像后在发现中心显示');
    await setupUser(page, '头像测试用户');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

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

    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached();
    const buffer = Buffer.from(avatarDataUrl.split(',')[1], 'base64');
    await fileInput.setInputFiles({
      name: 'test-avatar.png',
      mimeType: 'image/png',
      buffer: buffer,
    });

    await page.waitForTimeout(WAIT_TIMES.SHORT);
    const avatarPreview = page.locator('.avatar-section .ant-avatar img');
    await expect(avatarPreview).toBeVisible();

    const saveButton = page.locator('button[aria-label="save-settings-button"]');
    await saveButton.click();
    await page.waitForSelector('.inline-message-success', { timeout: 5000 });
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    const savedAvatar = await page.evaluate(() => {
      const stored = localStorage.getItem('p2p_user_info');
      return stored ? JSON.parse(stored).avatar : null;
    });
    expect(savedAvatar).not.toBeNull();

    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    await page.waitForSelector('.device-card', { timeout: 10000 });
    const myDeviceCard = page.locator('.device-card.is-me');
    await expect(myDeviceCard).toBeVisible({ timeout: 5000 });
    const myAvatar = myDeviceCard.locator('.ant-avatar img');
    await expect(myAvatar).toBeVisible({ timeout: 5000 });
    const avatarSrc = await myAvatar.getAttribute('src');
    expect(avatarSrc).toContain('data:image');
  });

  test('用户已在发现中心列表中时更新头像，应该立即显示新头像', async ({ page }) => {
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');
    await setupUser(page, '已存在用户');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);

    const myDeviceCard = page.locator('.device-card.is-me');
    await expect(myDeviceCard).toBeVisible({ timeout: 5000 });
    const myAvatar = myDeviceCard.locator('.ant-avatar img');
    const avatarCount = await myAvatar.count();
    expect(avatarCount).toBe(0);

    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    const avatarDataUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#00FF00';
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

    await page.waitForTimeout(WAIT_TIMES.SHORT);
    const avatarPreview = page.locator('.avatar-section .ant-avatar img');
    await expect(avatarPreview).toBeVisible();

    const saveButton = page.locator('button[aria-label="save-settings-button"]');
    await saveButton.click();
    await page.waitForSelector('.inline-message-success', { timeout: 5000 });
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    const myDeviceCardAfter = page.locator('.device-card.is-me');
    await expect(myDeviceCardAfter).toBeVisible({ timeout: 5000 });
    const myAvatarAfter = myDeviceCardAfter.locator('.ant-avatar img');
    await expect(myAvatarAfter).toBeVisible({ timeout: 5000 });
    const avatarSrc = await myAvatarAfter.getAttribute('src');
    expect(avatarSrc).toContain('data:image');
  });

  test('没有上传头像时，发现中心应该显示默认头像（首字母）', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    await setupUser(page, '测试用户');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    await page.waitForSelector('.device-card', { timeout: 10000 });
    const myDeviceCard = page.locator('.device-card.is-me');
    await expect(myDeviceCard).toBeVisible({ timeout: 5000 });

    const myAvatar = myDeviceCard.locator('.ant-avatar img');
    const avatarCount = await myAvatar.count();
    expect(avatarCount).toBe(0);

    const avatarText = myDeviceCard.locator('.ant-avatar');
    await expect(avatarText).toContainText('测');
  });
});
