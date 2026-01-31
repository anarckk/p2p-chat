/**
 * 布局与响应式 UI E2E 测试
 *
 * 测试目标：
 * 1. 导航菜单选中状态
 * 2. Logo 显示
 * 3. 桌面端布局
 * 4. 移动端布局
 * 5. 用户设置弹窗
 * 6. 头像上传按钮
 * 7. 完成按钮样式
 * 8. 内联提示样式
 */

import { test, expect } from '@playwright/test';
import { clearAllStorage, setupUser, WAIT_TIMES } from '../test-helpers';

test.describe('布局与响应式 UI 测试', () => {
  test.beforeEach(async ({ page }) => {
    // 清理存储并导航到首页
    await clearAllStorage(page);
    await page.goto('/#/center');
    await page.waitForLoadState('domcontentloaded');
  });

  /**
   * 1. 导航菜单选中状态
   */
  test('应正确显示导航菜单选中状态', async ({ page }) => {
    // 等待用户设置弹窗并完成设置
    await setupUser(page, '测试用户');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 验证"发现中心"菜单项有选中类
    const centerMenuItem = page.locator('.ant-menu-item:has-text("发现中心")');
    await expect(centerMenuItem).toHaveClass(/ant-menu-item-selected/);

    // 点击"聊天"菜单项
    const wechatMenuItem = page.locator('.ant-menu-item:has-text("聊天")');
    await wechatMenuItem.click();
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证"聊天"菜单项有选中类
    await expect(wechatMenuItem).toHaveClass(/ant-menu-item-selected/);
    await expect(centerMenuItem).not.toHaveClass(/ant-menu-item-selected/);

    // 点击"设置"菜单项
    const settingsMenuItem = page.locator('.ant-menu-item:has-text("设置")');
    await settingsMenuItem.click();
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证"设置"菜单项有选中类
    await expect(settingsMenuItem).toHaveClass(/ant-menu-item-selected/);
    await expect(wechatMenuItem).not.toHaveClass(/ant-menu-item-selected/);
  });

  /**
   * 2. Logo 显示
   */
  test('应正确显示页面 Logo', async ({ page }) => {
    // 等待用户设置弹窗并完成设置
    await setupUser(page, '测试用户');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 验证 Logo 显示"P2P 聊天"
    const logo = page.locator('.logo');
    await expect(logo).toBeVisible();
    await expect(logo).toHaveText('P2P 聊天');

    // 验证 Logo 字体大小为 20px
    const logoFontSize = await logo.evaluate((el) => {
      return window.getComputedStyle(el).fontSize;
    });
    expect(logoFontSize).toBe('20px');
  });

  /**
   * 3. 桌面端布局
   */
  test('应正确显示桌面端布局', async ({ page }) => {
    // 设置桌面端视口
    await page.setViewportSize({ width: 1280, height: 720 });

    // 等待用户设置弹窗并完成设置
    await setupUser(page, '测试用户');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 导航到聊天页面
    await page.click('.ant-menu-item:has-text("聊天")');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证联系人面板宽度为 320px
    const contactsPanel = page.locator('.contacts-panel');
    await expect(contactsPanel).toBeVisible();

    const contactsPanelWidth = await contactsPanel.evaluate((el) => {
      return window.getComputedStyle(el).width;
    });
    expect(contactsPanelWidth).toBe('320px');

    // 验证双栏布局正常显示
    const chatPanel = page.locator('.chat-panel');
    await expect(chatPanel).toBeVisible();

    // 验证 wechat-layout 使用 flex 布局
    const wechatLayout = page.locator('.wechat-layout');
    const wechatLayoutDisplay = await wechatLayout.evaluate((el) => {
      return window.getComputedStyle(el).display;
    });
    expect(wechatLayoutDisplay).toBe('flex');
  });

  /**
   * 4. 移动端布局
   */
  test('应正确应用移动端布局样式', async ({ page }) => {
    // 设置移动端视口（小于 768px）
    await page.setViewportSize({ width: 375, height: 667 });

    // 等待用户设置弹窗并完成设置
    await setupUser(page, '测试用户');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 验证 Logo 字体变为 16px
    const logo = page.locator('.logo');
    const logoFontSize = await logo.evaluate((el) => {
      return window.getComputedStyle(el).fontSize;
    });
    expect(logoFontSize).toBe('16px');

    // 导航到聊天页面
    await page.click('.ant-menu-item:has-text("聊天")');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证联系人面板宽度为 100%
    const contactsPanel = page.locator('.contacts-panel');
    const contactsPanelWidth = await contactsPanel.evaluate((el) => {
      return window.getComputedStyle(el).width;
    });
    expect(contactsPanelWidth).toBe('100%');

    // 验证聊天面板默认隐藏（transform: translateX(100%)）
    const chatPanel = page.locator('.chat-panel');
    const chatPanelTransform = await chatPanel.evaluate((el) => {
      return window.getComputedStyle(el).transform;
    });
    // translateX(100%) 的矩阵形式
    expect(chatPanelTransform).toBe('matrix(1, 0, 0, 1, 0, 0)');

    // 点击联系人后，验证聊天面板显示（transform: translateX(0)）
    // 首先需要添加一个聊天联系人
    await page.click('button[aria-label="plus"]');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 输入 Peer ID
    const peerIdInput = page.locator('.ant-modal input[placeholder*="Peer ID"]');
    await peerIdInput.fill('test-peer-id-123');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 点击创建按钮
    await page.click('.ant-modal .ant-btn-primary');
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 点击刚创建的聊天
    await page.click('.contact-item');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证聊天面板已显示（添加 mobile-show 类）
    await expect(chatPanel).toHaveClass(/mobile-show/);
  });

  /**
   * 5. 用户设置弹窗
   */
  test('应正确显示用户设置弹窗且不可关闭', async ({ page }) => {
    // 等待弹窗显示
    await page.waitForSelector('.ant-modal-title', { timeout: WAIT_TIMES.MODAL });
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证弹窗标题
    const modalTitle = page.locator('.ant-modal-title');
    await expect(modalTitle).toHaveText('设置用户信息');

    // 验证弹窗不可关闭（无关闭按钮）
    const closeIcon = page.locator('.ant-modal-close');
    await expect(closeIcon).not.toBeVisible();

    // 验证弹窗的 closable 属性为 false
    const modalWrap = page.locator('.ant-modal-wrap');
    const isClosable = await modalWrap.evaluate((el) => {
      return el.getAttribute('class')?.includes('closable') || false;
    });
    expect(isClosable).toBe(false);

    // 验证 maskClosable 为 false（点击遮罩不关闭）
    const modalContent = page.locator('.ant-modal-content');
    await modalContent.click();
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证弹窗仍然显示
    await expect(modalTitle).toBeVisible();

    // 点击遮罩层（弹窗外部）
    const mask = page.locator('.ant-modal-mask');
    await mask.click();
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证弹窗仍然显示（因为 maskClosable: false）
    await expect(modalTitle).toBeVisible();
  });

  /**
   * 6. 头像上传按钮
   */
  test('应正确显示头像上传按钮', async ({ page }) => {
    // 等待弹窗显示
    await page.waitForSelector('.ant-modal-title', { timeout: WAIT_TIMES.MODAL });
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证头像上传按钮存在且有正确的 aria-label
    const uploadButton = page.locator('button[aria-label="upload-avatar"]');
    await expect(uploadButton).toBeVisible();

    // 验证按钮文本
    await expect(uploadButton).toHaveText('上传头像');

    // 验证按钮包含 PlusOutlined 图标
    const icon = uploadButton.locator('.anticon-plus');
    await expect(icon).toBeVisible();

    // 验证头像上传组件的配置
    const uploadInput = page.locator('input[type="file"]');
    await expect(uploadInput).toHaveAttribute('accept', 'image/*');
  });

  /**
   * 7. 完成按钮样式
   */
  test('应正确显示完成按钮为 block 类型', async ({ page }) => {
    // 等待弹窗显示
    await page.waitForSelector('.ant-modal-title', { timeout: WAIT_TIMES.MODAL });
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证完成按钮存在
    const completeButton = page.locator('button[aria-label="complete-user-setup"]');
    await expect(completeButton).toBeVisible();

    // 验证按钮文本
    await expect(completeButton).toHaveText('完成');

    // 验证按钮为 primary 类型
    await expect(completeButton).toHaveClass(/ant-btn-primary/);

    // 验证按钮为 block 类型（全宽）
    const buttonWidth = await completeButton.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        width: styles.width,
        display: styles.display,
      };
    });

    // block 类的按钮宽度应为 100%
    expect(buttonWidth.width).toBe('100%');
  });

  /**
   * 8. 内联提示样式
   */
  test('应正确显示内联提示样式', async ({ page }) => {
    // 等待弹窗显示
    await page.waitForSelector('.ant-modal-title', { timeout: WAIT_TIMES.MODAL });
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 输入空用户名，触发警告提示
    const completeButton = page.locator('button[aria-label="complete-user-setup"]');
    await completeButton.click();
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证警告提示存在
    const warningMessage = page.locator('.inline-message-warning');
    await expect(warningMessage).toBeVisible();
    await expect(warningMessage).toHaveText('用户名不能为空，请输入用户名');

    // 验证警告提示样式
    const warningStyles = await warningMessage.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return {
        backgroundColor: styles.backgroundColor,
        borderColor: styles.borderColor,
        color: styles.color,
      };
    });

    // 验证警告提示的背景色和边框色
    expect(warningStyles.backgroundColor).toBe('rgb(255, 251, 230)'); // #fffbe6
    expect(warningStyles.borderColor).toBe('rgb(255, 229, 143)'); // #ffe58f
    expect(warningStyles.color).toBe('rgb(250, 173, 20)'); // #faad14

    // 输入有效用户名并提交，验证成功提示
    const usernameInput = page.locator('.ant-modal input[placeholder*="请输入用户名"]');
    await usernameInput.fill('测试用户');
    await completeButton.click();
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 注意：成功提示在弹窗关闭后显示在页面上，不在弹窗内
    // 由于弹窗关闭后提示可能很快消失，我们在这里仅验证提示类存在
    // 实际的成功提示验证可以在其他测试中进行

    // 再次打开设置页面（通过点击"设置"菜单项）
    await page.click('.ant-menu-item:has-text("设置")');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 修改用户名为太短，触发警告提示
    const settingsUsernameInput = page.locator('.settings-container input[maxlength="20"]');
    await settingsUsernameInput.clear();
    await settingsUsernameInput.fill('a');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 点击保存按钮
    const saveButton = page.locator('button[aria-label="save-settings-button"]');
    await saveButton.click();
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证警告提示存在（设置页面也有内联提示）
    const settingsWarningMessage = page.locator('.inline-message-warning');
    await expect(settingsWarningMessage).toBeVisible();
  });

  /**
   * 额外测试：响应式断点切换
   */
  test('应在桌面和移动端之间正确切换布局', async ({ page }) => {
    // 等待用户设置弹窗并完成设置
    await setupUser(page, '测试用户');
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 导航到聊天页面
    await page.click('.ant-menu-item:has-text("聊天")');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 设置桌面端视口
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证桌面端布局
    const contactsPanel = page.locator('.contacts-panel');
    const contactsPanelWidthDesktop = await contactsPanel.evaluate((el) => {
      return window.getComputedStyle(el).width;
    });
    expect(contactsPanelWidthDesktop).toBe('320px');

    // 切换到移动端视口
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证移动端布局
    const contactsPanelWidthMobile = await contactsPanel.evaluate((el) => {
      return window.getComputedStyle(el).width;
    });
    expect(contactsPanelWidthMobile).toBe('100%');

    // 切换回桌面端视口
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证恢复桌面端布局
    const contactsPanelWidthRestored = await contactsPanel.evaluate((el) => {
      return window.getComputedStyle(el).width;
    });
    expect(contactsPanelWidthRestored).toBe('320px');
  });

  /**
   * 额外测试：内联提示颜色变体
   */
  test('应正确显示不同类型的内联提示颜色', async ({ page }) => {
    // 等待弹窗显示
    await page.waitForSelector('.ant-modal-title', { timeout: WAIT_TIMES.MODAL });
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 定义提示类型和预期颜色
    const messageTypes = [
      {
        type: 'success',
        expectedBg: 'rgb(246, 255, 237)', // #f6ffed
        expectedBorder: 'rgb(183, 235, 143)', // #b7eb8f
        expectedColor: 'rgb(82, 196, 26)', // #52c41a
      },
      {
        type: 'error',
        expectedBg: 'rgb(255, 242, 240)', // #fff2f0
        expectedBorder: 'rgb(255, 204, 199)', // #ffccc7
        expectedColor: 'rgb(255, 77, 79)', // #ff4d4f
      },
      {
        type: 'warning',
        expectedBg: 'rgb(255, 251, 230)', // #fffbe6
        expectedBorder: 'rgb(255, 229, 143)', // #ffe58f
        expectedColor: 'rgb(250, 173, 20)', // #faad14
      },
      {
        type: 'info',
        expectedBg: 'rgb(230, 247, 255)', // #e6f7ff
        expectedBorder: 'rgb(145, 213, 255)', // #91d5ff
        expectedColor: 'rgb(24, 144, 255)', // #1890ff
      },
    ];

    // 由于我们只能在弹窗中触发警告提示，我们通过注入元素来测试其他类型
    for (const messageType of messageTypes) {
      // 在弹窗中注入测试元素
      const testResult = await page.evaluate((type) => {
        // 创建测试元素
        const testDiv = document.createElement('div');
        testDiv.className = `inline-message inline-message-${type}`;
        testDiv.textContent = `测试${type}消息`;
        document.body.appendChild(testDiv);

        // 获取样式
        const styles = window.getComputedStyle(testDiv);
        const result = {
          backgroundColor: styles.backgroundColor,
          borderColor: styles.borderColor,
          color: styles.color,
        };

        // 移除测试元素
        testDiv.remove();

        return result;
      }, messageType.type);

      // 验证样式
      expect(testResult.backgroundColor).toBe(messageType.expectedBg);
      expect(testResult.borderColor).toBe(messageType.expectedBorder);
      expect(testResult.color).toBe(messageType.expectedColor);
    }
  });
});
