import { test, expect, type Page } from '@playwright/test';

/**
 * 设置用户信息的辅助函数
 * 先访问 wechat 页面触发 store 初始化，设置 localStorage，然后重新加载 center 页面
 */
async function setupUserInfo(
  page: Page,
  username: string = '测试用户',
  peerId: string = 'test-peer-123',
) {
  // 先访问 wechat 页面让 store 初始化
  await page.goto('/wechat');
  await page.waitForTimeout(100);

  // 设置用户信息到 localStorage
  await page.evaluate(
    ({ username, peerId }: { username: string; peerId: string }) => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username,
          avatar: null,
          peerId,
        }),
      );
    },
    { username, peerId },
  );

  // 然后访问 center 页面
  await page.goto('/center');
}

/**
 * 清除用户信息的辅助函数
 */
async function clearUserInfo(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem('p2p_user_info');
  });
}

test.describe('发现中心页面 - 基础渲染', () => {
  test.beforeEach(async ({ page }) => {
    await setupUserInfo(page);
    // 等待页面完全加载
    await page.waitForTimeout(500);
  });

  test('应该显示页面核心组件和用户信息', async ({ page }) => {
    // 验证页面标题
    await expect(page.getByText('发现中心').nth(1)).toBeVisible();

    // 验证我的信息卡片和用户信息
    await expect(page.getByText('我的信息').first()).toBeVisible();
    await expect(page.getByText('测试用户')).toBeVisible();
    await expect(page.getByText('test-peer-123')).toBeVisible();

    // 验证刷新按钮、输入框和操作按钮
    await expect(page.getByRole('button', { name: '刷新' })).toBeVisible();
    await expect(page.getByPlaceholder('Peer ID')).toBeVisible();
    await expect(page.getByRole('button', { name: '查询' })).toBeVisible();
    await expect(page.getByRole('button', { name: /添加/ })).toBeVisible();

    // 验证空状态
    await expect(page.getByText('暂无在线设备')).toBeVisible();
    await expect(page.getByText('去中心化发现中心使用说明')).toBeVisible();

    // 验证连接状态
    await page.waitForTimeout(1000);
    await expect(page.locator('.ant-badge').first()).toBeVisible();
  });
});

test.describe('发现中心页面 - 查询设备功能', () => {
  test.beforeEach(async ({ page }) => {
    await setupUserInfo(page);
  });

  test('点击查询按钮且输入为空时应该显示警告', async ({ page }) => {
    // 点击查询按钮
    await page.getByRole('button', { name: '查询' }).click();

    // 验证警告消息
    await expect(page.getByText('请输入要查询的 Peer ID')).toBeVisible();
  });

  test('输入框按回车应该触发查询', async ({ page }) => {
    const input = page.getByPlaceholder('Peer ID');

    // 输入 Peer ID 并按回车
    await input.fill('some-peer-id');
    await input.press('Enter');

    // 验证有消息提示（可能成功可能失败）
    await expect(page.locator('.ant-message').first()).toBeVisible();
  });

  test('查询失败后输入框应该被清空', async ({ page }) => {
    const input = page.getByPlaceholder('Peer ID');

    // 输入一个不存在的 Peer ID
    await input.fill('non-existent-peer-id-12345');
    await page.getByRole('button', { name: '查询' }).click();

    // 等待一段时间让请求完成
    await page.waitForTimeout(2000);

    // 输入框应该被清空
    const inputValue = await input.inputValue();
    expect(inputValue).toBe('');
  });
});

test.describe('发现中心页面 - 手动添加设备功能', () => {
  test.beforeEach(async ({ page }) => {
    await setupUserInfo(page);
  });

  test('点击添加按钮且输入为空时应该显示警告', async ({ page }) => {
    // 点击添加按钮
    await page.getByRole('button', { name: /添加/ }).click();

    // 验证警告消息
    await expect(page.getByText('请输入要添加的 Peer ID')).toBeVisible();
  });

  test('应该能够手动添加新设备', async ({ page }) => {
    const input = page.getByPlaceholder('Peer ID');

    // 输入新的 Peer ID
    const newPeerId = 'new-device-' + Date.now();
    await input.fill(newPeerId);

    // 点击添加按钮
    await page.getByRole('button', { name: /添加/ }).click();

    // 验证成功消息
    await expect(page.getByText(/已添加设备/)).toBeVisible();

    // 验证输入框被清空
    const inputValue = await input.inputValue();
    expect(inputValue).toBe('');

    // 验证设备出现在列表中
    await expect(page.getByText(newPeerId)).toBeVisible();
  });

  test('添加已存在的设备应该显示提示信息', async ({ page }) => {
    const input = page.getByPlaceholder('Peer ID');
    const existingPeerId = 'duplicate-device-123';

    // 第一次添加
    await input.fill(existingPeerId);
    await page.getByRole('button', { name: /添加/ }).click();
    await page.waitForTimeout(500);

    // 第二次添加相同的设备
    await input.fill(existingPeerId);
    await page.getByRole('button', { name: /添加/ }).click();

    // 验证提示消息
    await expect(page.getByText('该设备已存在')).toBeVisible();
  });
});

test.describe('发现中心页面 - 刷新功能', () => {
  test.beforeEach(async ({ page }) => {
    await setupUserInfo(page);
  });

  test('点击刷新按钮应该刷新设备列表', async ({ page }) => {
    // 点击刷新按钮
    await page.getByRole('button', { name: '刷新' }).click();

    // 验证成功消息
    await expect(page.getByText(/已刷新.*设备/)).toBeVisible();
  });
});

test.describe('发现中心页面 - 设备卡片交互', () => {
  test.beforeEach(async ({ page }) => {
    await setupUserInfo(page);
  });

  test('应该能够在设备列表中看到自己', async ({ page }) => {
    // 等待页面加载完成
    await page.waitForTimeout(500);

    // 查找包含自己 Peer ID 的设备卡片
    await expect(page.locator('.device-card.is-me')).toBeVisible();

    // 验证卡片上有"我"的标签
    await expect(page.locator('.device-card.is-me').getByText('我')).toBeVisible();
  });

  test('点击其他设备卡片应该添加到聊天列表', async ({ page }) => {
    const input = page.getByPlaceholder('Peer ID');
    const newPeerId = 'clickable-device-' + Date.now();

    // 先添加一个设备
    await input.fill(newPeerId);
    await page.getByRole('button', { name: /添加/ }).click();
    await page.waitForTimeout(500);

    // 点击设备卡片（非自己的）
    const deviceCard = page.locator('.device-card').filter({ hasText: newPeerId });
    await deviceCard.click();

    // 验证成功消息
    await expect(page.getByText(/已添加.*到聊天列表/)).toBeVisible();
  });

  test('点击自己的设备卡片不应该触发聊天创建', async ({ page }) => {
    // 等待页面加载
    await page.waitForTimeout(500);

    // 获取初始的消息数量
    const initialCount = await page.getByText(/已添加.*到聊天列表/).count();

    // 点击自己的设备卡片
    await page.locator('.device-card.is-me').click();

    // 不应该显示新的添加到聊天列表的消息
    const finalCount = await page.getByText(/已添加.*到聊天列表/).count();
    expect(finalCount).toBe(initialCount);
  });

  test('设备卡片应该显示在线状态', async ({ page }) => {
    // 等待页面加载
    await page.waitForTimeout(500);

    // 检查设备卡片有在线状态标记
    const statusBadges = page.locator('.device-card .ant-badge-status-processing');
    const count = await statusBadges.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('发现中心页面 - 用户信息边界情况', () => {
  test('未设置用户名时应该显示"未设置"', async ({ page }) => {
    await page.goto('/wechat');
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: '',
          avatar: null,
          peerId: 'test-peer-123',
        }),
      );
    });
    await page.goto('/center');

    await expect(page.getByText('未设置')).toBeVisible();
  });

  test('没有存储用户信息时应该正常显示页面', async ({ page }) => {
    await page.goto('/wechat');
    await clearUserInfo(page);
    await page.goto('/center');

    // 页面应该正常加载
    await expect(page.getByText('发现中心')).toBeVisible();
  });

  test('长用户名应该正确显示', async ({ page }) => {
    const longUsername = '这是一个非常非常非常非常非常长的用户名用于测试显示效果';
    await setupUserInfo(page, longUsername, 'test-peer-123');

    // 用户名应该被显示
    await expect(page.getByText(longUsername)).toBeVisible();
  });
});




test.describe('发现中心页面 - 用户名必填检查', () => {
  test('首次进入发现中心时应该弹出用户设置弹窗', async ({ page }) => {
    // 清除用户信息
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.removeItem('p2p_user_info');
    });

    // 访问发现中心页面
    await page.goto('/center');
    // 等待页面加载完成
    await page.waitForTimeout(2000);

    // 应该显示设置弹窗
    await expect(page.getByText('设置用户信息')).toBeVisible();
    await expect(page.getByText('用户名')).toBeVisible();
  });

  test('用户名必填，不能不填', async ({ page }) => {
    // 清除用户信息并访问页面
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.removeItem('p2p_user_info');
    });
    await page.goto('/center');
    await page.waitForTimeout(2000);

    // 尝试不输入用户名直接提交
    await page.getByRole('button', { name: '完成' }).click();

    // 应该显示警告
    await expect(page.getByText('请输入用户名')).toBeVisible();

    // 弹窗应该仍然显示
    await expect(page.getByText('设置用户信息')).toBeVisible();
  });

  test('填写用户名后应该能成功关闭弹窗', async ({ page }) => {
    // 清除用户信息并访问页面
    await page.goto('/wechat');
    await page.evaluate(() => {
      localStorage.removeItem('p2p_user_info');
    });
    await page.goto('/center');
    await page.waitForTimeout(2000);

    // 输入用户名
    const usernameInput = page.getByPlaceholder('请输入用户名');
    await usernameInput.fill('测试用户');

    // 提交
    await page.getByRole('button', { name: '完成' }).click();

    // 应该显示成功消息
    await expect(page.getByText('设置完成')).toBeVisible();

    // 弹窗应该关闭
    await expect(page.getByText('设置用户信息')).not.toBeVisible();
  });

});
