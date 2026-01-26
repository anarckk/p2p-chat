/**
 * 发现中心连接状态 E2E 测试
 * 测试 Peer Server 连接状态的准确显示
 */

import { test, expect } from '@playwright/test';
import {
  createUserInfo,
  setUserInfo,
  clearAllStorage,
  SELECTORS,
  WAIT_TIMES,
} from './test-helpers';

test.describe('发现中心连接状态', () => {
  test('应该准确显示与 Peer Server 的连接状态 - 已连接状态验证', async ({ page }) => {
    // 清理存储并设置用户信息
    await page.goto('/center');
    await clearAllStorage(page);

    const userInfo = createUserInfo('连接状态测试用户');
    await setUserInfo(page, userInfo, { reload: true });

    // 等待页面加载
    await page.waitForSelector(SELECTORS.centerContainer, { timeout: 10000 });

    // 等待 PeerId 显示
    await page.waitForSelector(
      '.ant-descriptions-item-label:has-text("我的 Peer ID") + .ant-descriptions-item-content .ant-typography',
      { timeout: 15000 }
    ).catch(() => {
      console.log('[Test] PeerId not ready, continuing...');
    });

    // 额外等待确保 PeerJS 完全初始化
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT + 2000);

    // 验证连接状态存在
    const connectionStatusLocator = page.locator(
      '.ant-descriptions-item-label:has-text("连接状态") + .ant-descriptions-item-content .ant-badge'
    );

    await expect(connectionStatusLocator).toBeVisible({ timeout: 5000 });

    // 获取连接状态文本
    const statusText = await connectionStatusLocator.textContent();

    console.log('[Test] Connection status:', statusText);

    // 关键断言：当 PeerId 显示时，说明 PeerJS 已连接成功
    // 连接状态应该显示"已连接"
    // 如果显示"未连接"，说明存在 bug
    expect(statusText?.trim()).toBe('已连接');

    // 验证 badge 状态是 processing（蓝色动画点）
    await expect(page.locator('.ant-descriptions-item-label:has-text("连接状态") + .ant-descriptions-item-content .ant-badge-status-processing')).toBeVisible();
  });

  test('应该在初始化后显示连接状态', async ({ page }) => {
    // 清理存储
    await page.goto('/center');
    await clearAllStorage(page);

    const userInfo = createUserInfo('初始化状态用户');
    await setUserInfo(page, userInfo, { reload: true });

    // 等待页面加载
    await page.waitForSelector(SELECTORS.centerContainer, { timeout: 10000 });

    // 验证"连接状态"标签存在
    const connectionStatusLabel = page.locator('.ant-descriptions-item-label:has-text("连接状态")');
    await expect(connectionStatusLabel).toBeVisible();

    // 验证连接状态内容存在
    const connectionStatusContent = page.locator(
      '.ant-descriptions-item-label:has-text("连接状态") + .ant-descriptions-item-content'
    );
    await expect(connectionStatusContent).toBeVisible();

    // 验证 badge 组件存在
    const badge = connectionStatusContent.locator('.ant-badge');
    await expect(badge).toBeVisible();
  });

  test('连接状态应该在"我的信息"卡片中显示', async ({ page }) => {
    // 清理存储
    await page.goto('/center');
    await clearAllStorage(page);

    const userInfo = createUserInfo('我的信息卡片用户');
    await setUserInfo(page, userInfo, { reload: true });

    // 等待页面加载
    await page.waitForSelector(SELECTORS.centerContainer, { timeout: 10000 });

    // 验证"我的信息"卡片标题存在
    const myInfoCardTitle = page.locator('.ant-card-head-title:has-text("我的信息")');
    await expect(myInfoCardTitle).toBeVisible();

    // 验证连接状态标签存在（在同一个页面上）
    const connectionStatusLabel = page.locator('.ant-descriptions-item-label:has-text("连接状态")');
    await expect(connectionStatusLabel).toBeVisible();

    // 验证左侧列包含"我的信息"卡片
    // 使用更精确的 DOM 查询来验证连接状态在"我的信息"区域内
    const hasBothInSameCard = await page.evaluate(() => {
      // 查找"我的信息"卡片标题的父元素
      const cardTitle = Array.from(document.querySelectorAll('.ant-card-head-title')).find(
        el => el.textContent?.trim() === '我的信息'
      );
      if (!cardTitle) return false;

      // 找到包含该标题的卡片
      const card = cardTitle.closest('.ant-card');
      if (!card) return false;

      // 检查该卡片是否包含连接状态
      const descriptions = card.querySelectorAll('.ant-descriptions-item-label');
      for (const desc of descriptions) {
        if (desc.textContent?.trim() === '连接状态') {
          return true;
        }
      }
      return false;
    });
    expect(hasBothInSameCard).toBe(true);
  });

  test('应该在 PeerId 显示后才能看到连接状态', async ({ page }) => {
    // 清理存储
    await page.goto('/center');
    await clearAllStorage(page);

    const userInfo = createUserInfo('状态显示顺序用户');
    await setUserInfo(page, userInfo, { reload: true });

    // 等待页面加载
    await page.waitForSelector(SELECTORS.centerContainer, { timeout: 10000 });

    // 首先等待 PeerId 出现
    const peerIdElement = page.locator(
      '.ant-descriptions-item-label:has-text("我的 Peer ID") + .ant-descriptions-item-content .ant-typography'
    );
    await expect(peerIdElement).toBeVisible({ timeout: 15000 });

    // 然后验证连接状态也存在
    const connectionStatus = page.locator(
      '.ant-descriptions-item-label:has-text("连接状态") + .ant-descriptions-item-content .ant-badge'
    );
    await expect(connectionStatus).toBeVisible();
  });

  test('页面刷新后连接状态应该持续显示', async ({ page }) => {
    // 清理存储
    await page.goto('/center');
    await clearAllStorage(page);

    const userInfo = createUserInfo('状态持久化用户');
    await setUserInfo(page, userInfo, { reload: true });

    // 等待页面加载和 PeerJS 初始化
    await page.waitForSelector(SELECTORS.centerContainer, { timeout: 10000 });
    await page.waitForSelector(
      '.ant-descriptions-item-label:has-text("我的 Peer ID") + .ant-descriptions-item-content .ant-typography',
      { timeout: 15000 }
    ).catch(() => {
      console.log('[Test] PeerId not ready, continuing...');
    });
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT + 1000);

    // 验证连接状态存在
    const connectionStatusBefore = page.locator(
      '.ant-descriptions-item-label:has-text("连接状态") + .ant-descriptions-item-content .ant-badge'
    );
    await expect(connectionStatusBefore).toBeVisible();

    // 刷新页面
    await page.reload();

    // 等待页面重新加载
    await page.waitForSelector(SELECTORS.centerContainer, { timeout: 10000 });
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT + 1000);

    // 验证连接状态仍然存在
    const connectionStatusAfter = page.locator(
      '.ant-descriptions-item-label:has-text("连接状态") + .ant-descriptions-item-content .ant-badge'
    );
    await expect(connectionStatusAfter).toBeVisible();
  });

  test('应该验证连接状态与实际 PeerJS 连接状态一致', async ({ page }) => {
    // 清理存储
    await page.goto('/center');
    await clearAllStorage(page);

    const userInfo = createUserInfo('连接状态一致性验证用户');
    await setUserInfo(page, userInfo, { reload: true });

    // 等待页面加载
    await page.waitForSelector(SELECTORS.centerContainer, { timeout: 10000 });

    // 等待 PeerId 显示（说明 PeerJS 已连接）
    await page.waitForSelector(
      '.ant-descriptions-item-label:has-text("我的 Peer ID") + .ant-descriptions-item-content .ant-typography',
      { timeout: 15000 }
    ).catch(() => {
      console.log('[Test] PeerId not ready, continuing...');
    });

    // 额外等待确保连接完成
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT + 2000);

    // 获取 UI 上的连接状态
    const uiConnectionStatus = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('.ant-descriptions-item-label'));
      const statusLabel = labels.find(l => l.textContent?.trim() === '连接状态');
      if (statusLabel) {
        const cell = statusLabel.nextElementSibling;
        const badge = cell?.querySelector('.ant-badge');
        const dot = badge?.querySelector('.ant-badge-status-dot');
        return {
          text: cell?.textContent?.trim(),
          hasProcessingClass: dot?.classList.contains('ant-badge-status-processing') || false,
          hasErrorClass: dot?.classList.contains('ant-badge-status-error') || false,
        };
      }
      return null;
    });

    console.log('[Test] UI Connection Status:', uiConnectionStatus);

    // 关键断言：当 PeerId 显示时（PeerJS 已连接），UI 应该显示"已连接"
    expect(uiConnectionStatus).not.toBeNull();
    expect(uiConnectionStatus?.text).toBe('已连接');
    expect(uiConnectionStatus?.hasProcessingClass).toBe(true);
    expect(uiConnectionStatus?.hasErrorClass).toBe(false);
  });
});
