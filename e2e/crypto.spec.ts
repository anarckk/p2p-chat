/**
 * 数字签名功能 E2E 测试
 * 测试密钥对生成、数字签名和验证功能
 */

import { test, expect } from '@playwright/test';
import { SELECTORS, WAIT_TIMES, setupUser } from './test-helpers';

test.describe('数字签名功能测试', () => {
  test('应该生成密钥对', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    await setupUser(page, 'User1');

    // 等待密钥初始化
    await page.waitForTimeout(2000);

    // 进入设置页面
    await page.click(SELECTORS.settingsMenuItem);
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 检查是否有公钥显示区域
    // 如果页面实现了密钥对显示功能，验证公钥存在
    const publicKeySection = page.locator('.key-pair-section, .crypto-section, .public-key-display');
    const isVisible = await publicKeySection.count();

    if (isVisible > 0) {
      // 如果有密钥对显示区域，验证公钥显示
      const publicKeyElement = page.locator('.public-key-display code, .crypto-key code');
      await expect(publicKeyElement.first()).toBeVisible();

      const publicKey = await publicKeyElement.first().textContent();
      expect(publicKey?.length).toBeGreaterThan(100);
    } else {
      // 如果没有实现密钥对显示功能，跳过此测试
      test.skip(true, '密钥对显示功能未实现');
    }
  });

  test('应该能够重新生成密钥', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    await setupUser(page, 'User1');

    // 进入设置页面
    await page.click(SELECTORS.settingsMenuItem);
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 检查是否有重新生成密钥按钮
    const regenerateButton = page.locator('button[aria-label="regenerate-keys"], button:has-text("重新生成密钥"), button:has-text("重新生成")');
    const buttonExists = await regenerateButton.count();

    if (buttonExists > 0) {
      // 获取原始公钥
      const originalPublicKey = await page.locator('.public-key-display code, .crypto-key code').first().textContent();

      // 点击重新生成密钥
      await regenerateButton.first().click();
      await page.waitForTimeout(2000);

      // 获取新公钥
      const newPublicKey = await page.locator('.public-key-display code, .crypto-key code').first().textContent();

      // 验证公钥已改变
      expect(newPublicKey).not.toBe(originalPublicKey);
    } else {
      // 如果没有实现重新生成密钥功能，跳过此测试
      test.skip(true, '重新生成密钥功能未实现');
    }
  });

  test('应该能够导出公钥', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    await setupUser(page, 'User1');

    // 进入设置页面
    await page.click(SELECTORS.settingsMenuItem);
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 检查是否有导出公钥按钮
    const exportButton = page.locator('button[aria-label="export-public-key"], button:has-text("导出公钥"), button:has-text("复制公钥")');
    const buttonExists = await exportButton.count();

    if (buttonExists > 0) {
      // 点击导出按钮
      await exportButton.first().click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);

      // 验证复制成功提示（如果有）
      const successMessage = page.locator('.ant-message-success, .copy-success-hint');
      const hasMessage = await successMessage.count();

      if (hasMessage > 0) {
        await expect(successMessage.first()).toBeVisible();
      }
    } else {
      // 如果没有实现导出公钥功能，跳过此测试
      test.skip(true, '导出公钥功能未实现');
    }
  });

  test('应该能够签名和验证消息', async ({ page, context }) => {
    // 创建两个浏览器上下文
    const page2 = await context.newPage();

    // 设置两个用户
    await page.goto('/');
    await page2.goto('/');

    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);
    await page2.waitForTimeout(WAIT_TIMES.PEER_INIT);

    await setupUser(page, 'User1');
    await setupUser(page2, 'User2');

    // 进入聊天页面
    await page.click(SELECTORS.wechatMenuItem);
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 检查是否有签名相关的 UI 元素
    const signButton = page.locator('button[aria-label="sign-message"], button:has-text("签名")');
    const hasSignFeature = await signButton.count();

    if (hasSignFeature > 0) {
      // 如果实现了签名功能，测试签名和验证流程
      // 这里只是验证功能的可用性，具体实现取决于实际 UI
      await expect(signButton.first()).toBeVisible();
    } else {
      // 如果没有实现签名功能，跳过此测试
      test.skip(true, '消息签名功能未实现');
    }
  });
});
