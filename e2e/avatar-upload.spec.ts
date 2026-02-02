/**
 * 头像上传和显示 E2E 测试 - 简化版
 * 直接通过 UI 操作测试头像功能
 */

import { test, expect } from '@playwright/test';
import {
  setupUser,
  WAIT_TIMES,
} from './test-helpers.js';
import path from 'path';

test.describe('头像上传和显示', () => {
  test.setTimeout(30000);

  const testAvatarPath = path.join(process.cwd(), '测试文件', '测试头像.jpg');
  const testAvatar2Path = path.join(process.cwd(), '测试文件', '测试头像2.gif');

  test('应该能上传头像并持久化显示', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '头像测试用户');

    // 再次导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // 上传第一张头像
    const fileInput = page.locator('.avatar-actions input[type="file"]');
    await fileInput.setInputFiles(testAvatarPath);

    // 等待预览显示
    await page.waitForTimeout(1000);

    // 验证预览显示
    const avatarImg = page.locator('.avatar-section .ant-avatar img');
    const avatarSrc = avatarImg;
    await expect(avatarSrc, 'Avatar should be previewed').toHaveAttribute('src', );
    expect(avatarSrc?.startsWith('data:image')).toBe(true);

    // 保存设置
    await page.click('[aria-label="save-settings-button"]');
    await page.waitForSelector('.inline-message-success', { timeout: 5000 });
    await page.waitForTimeout(300);

    // 刷新页面验证持久化
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const avatarImgAfterReload = page.locator('.avatar-section .ant-avatar img');
    const avatarSrcAfterReload = avatarImgAfterReload;
    await expect(avatarSrcAfterReload, 'Avatar should persist').toHaveAttribute('src', );
    expect(avatarSrcAfterReload).toBe(avatarSrc);
  });

  test('应该能更换头像', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '更换头像用户');

    // 上传第一张头像
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const fileInput = page.locator('.avatar-actions input[type="file"]');
    await fileInput.setInputFiles(testAvatarPath);
    await page.waitForTimeout(1000);

    // 保存第一张头像
    await page.click('[aria-label="save-settings-button"]');
    await page.waitForSelector('.inline-message-success', { timeout: 5000 });
    await page.waitForTimeout(300);

    // 获取第一张头像的 src
    const firstAvatarSrc = page.locator('.avatar-section .ant-avatar img');
    await expect(firstAvatarSrc).toHaveAttribute('src', );

    // 上传第二张头像
    await fileInput.setInputFiles(testAvatar2Path);
    await page.waitForTimeout(1000);

    // 验证预览已更新
    const secondAvatarSrc = page.locator('.avatar-section .ant-avatar img');
    await expect(secondAvatarSrc, 'Second avatar should be different').not.toHaveAttribute('src', firstAvatarSrc);

    // 保存第二张头像
    await page.click('[aria-label="save-settings-button"]');
    await page.waitForSelector('.inline-message-success', { timeout: 5000 });
    await page.waitForTimeout(300);

    // 刷新验证
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const finalAvatarSrc = page.locator('.avatar-section .ant-avatar img');
    await expect(finalAvatarSrc, 'Final avatar should be the second one').toHaveAttribute('src', secondAvatarSrc);
    expect(finalAvatarSrc).not.toBe(firstAvatarSrc);
  });

  test('应该能移除头像', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '移除头像用户');

    // 上传头像
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const fileInput = page.locator('.avatar-actions input[type="file"]');
    await fileInput.setInputFiles(testAvatarPath);
    await page.waitForTimeout(1000);

    // 保存头像
    await page.click('[aria-label="save-settings-button"]');
    await page.waitForSelector('.inline-message-success', { timeout: 5000 });
    await page.waitForTimeout(300);

    // 验证头像已上传
    const avatarImg = page.locator('.avatar-section .ant-avatar img');
    const hasImgBefore = await avatarImg.count();
    expect(hasImgBefore, 'Should have img before removal').toBeGreaterThan(0);

    // 移除头像
    await page.click('[aria-label="remove-avatar-button"]');
    await page.waitForTimeout(300);

    // 保存
    await page.click('[aria-label="save-settings-button"]');
    await page.waitForSelector('.inline-message-success', { timeout: 5000 });
    await page.waitForTimeout(300);

    // 刷新验证
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    const avatarImgAfter = page.locator('.avatar-section .ant-avatar img');
    const hasImgAfter = await avatarImgAfter.count();
    expect(hasImgAfter, 'Should not have img after removal').toBe(0);
  });

  test('应该能上传头像后立即显示预览', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '头像预览测试用户');

    // 再次导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // 上传头像（不保存）
    const fileInput = page.locator('.avatar-actions input[type="file"]');
    await fileInput.setInputFiles(testAvatarPath);

    // 等待预览显示
    await page.waitForTimeout(1000);

    // 验证预览立即显示（不刷新页面）
    const avatarImg = page.locator('.avatar-section .ant-avatar img');
    const avatarSrc = avatarImg;
    await expect(avatarSrc, 'Avatar should be immediately previewed').toHaveAttribute('src', );
    expect(avatarSrc?.startsWith('data:image')).toBe(true);
  });
});
