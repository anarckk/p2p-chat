import { test, expect } from '@playwright/test';
import {
  setupUser,
  clearAllStorage,
  WAIT_TIMES,
} from './test-helpers.js';

/**
 * 设置页面测试
 * 测试场景：
 * 1. 可以访问设置页面
 * 2. 可以修改用户名
 * 3. 可以修改头像
 * 4. 可以开启/关闭网络加速
 * 5. 网络加速状态持久化到 LocalStorage
 */
test.describe('设置页面', () => {
  test.setTimeout(30000);

  test.beforeEach(async ({ page }) => {
    // 不清理存储，让用户设置自然进行
  });

  test('应该能访问设置页面', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 等待用户设置弹窗出现并完成设置
    await setupUser(page, '设置测试用户');

    // 再次导航到设置页面（此时用户已设置）
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 验证页面标题（使用更精确的选择器）
    const pageTitle = page.locator('.settings-container .ant-card-head-title').first();
    await expect(pageTitle).toContainText('用户信息');
  });

  test('应该能显示当前用户信息', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '信息查看用户');

    // 再次导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 等待用户信息加载完成
    await page.waitForTimeout(1000);

    // 验证用户名输入框显示当前用户名（使用更精确的选择器）
    const usernameInput = page.locator('.settings-container input[maxlength="20"]');
    const value = await usernameInput.inputValue();
    expect(value).toBe('信息查看用户');
  });

  test('应该能修改用户名', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '原用户名');

    // 再次导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 等待用户信息加载完成
    await page.waitForTimeout(1000);

    // 修改用户名（使用更精确的选择器）
    const usernameInput = page.locator('.settings-container input[maxlength="20"]');
    await usernameInput.clear();
    await usernameInput.fill('新用户名');

    // 点击保存
    const saveButton = page.locator('button[aria-label="save-settings-button"]');
    await saveButton.click();

    // 等待保存成功提示（内联提示）
    await page.waitForSelector('.inline-message-success', { timeout: 3000 });

    // 验证用户名已更新
    const userInfo = await page.evaluate(() => {
      const stored = localStorage.getItem('p2p_user_info');
      return stored ? JSON.parse(stored) : null;
    });

    expect(userInfo).not.toBeNull();
    expect(userInfo.username).toBe('新用户名');
  });

  test('没有修改时保存按钮应该被禁用', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '测试用户');

    // 再次导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 点击保存按钮应该被禁用（因为没有修改）
    const saveButton = page.locator('button[aria-label="save-settings-button"]');
    await expect(saveButton).toBeDisabled();
  });

  test('应该能开启网络加速', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '网络加速测试用户');

    // 再次导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 等待用户信息加载完成
    await page.waitForTimeout(1000);

    // 找到网络加速开关
    const switchSelector = '.network-acceleration-section .ant-switch';
    const switchElement = page.locator(switchSelector);

    // 检查初始状态（应该是关闭的）
    const isInitiallyChecked = await switchElement.isChecked();
    expect(isInitiallyChecked).toBe(false);

    // 点击开启网络加速
    await switchElement.click();

    // 等待开关状态更新
    await page.waitForTimeout(WAIT_TIMES.SHORT);
    const isNowChecked = await switchElement.isChecked();
    expect(isNowChecked).toBe(true);

    // 保存设置
    const saveButton = page.locator('button[aria-label="save-settings-button"]');
    await saveButton.click();

    // 等待保存成功提示（内联提示）
    await page.waitForSelector('.inline-message-success', { timeout: 3000 });

    // 验证网络加速状态已保存
    const networkAccelerationStatus = await page.evaluate(() => {
      return localStorage.getItem('p2p_network_acceleration');
    });

    expect(networkAccelerationStatus).toBe('true');
  });

  test('应该能关闭网络加速', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '网络加速测试用户');

    // 先在 localStorage 中开启网络加速
    await page.evaluate(() => {
      localStorage.setItem('p2p_network_acceleration', 'true');
    });

    // 再次导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 等待用户信息加载完成
    await page.waitForTimeout(1000);

    // 找到网络加速开关
    const switchSelector = '.network-acceleration-section .ant-switch';
    const switchElement = page.locator(switchSelector);

    // 检查初始状态（应该是开启的）
    const isInitiallyChecked = await switchElement.isChecked();
    expect(isInitiallyChecked).toBe(true);

    // 点击关闭网络加速
    await switchElement.click();

    // 等待开关状态更新
    await page.waitForTimeout(WAIT_TIMES.SHORT);
    const isNowChecked = await switchElement.isChecked();
    expect(isNowChecked).toBe(false);

    // 保存设置
    const saveButton = page.locator('button[aria-label="save-settings-button"]');
    await saveButton.click();

    // 等待保存成功提示（内联提示）
    await page.waitForSelector('.inline-message-success', { timeout: 3000 });

    // 验证网络加速状态已保存
    const networkAccelerationStatus = await page.evaluate(() => {
      return localStorage.getItem('p2p_network_acceleration');
    });

    expect(networkAccelerationStatus).toBe('false');
  });

  test('网络加速状态应该持久化', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '持久化测试用户');

    // 再次导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 等待用户信息加载完成
    await page.waitForTimeout(1000);

    // 开启网络加速
    const switchSelector = '.network-acceleration-section .ant-switch';
    const switchElement = page.locator(switchSelector);
    await switchElement.click();

    // 保存设置
    const saveButton = page.locator('button[aria-label="save-settings-button"]');
    await saveButton.click();

    // 等待保存成功（内联提示）
    await page.waitForSelector('.inline-message-success', { timeout: 3000 });

    // 刷新页面
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // 等待用户信息加载完成
    await page.waitForTimeout(1000);

    // 验证开关状态仍然开启
    const isStillChecked = await switchElement.isChecked();
    expect(isStillChecked).toBe(true);
  });

  test('应该能显示网络加速开启时的提示信息', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '提示测试用户');

    // 再次导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 开启网络加速
    const switchSelector = '.network-acceleration-section .ant-switch';
    const switchElement = page.locator(switchSelector);
    await switchElement.click();
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证显示成功提示信息
    const successAlert = page.locator('.network-acceleration-section .ant-alert-info');
    await expect(successAlert).toBeVisible();
    await expect(successAlert).toContainText('网络加速已开启');
  });

  test('应该能显示网络加速关闭时的提示信息', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '提示测试用户');

    // 再次导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 验证显示警告提示信息（默认关闭状态）
    const warningAlert = page.locator('.network-acceleration-section .ant-alert-warning');
    await expect(warningAlert).toBeVisible();
    await expect(warningAlert).toContainText('网络加速已关闭');
  });

  test('点击返回发现中心应该跳转到发现中心页面', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '导航测试用户');

    // 再次导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 找到"返回发现中心"按钮并点击
    const backButton = page.locator('button:has-text("返回发现中心")');
    await backButton.click();

    // 验证跳转到了发现中心页面
    await page.waitForURL('/center');
    expect(page.url()).toContain('/center');
  });

  test('应该能从导航菜单进入设置页面', async ({ page }) => {
    // 先导航到设置页面
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // 完成用户设置
    await setupUser(page, '菜单导航用户');

    // 导航到发现中心
    await page.goto('/center');
    await page.waitForLoadState('domcontentloaded');

    // 点击导航菜单中的"设置"项
    const settingsMenuItem = page.locator('.ant-menu-item:has-text("设置")');
    await settingsMenuItem.click();

    // 验证跳转到了设置页面
    await page.waitForURL('/settings');
    expect(page.url()).toContain('/settings');
  });
});
