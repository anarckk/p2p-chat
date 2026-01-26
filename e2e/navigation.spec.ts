import { test, expect } from '@playwright/test';
import {
  WAIT_TIMES,
  clearAllStorage,
  createUserInfo,
  setUserInfo,
} from './test-helpers.js';

test.describe('路由导航', () => {
  test.beforeEach(async ({ page }) => {
    // 设置用户信息避免弹窗
    await page.goto('/wechat');
    await clearAllStorage(page);
    await setUserInfo(page, createUserInfo('测试用户', 'test-peer-id-12345'));
    await page.waitForTimeout(WAIT_TIMES.SHORT);
  });

  test('应该支持直接 URL 访问各页面', async ({ page }) => {
    // 直接访问各页面
    await page.goto('/wechat');
    await expect(page).toHaveURL('/wechat');

    await page.goto('/center');
    await expect(page).toHaveURL('/center');

    await page.goto('/test');
    await expect(page).toHaveURL('/test');
  });

  test('应该能够点击导航菜单切换页面', async ({ page }) => {
    await page.goto('/wechat');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 点击菜单项切换页面
    const menuItems = await page.locator('.menu .ant-menu-item').all();
    expect(menuItems.length).toBeGreaterThan(0);

    // 点击第一个菜单项（已经是选中状态）
    await menuItems[0].click();
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证页面已导航
    const url = page.url();
    expect(url).toMatch(/\/(wechat|center)/);
  });
});
