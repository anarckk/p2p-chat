/**
 * 设置页面 UI 测试
 * 测试设置页面的各种 UI 元素的样式和属性
 */

import { test, expect } from '@playwright/test';
import { setUserInfo, SELECTORS, WAIT_TIMES, setupUser } from '../test-helpers';

test.describe('设置页面 UI 测试', () => {
  test.beforeEach(async ({ page }) => {
    // 导航到设置页面并等待加载
    await page.goto('/#/settings');
    await page.waitForLoadState('domcontentloaded');

    // 检查是否需要设置用户信息
    try {
      await page.waitForSelector('.ant-modal-title', { timeout: WAIT_TIMES.MODAL });
      // 有弹窗，填写用户名
      const usernameInput = page.locator('.ant-modal input[placeholder*="请输入用户名"]');
      await usernameInput.fill('TestUser');
      await page.click('.ant-modal .ant-btn-primary');
      await page.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);
    } catch (error) {
      // 没有弹窗，继续执行
    }

    // 等待设置容器加载
    await page.waitForSelector(SELECTORS.settingsContainer, { timeout: 10000 });
  });

  test('1. 用户名输入框 - 验证 maxlength、show-count、allow-clear 属性', async ({ page }) => {
    // 使用更精确的选择器，避免选择到弹窗中的输入框
    const usernameInput = page.locator('.settings-container input[maxlength="20"]').first();

    // 验证输入框存在
    await expect(usernameInput).toBeVisible();

    // 验证 maxlength 属性
    const maxlength = await usernameInput.getAttribute('maxlength');
    expect(maxlength).toBe('20');

    // 验证 show-count（字符计数显示）- 使用 evaluate 检查
    const hasShowCount = await page.evaluate(() => {
      const input = document.querySelector('.settings-container input[maxlength="20"]');
      if (input) {
        const formItem = input.closest('.ant-form-item');
        return formItem?.querySelector('.ant-input-textarea-show-count, .ant-input-data-count, .ant-input-show-count-suffix') !== null;
      }
      return false;
    });
    expect(hasShowCount).toBe(true);

    // 验证 allow-clear（清空按钮）
    // 清空按钮只在有输入时显示，先输入一些文本
    await usernameInput.fill('Test');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    const hasClearButton = await page.evaluate(() => {
      return document.querySelector('.settings-container .ant-input-clear-icon') !== null;
    });
    expect(hasClearButton).toBe(true);
  });

  test('2. 头像预览显示 - 验证尺寸为 80px', async ({ page }) => {
    const avatar = page.locator('.avatar-section .ant-avatar').first();

    // 验证头像可见
    await expect(avatar).toBeVisible();

    // 验证头像尺寸为 80px
    const avatarSize = await page.evaluate((el) => {
      const avatar = document.querySelector('.avatar-section .ant-avatar');
      if (avatar) {
        const styles = window.getComputedStyle(avatar);
        return {
          width: styles.width,
          height: styles.height,
          fontSize: styles.fontSize,
        };
      }
      return null;
    });
    expect(avatarSize).not.toBeNull();
    expect(avatarSize?.width).toBe('80px');
    expect(avatarSize?.height).toBe('80px');
  });

  test('3. 头像预览显示 - 无头像时显示用户名首字母', async ({ page }) => {
    // 获取当前用户名
    const username = await page.evaluate(() => {
      const input = document.querySelector('input[placeholder*="用户名"]') as HTMLInputElement;
      return input?.value || '';
    });

    const avatar = page.locator('.avatar-section .ant-avatar').first();
    const avatarText = await avatar.textContent();

    // 验证显示的是用户名首字母
    const expectedFirstLetter = username.charAt(0).toUpperCase();
    expect(avatarText).toBe(expectedFirstLetter);
  });

  test('4. 移除头像按钮 - 仅在有头像预览时显示', async ({ page }) => {
    const removeButton = page.locator('button[aria-label="remove-avatar-button"]');

    // 默认情况下（无头像），移除按钮不应显示
    const isVisible = await removeButton.isVisible().catch(() => false);
    expect(isVisible).toBe(false);

    // 如果有头像，验证移除按钮显示为危险样式（红色）
    // 这个测试需要模拟上传头像的场景
    const avatarExists = await page.evaluate(() => {
      const avatar = document.querySelector('.avatar-section .ant-avatar');
      if (avatar) {
        const styles = window.getComputedStyle(avatar);
        return styles.backgroundImage !== 'none';
      }
      return false;
    });

    if (avatarExists) {
      // 如果有头像，验证移除按钮显示且为危险样式
      await expect(removeButton).toBeVisible();
      const dangerClass = await removeButton.getAttribute('class');
      expect(dangerClass).toContain('ant-btn-dangerous');
    }
  });

  test('5. 网络加速提示样式 - 开启时显示 .ant-alert-info', async ({ page }) => {
    // 找到网络加速开关
    const switchElement = page.locator('[aria-label="network-acceleration-switch"]').first();

    // 检查当前状态
    const isChecked = await switchElement.isChecked();

    if (!isChecked) {
      // 如果是关闭状态，先开启它
      await switchElement.click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);
    }

    // 验证显示 info 类型的 Alert
    const infoAlert = page.locator('.network-acceleration-section .ant-alert-info');
    await expect(infoAlert).toBeVisible();

    // 验证消息内容
    const message = await infoAlert.locator('.ant-alert-message').textContent();
    expect(message).toContain('网络加速已开启');
  });

  test('6. 网络加速提示样式 - 关闭时显示 .ant-alert-warning', async ({ page }) => {
    // 找到网络加速开关
    const switchElement = page.locator('[aria-label="network-acceleration-switch"]').first();

    // 检查当前状态
    const isChecked = await switchElement.isChecked();

    if (isChecked) {
      // 如果是开启状态，先关闭它
      await switchElement.click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);
    }

    // 验证显示 warning 类型的 Alert
    const warningAlert = page.locator('.network-acceleration-section .ant-alert-warning');
    await expect(warningAlert).toBeVisible();

    // 验证消息内容
    const message = await warningAlert.locator('.ant-alert-message').textContent();
    expect(message).toContain('网络加速已关闭');
  });

  test('7. 保存按钮状态 - 无修改时按钮禁用', async ({ page }) => {
    const saveButton = page.locator('button[aria-label="save-settings-button"]');

    // 验证保存按钮存在
    await expect(saveButton).toBeVisible();

    // 无修改时，按钮应该是禁用的
    const isDisabled = await saveButton.isDisabled();
    expect(isDisabled).toBe(true);
  });

  test('8. 保存按钮状态 - 有修改时按钮启用', async ({ page }) => {
    const saveButton = page.locator('button[aria-label="save-settings-button"]');
    const usernameInput = page.locator('.settings-container input[maxlength="20"]').first();

    // 获取原始用户名
    const originalUsername = await usernameInput.inputValue();

    // 修改用户名
    await usernameInput.fill(`${originalUsername}Modified`);
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 有修改时，按钮应该是启用的
    const isDisabled = await saveButton.isDisabled();
    expect(isDisabled).toBe(false);
  });

  test('9. 网络日志开关提示 - 验证 Alert 中的跳转链接', async ({ page }) => {
    const switchElement = page.locator('[aria-label="network-logging-switch"]').first();

    // 检查当前状态
    const isChecked = await switchElement.isChecked();

    if (!isChecked) {
      // 如果是关闭状态，先开启它
      await switchElement.click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);
    }

    // 验证 info 类型的 Alert 中有链接
    const infoAlert = page.locator('.network-logging-section .ant-alert-info');
    await expect(infoAlert).toBeVisible();

    // 验证链接存在（使用更宽松的选择器）
    const linkButton = page.locator('.network-logging-section .ant-alert-info button:has-text("查看网络数据日志")');
    await expect(linkButton).toBeVisible();
  });

  test('10. 头像上传提示文字 - 验证提示文字显示', async ({ page }) => {
    const hintText = page.locator('.avatar-hint');

    // 验证提示文字可见
    await expect(hintText).toBeVisible();

    // 验证提示文字内容（使用 trim() 去除前后空格）
    const text = await hintText.textContent();
    expect(text?.trim()).toBe('支持 JPG、PNG 格式，文件大小不超过 2MB');
  });

  test('11. 取消按钮显示 - 仅在有修改时显示', async ({ page }) => {
    // 重新导航到设置页面以确保初始状态一致
    await page.goto('/#/settings');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector(SELECTORS.settingsContainer, { timeout: 10000 });

    const saveButton = page.locator('button[aria-label="save-settings-button"]');

    // 无修改时，保存按钮应该禁用
    expect(await saveButton.isDisabled()).toBe(true);

    // 检查取消按钮数量（应该为 0）
    const cancelButtonCountBefore = await page.locator('.settings-container .action-buttons button:has-text("取 消")').count();
    expect(cancelButtonCountBefore).toBe(0);

    // 修改用户名
    const usernameInput = page.locator('.settings-container input[maxlength="20"]').first();
    const originalUsername = await usernameInput.inputValue();
    await usernameInput.clear();
    await usernameInput.fill(originalUsername + 'X');

    // 等待Vue响应式更新
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 有修改时，保存按钮应该启用
    expect(await saveButton.isDisabled()).toBe(false);

    // 检查取消按钮数量（应该为 1）
    const cancelButtonCountAfter = await page.locator('.settings-container .action-buttons button:has-text("取 消")').count();
    expect(cancelButtonCountAfter).toBe(1);
  });

  test('12. 网络日志开关提示 - 关闭状态下的提示', async ({ page }) => {
    const switchElement = page.locator('[aria-label="network-logging-switch"]').first();

    // 检查当前状态
    const isChecked = await switchElement.isChecked();

    if (isChecked) {
      // 如果是开启状态，先关闭它
      await switchElement.click();
      await page.waitForTimeout(WAIT_TIMES.SHORT);
    }

    // 验证 warning 类型的 Alert
    const warningAlert = page.locator('.network-logging-section .ant-alert-warning');
    await expect(warningAlert).toBeVisible();

    // 验证描述内容包含提示文字
    const description = await warningAlert.locator('.ant-alert-description').textContent();
    expect(description).toContain('网络数据日志');
  });

  test('13. 验证设置页面卡片标题和图标', async ({ page }) => {
    // 验证用户信息卡片
    const userInfoCard = page.locator('.ant-card:has-text("用户信息")');
    await expect(userInfoCard).toBeVisible();

    // 验证网络加速卡片
    const networkAccelerationCard = page.locator('.ant-card:has-text("网络加速")');
    await expect(networkAccelerationCard).toBeVisible();

    // 验证网络数据日志记录卡片
    const networkLoggingCard = page.locator('.ant-card:has-text("网络数据日志记录")');
    await expect(networkLoggingCard).toBeVisible();
  });

  test('14. 验证头像上传按钮', async ({ page }) => {
    // 验证上传按钮存在
    const uploadButton = page.locator('.avatar-actions button:has-text("选择图片")');
    await expect(uploadButton).toBeVisible();

    // 验证上传按钮包含相机 emoji
    const buttonText = await uploadButton.textContent();
    expect(buttonText).toContain('📷');
  });

  test('15. 验证开关组件的标签文本', async ({ page }) => {
    // 验证网络加速开关
    const networkAccelerationSwitch = page.locator('[aria-label="network-acceleration-switch"]');
    await expect(networkAccelerationSwitch).toBeVisible();

    // 验证网络日志开关
    const networkLoggingSwitch = page.locator('[aria-label="network-logging-switch"]');
    await expect(networkLoggingSwitch).toBeVisible();
  });

  test('16. 验证返回发现中心按钮', async ({ page }) => {
    const backButton = page.locator('.action-buttons button:has-text("返回发现中心")');
    await expect(backButton).toBeVisible();
  });
});
