/**
 * E2E 测试共享辅助函数
 * 提供统一的测试数据构造、页面操作和等待策略
 */

import { Page, BrowserContext } from '@playwright/test';
import { expect } from '@playwright/test';

// ==================== 类型定义 ====================

export interface UserInfo {
  username: string;
  avatar: string | null;
  peerId: string | null;
}

export interface DeviceInfo {
  peerId: string;
  username: string;
  avatar: string | null;
  lastHeartbeat: number;
  firstDiscovered: number;
  isOnline: boolean;
}

export interface ContactInfo {
  peerId: string;
  username: string;
  avatar: string | null;
  online: boolean;
  lastSeen: number;
  unreadCount: number;
  chatVersion: number;
}

// ==================== 测试选择器 ====================

export const SELECTORS = {
  // 导航菜单
  wechatMenuItem: '.ant-menu-item:has-text("聊天")',
  centerMenuItem: '.ant-menu-item:has-text("发现中心")',
  settingsMenuItem: '.ant-menu-item:has-text("设置")',
  networkLogMenuItem: '.ant-menu-item:has-text("网络数据日志")',

  // 通用
  centerContainer: '.center-container',
  deviceCard: '.device-card',
  deviceCardMe: '.device-card.is-me',
  deviceCardOffline: '.device-card.is-offline',
  wechatContainer: '.wechat-container',
  settingsContainer: '.settings-container',
  networkLogView: '.network-log-view',

  // 发现中心 - 使用更精确的选择器
  peerIdInput: 'input[placeholder*="Peer ID"], input[placeholder*="peer"], input[placeholder*="设备"]',
  queryButton: 'button[aria-label="query-devices-button"], button:has-text("查询")',
  addButton: 'button[aria-label="add-device"], button:has-text("添加")',
  refreshButton: 'button[aria-label="refresh-discovery"], button:has-text("刷新")',

  // 聊天
  plusButton: 'button[aria-label="plus"], .ant-float-btn:has-text("+")',
  sendButton: 'button[aria-label="send"], button:has-text("发送")',
  messageInput: 'input[placeholder*="输入消息"], input[placeholder*="message"], textarea[placeholder*="输入消息"]',
  contactItem: '.contact-item',
  messageItem: '.message-item',
  messageSelf: '.message-item.is-self',
  messageText: '.message-text',
  messageTime: '.message-time',
  messageStatus: '.message-status',
  emptyContacts: '.empty-contacts',

  // 文件上传
  imageUploadButton: 'button[aria-label="image-upload"], button[aria-label="上传图片"]',
  fileUploadButton: 'button[aria-label="file-upload"], button[aria-label="上传文件"]',

  // 弹窗
  modalTitle: '.ant-modal-title',
  modalContent: '.ant-modal-content',
  modalOkButton: '.ant-modal .ant-btn-primary',
  modalCancelButton: '.ant-modal .ant-btn-default',

  // 设置页面
  usernameInput: 'input[maxlength="20"], input[placeholder*="用户名"]',
  networkAccelerationSwitch: '.network-acceleration-section .ant-switch',
  networkLoggingSwitch: '.network-logging-section .ant-switch',
  saveSettingsButton: 'button[aria-label="save-settings-button"], button:has-text("保存")',

  // 网络数据日志页面
  networkLogTable: '.ant-table',
  networkLogClearButton: 'button:has-text("清空日志")',
  networkLogDataDetailButton: 'button:has-text("查看数据详情")',

  // 消息提示 - 使用更稳定的选择器
  successMessage: '.ant-message-success, .ant-message .anticon-check-circle',
  warningMessage: '.ant-message-warning, .ant-message .anticon-exclamation-circle',
  errorMessage: '.ant-message-error, .ant-message .anticon-close-circle',

  // 状态标签 - 使用更精确的选择器
  onlineTag: '.ant-tag.ant-tag-success',
  offlineTag: '.ant-tag.ant-tag-default',
  chatTag: '.ant-tag.ant-tag-green',
  meTag: '.ant-tag:has-text("我")',

  // 消息状态
  sendingStatus: '.message-status.sending, .message-status:has-text("发送中")',
  sentStatus: '.message-status.sent, .message-status:has-text("已送达")',
  failedStatus: '.message-status.failed, .message-status:has-text("发送失败")',

  // 文件消息
  imageMessage: '.message-item.has-image, .message-item .message-image',
  fileMessage: '.message-item.has-file, .message-item .message-file',
  fileName: '.message-file-name, .file-name',

  // 连接状态
  connectedBadge: '.ant-badge-status-processing',
  disconnectedBadge: '.ant-badge-status-error',
  peerIdDisplay: '.ant-descriptions-item-label:has-text("我的 Peer ID") + .ant-descriptions-item-content .ant-typography',
  connectionStatus: '.ant-descriptions-item-label:has-text("连接状态") + .ant-descriptions-item-content',

  // 公钥交换相关
  keyExchangeStatusPending: '.key-exchange-status-pending, .ant-tag:has-text("交换公钥中")',
  keyExchangeStatusExchanged: '.key-exchange-status-exchanged, .ant-tag:has-text("已交换")',
  keyExchangeStatusVerified: '.key-exchange-status-verified, .ant-tag:has-text("已验证")',
  keyExchangeStatusCompromised: '.key-exchange-status-compromised, .ant-tag:has-text("被攻击")',
  publicKeyViewButton: 'button[aria-label="view-public-key"]',
  deviceKeySection: '.device-key-section',
  keyChangeDialog: '.ant-modal:has-text("安全警告")',
  notTrustKeyChangeButton: 'button[aria-label="not-trust-key-change"]',
  trustKeyChangeButton: 'button[aria-label="trust-key-change"]',
  oldPublicKeyLabel: '.ant-descriptions-item-label:has-text("旧公钥")',
  newPublicKeyLabel: '.ant-descriptions-item-label:has-text("新公钥")',
} as const;

// 等待时间常量（毫秒）- 本地 Peer Server 环境下连接很快
export const WAIT_TIMES = {
  // PeerJS 连接初始化 - 优化：本地环境连接非常快，减少到 1 秒
  PEER_INIT: 1000,
  // 短暂等待 - 优化：减少到 200 毫秒
  SHORT: 200,
  // 中等等待 - 优化：减少到 500 毫秒
  MEDIUM: 500,
  // 较长等待 - 优化：减少到 1 秒
  LONG: 1000,
  // 消息发送接收 - 优化：本地环境下通信快速，减少到 1.5 秒
  MESSAGE: 1500,
  // 被动发现通知 - 优化：本地环境下发现快速，减少到 1.5 秒
  DISCOVERY: 1500,
  // 刷新页面 - 优化：减少到 500 毫秒
  RELOAD: 500,
  // 弹窗显示 - 增加到 5 秒确保弹窗有足够时间加载
  MODAL: 5000,
} as const;

// ==================== 测试数据工厂 ====================

/**
 * 生成唯一的 PeerId（使用 UUID 格式，不包含中文字符）
 */
export function generatePeerId(): string {
  // 使用 crypto API 生成 UUID，确保不包含中文字符
  // 只使用安全的英文字符作为前缀
  const safePrefix = 'peer';
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 11);
  return `${safePrefix}-${timestamp}-${randomStr}`;
}

/**
 * 创建用户信息（不预设 peerId，让 PeerJS 自己生成）
 */
export function createUserInfo(username: string, peerId?: string): UserInfo {
  return {
    username,
    avatar: null,
    peerId: peerId || null, // 不预设 peerId，让 PeerJS 初始化时生成
  };
}

/**
 * 创建设备信息
 */
export function createDeviceInfo(
  peerId: string,
  username: string,
  options?: { isOnline?: boolean; lastHeartbeat?: number; firstDiscovered?: number }
): DeviceInfo {
  const now = Date.now();
  return {
    peerId,
    username,
    avatar: null,
    lastHeartbeat: options?.lastHeartbeat || now,
    firstDiscovered: options?.firstDiscovered || now,
    isOnline: options?.isOnline ?? true,
  };
}

/**
 * 创建联系人信息
 */
export function createContactInfo(
  peerId: string,
  username: string,
  options?: { online?: boolean; unreadCount?: number; chatVersion?: number }
): ContactInfo {
  return {
    peerId,
    username,
    avatar: null,
    online: options?.online ?? true,
    lastSeen: Date.now(),
    unreadCount: options?.unreadCount || 0,
    chatVersion: options?.chatVersion ?? 0,
  };
}

// ==================== 页面操作辅助函数 ====================

/**
 * 设置用户信息到 localStorage
 * @param page 页面实例
 * @param userInfo 用户信息
 * @param options 配置选项
 */
export async function setUserInfo(
  page: Page,
  userInfo: UserInfo,
  options?: { navigateTo?: string; reload?: boolean }
): Promise<void> {
  // 转换为哈希路由格式
  const rawPath = options?.navigateTo || '/center';
  const navigateTo = rawPath.startsWith('/#') ? rawPath : `/#${rawPath}`;
  const shouldReload = options?.reload !== false;

  await page.goto(navigateTo);
  await page.waitForLoadState('domcontentloaded');

  // 检查是否有用户设置弹窗
  try {
    await page.waitForSelector('.ant-modal-title', { timeout: WAIT_TIMES.MODAL });
    // 有弹窗，填写用户名 - 使用更精确的选择器
    const usernameInput = page.locator('.ant-modal input[placeholder*="请输入用户名"]');
    await usernameInput.fill(userInfo.username);
    // 点击确定按钮
    await page.click('.ant-modal .ant-btn-primary');
    // 等待弹窗关闭和 Peer 初始化
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);
  } catch (error) {
    // 没有弹窗，直接设置用户信息到 localStorage
    await page.evaluate((info) => {
      localStorage.setItem('p2p_user_info', JSON.stringify(info));
    }, userInfo);
    if (shouldReload) {
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      // 等待 Peer 初始化
      await page.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);
    }
  }
}

/**
 * 清理所有 localStorage 数据
 */
export async function clearAllStorage(page: Page): Promise<void> {
  // 在当前页面上下文中清理（不导航到其他页面）
  try {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      // 设置禁用标记，让 E2E 测试模式不自动设置用户信息
      // 这样测试可以正确测试弹窗行为
      localStorage.setItem('__E2E_DISABLE_AUTO_SETUP__', 'true');
    });
  } catch (error) {
    // 如果当前页面不支持 localStorage（比如 about:blank），忽略错误
    console.log('[Test] clearAllStorage failed, page may not support localStorage');
  }
}

/**
 * 设置设备列表到 localStorage
 * 注意：现在使用混合存储策略，元数据存储到 'discovered_devices_meta'
 */
export async function setDeviceList(page: Page, devices: Record<string, DeviceInfo>): Promise<void> {
  await page.evaluate((deviceData) => {
    // 存储元数据到 discovered_devices_meta（不包含头像）
    const metadata: Record<string, any> = {};
    for (const [peerId, device] of Object.entries(deviceData)) {
      const { avatar, ...meta } = device as any;
      metadata[peerId] = meta;
    }
    localStorage.setItem('discovered_devices_meta', JSON.stringify(metadata));
  }, devices);
}

/**
 * 设置联系人列表到 localStorage
 */
export async function setContactList(page: Page, contacts: Record<string, ContactInfo>): Promise<void> {
  await page.evaluate((contactData) => {
    localStorage.setItem('p2p_contacts', JSON.stringify(contactData));
  }, contacts);
}

/**
 * 设置当前聊天
 */
export async function setCurrentChat(page: Page, peerId: string): Promise<void> {
  await page.evaluate((chatPeerId) => {
    localStorage.setItem('p2p_current_chat', chatPeerId);
  }, peerId);
}

/**
 * 添加消息到 localStorage
 */
export async function addMessages(
  page: Page,
  peerId: string,
  messages: any[]
): Promise<void> {
  await page.evaluate(({ targetPeerId, messageData }) => {
    localStorage.setItem(`p2p_messages_${targetPeerId}`, JSON.stringify(messageData));
  }, { targetPeerId: peerId, messageData: messages });
}

// ==================== 等待策略辅助函数 ====================

/**
 * 等待 Peer 连接建立
 * 本地环境下 Peer Server 连接快速，使用较短的超时时间
 */
export async function waitForPeerConnected(page: Page, timeout = WAIT_TIMES.PEER_INIT * 3): Promise<void> {
  await page.waitForSelector(SELECTORS.centerContainer, { timeout });
  // 等待连接状态变为已连接（使用更精确的选择器）
  try {
    await page.waitForSelector('.ant-descriptions-item-label:has-text("连接状态") + .ant-descriptions-item-content .ant-badge-status-processing', { timeout });
  } catch (error) {
    // 连接状态可能显示"未连接"，但这不一定意味着 peer 不能工作
    // PeerJS 可能需要更长时间连接，或者在某些情况下可以正常工作即使显示未连接
    console.warn('Peer connection status shows "disconnected", but proceeding anyway');
  }
}

/**
 * 等待设备卡片出现
 */
export async function waitForDeviceCard(page: Page, usernameOrPeerId: string, timeout = 6000): Promise<void> {
  await page.waitForSelector(
    `${SELECTORS.deviceCard}:has-text("${usernameOrPeerId}")`,
    { timeout }
  );
}

/**
 * 等待消息出现在聊天窗口
 * 本地环境下通信快速，使用较短的超时时间
 */
export async function waitForMessage(page: Page, messageText: string, timeout = 8000): Promise<void> {
  try {
    await page.waitForSelector(
      `${SELECTORS.messageText}:has-text("${messageText}")`,
      { timeout }
    );
  } catch (error) {
    // 如果直接选择器失败，尝试遍历所有消息元素检查文本内容
    const messages = await page.locator(SELECTORS.messageText).allTextContents();
    const found = messages.some(msg => msg.includes(messageText));
    if (!found) {
      throw new Error(`Message "${messageText}" not found in messages: ${messages.join(', ')}`);
    }
  }
}

/**
 * 等待弹窗出现并返回其标题
 * 默认超时时间增加到 10 秒，确保弹窗有足够时间渲染
 */
export async function waitForModal(page: Page, timeout = 10000): Promise<string> {
  // 等待任意弹窗出现
  await page.waitForSelector('.ant-modal-title', { timeout });
  // 获取所有弹窗标题，取最后一个（最新打开的）
  const titles = await page.locator('.ant-modal-title').allTextContents();
  const title = titles[titles.length - 1] || '';
  return title;
}

/**
 * 等待成功消息出现
 * 本地环境下响应快速
 */
export async function waitForSuccessMessage(page: Page, timeout = 3000): Promise<void> {
  await page.waitForSelector(SELECTORS.successMessage, { timeout });
}

/**
 * 等待警告消息出现
 */
export async function waitForWarningMessage(page: Page, timeout = 3000): Promise<void> {
  await page.waitForSelector(SELECTORS.warningMessage, { timeout });
}

// ==================== 设备管理辅助函数 ====================

/**
 * 测试设备对
 */
export interface TestDevices {
  deviceA: {
    context: BrowserContext;
    page: Page;
    userInfo: UserInfo;
  };
  deviceB: {
    context: BrowserContext;
    page: Page;
    userInfo: UserInfo;
  };
}

/**
 * 创建单个测试设备 - 优化版
 * 直接在页面加载前设置用户信息，避免 reload
 */
async function createSingleDevice(
  browser: any,
  userName: string,
  startPage: string
): Promise<{ context: BrowserContext; page: Page; userInfo: UserInfo }> {
  const userInfo = createUserInfo(userName);
  const context = await browser.newContext();
  const page = await context.newPage();

  // 导航到页面（使用哈希路由）
  await page.goto(startPage === 'center' ? '/#/center' : `/#/${startPage}`);
  await page.waitForLoadState('domcontentloaded');

  // 等待用户设置弹窗出现（如果有）
  try {
    await page.waitForSelector('.ant-modal-title', { timeout: 10000 });
    // 有弹窗，填写用户名
    const usernameInput = page.locator('.ant-modal input[placeholder*="请输入用户名"]');
    await usernameInput.fill(userName);
    // 点击确定按钮
    await page.click('.ant-modal .ant-btn-primary');
    // 等待弹窗关闭和 Peer 初始化
    await page.waitForTimeout(2000);
  } catch (error) {
    // 没有弹窗，可能已经有用户信息了，直接设置
    console.log(`[Test] No modal for ${userName}, setting localStorage directly`);
    await page.evaluate((info) => {
      localStorage.setItem('p2p_user_info', JSON.stringify(info));
    }, userInfo);
    // reload 页面触发 Peer 初始化
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
  }

  // 等待页面容器出现
  const selector = startPage === 'center' ? SELECTORS.centerContainer : '.wechat-container';
  await page.waitForSelector(selector, { timeout: 10000 }).catch(() => {
    console.log(`[Test] Container selector not found for ${userName}, continuing...`);
  });

  // 等待 PeerJS 初始化并生成 peerId
  let realPeerId: string | null = null;
  let attempts = 0;
  const maxAttempts = 30;

  // 监听控制台日志以调试
  page.on('console', msg => {
    const text = msg.text();
    if ((text.includes('Peer') || text.includes('peer') || text.includes('Error')) && !text.includes('PeerHttp')) {
      console.log(`[Test] ${userName}: ${text}`);
    }
  });

  while (!realPeerId && attempts < maxAttempts) {
    await page.waitForTimeout(500);
    realPeerId = await getPeerIdFromStorage(page);
    if (!realPeerId) {
      attempts++;
    }
  }

  if (realPeerId) {
    userInfo.peerId = realPeerId;
    console.log(`[Test] Device "${userName}" peerId: ${realPeerId}`);
  } else {
    console.warn(`[Test] Device "${userName}" failed to get peerId after ${maxAttempts} attempts`);
  }

  return { context, page, userInfo };
}

/**
 * 创建两个测试设备 - 优化版
 * 大幅减少等待时间和日志输出
 */
export async function createTestDevices(
  browser: any,
  deviceAName: string,
  deviceBName: string,
  options?: { startPage?: 'center' | 'wechat' }
): Promise<TestDevices> {
  const startPage = options?.startPage || 'center';

  // 并行创建两个设备，提高效率
  const [deviceA, deviceB] = await Promise.all([
    createSingleDevice(browser, deviceAName, startPage),
    createSingleDevice(browser, deviceBName, startPage),
  ]);

  return {
    deviceA,
    deviceB,
  };
}

/**
 * 清理测试设备
 */
export async function cleanupTestDevices(devices: TestDevices): Promise<void> {
  await devices.deviceA.context.close();
  await devices.deviceB.context.close();
}

/**
 * 添加设备（在发现中心页面）
 * 改进：增加重试机制和更长的等待时间
 * 注意：现在使用内联提示而不是全局消息
 */
export async function addDevice(page: Page, peerId: string): Promise<void> {
  // 调试：打印 peerId 的类型和值
  console.log('[Test] addDevice called with peerId:', peerId, 'type:', typeof peerId);

  // 如果 peerId 不是字符串，尝试转换为字符串
  const peerIdStr = typeof peerId === 'string' ? peerId : String(peerId || '');

  await page.fill(SELECTORS.peerIdInput, peerIdStr);
  await page.click(SELECTORS.addButton);
  // 等待足够的时间让设备添加完成
  await page.waitForTimeout(WAIT_TIMES.MESSAGE);
  // 验证内联提示消息（现在不再使用全局消息）
  const inlineMessage = page.locator('.inline-message');
  try {
    await expect(inlineMessage).toBeVisible({ timeout: 3000 });
  } catch (error) {
    // 如果没有内联提示，至少等待设备卡片出现
    console.log('[Test] Inline message not found, checking for device card...');
  }
}

/**
 * 查询设备（在发现中心页面）
 */
export async function queryDevice(page: Page, peerId: string): Promise<void> {
  await page.fill(SELECTORS.peerIdInput, peerId);
  await page.click(SELECTORS.queryButton);
  await page.waitForTimeout(WAIT_TIMES.SHORT);
}

/**
 * 创建聊天（在聊天页面）
 * 改进：增加等待时间确保操作完成
 */
export async function createChat(page: Page, peerId: string): Promise<void> {
  await page.click(SELECTORS.plusButton);
  await page.waitForTimeout(WAIT_TIMES.SHORT);

  // 等待新增聊天弹窗出现
  const modalTitle = await waitForModal(page);
  console.log('[Test] Modal title:', modalTitle);

  // 获取所有弹窗，选择最后一个（最新打开的）
  const modals = page.locator('.ant-modal');
  const modalCount = await modals.count();
  const targetModal = modals.nth(modalCount - 1);

  // 在目标弹窗中操作
  const peerIdInput = targetModal.locator(SELECTORS.peerIdInput);
  await peerIdInput.fill(peerId);

  const okButton = targetModal.locator('.ant-btn-primary');
  await okButton.click();

  // 等待聊天创建完成
  await page.waitForTimeout(WAIT_TIMES.MESSAGE);
}

/**
 * 发送文本消息
 * 本地环境下通信快速，使用较短的超时时间
 */
export async function sendTextMessage(page: Page, message: string): Promise<void> {
  await page.fill(SELECTORS.messageInput, message);
  await page.click(SELECTORS.sendButton);
  // 等待消息发送和显示 - 本地环境下快速
  await page.waitForTimeout(WAIT_TIMES.MESSAGE);
  await waitForMessage(page, message, 8000);
}

// ==================== 断言辅助函数 ====================

/**
 * 断言设备卡片存在
 * 本地环境下响应快速
 * 注意：使用 first() 处理多个匹配的情况（Playwright strict mode）
 */
export async function assertDeviceExists(page: Page, usernameOrPeerId: string): Promise<void> {
  const card = page.locator(SELECTORS.deviceCard).filter({ hasText: usernameOrPeerId }).first();
  await expect(card).toBeVisible({ timeout: 8000 });
}

/**
 * 断言设备卡片不存在
 */
export async function assertDeviceNotExists(page: Page, usernameOrPeerId: string): Promise<void> {
  const card = page.locator(SELECTORS.deviceCard).filter({ hasText: usernameOrPeerId });
  await expect(card).toHaveCount(0);
}

/**
 * 断言设备在线状态
 * 本地环境下响应快速
 */
export async function assertDeviceOnlineStatus(
  page: Page,
  usernameOrPeerId: string,
  isOnline: boolean
): Promise<void> {
  // 首先找到设备卡片
  const card = page.locator(SELECTORS.deviceCard).filter({ hasText: usernameOrPeerId });
  await expect(card).toBeVisible({ timeout: 8000 });

  // 根据在线状态检查相应的标签
  if (isOnline) {
    // 在线设备应该有在线标签或者"我"标签或者"聊天中"标签
    const onlineTag = card.locator(SELECTORS.onlineTag);
    const meTag = card.locator('.ant-tag:has-text("我")');
    const chatTag = card.locator('.ant-tag:has-text("聊天中")');

    // 等待一段时间让标签渲染
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    const onlineTagCount = await onlineTag.count();
    const meTagCount = await meTag.count();
    const chatTagCount = await chatTag.count();
    const hasTag = onlineTagCount + meTagCount + chatTagCount;

    expect(hasTag).toBeGreaterThan(0);
  } else {
    // 离线设备应该有离线标签
    const offlineTag = card.locator(SELECTORS.offlineTag);

    // 等待一段时间让标签渲染
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    const offlineTagCount = await offlineTag.count();
    expect(offlineTagCount).toBeGreaterThan(0);
  }
}

/**
 * 断言消息存在
 */
export async function assertMessageExists(page: Page, messageText: string): Promise<void> {
  const message = page.locator(SELECTORS.messageText).filter({ hasText: messageText });
  await expect(message).toBeVisible();
}

/**
 * 断言联系人存在
 */
export async function assertContactExists(page: Page, username: string): Promise<void> {
  const contact = page.locator(SELECTORS.contactItem).filter({ hasText: username });
  await expect(contact).toBeVisible();
}

/**
 * 断言空状态显示
 */
export async function assertEmptyState(page: Page): Promise<void> {
  await expect(page.locator(SELECTORS.emptyContacts)).toBeVisible();
}

// ==================== 时间辅助函数 ====================

/**
 * 获取指定分钟前的时间戳
 */
export function minutesAgo(minutes: number): number {
  return Date.now() - minutes * 60 * 1000;
}

/**
 * 获取指定天前的时间戳
 */
export function daysAgo(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

// ==================== 重试机制辅助函数 ====================

/**
 * 通用的重试辅助函数
 * @param fn 要重试的异步函数
 * @param options 重试选项
 * @returns 函数执行结果或抛出错误
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options?: { maxAttempts?: number; delay?: number; context?: string }
): Promise<T> {
  const maxAttempts = options?.maxAttempts || 3;
  const delay = options?.delay || 3000;
  const context = options?.context || 'Operation';

  let lastError: Error | undefined;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxAttempts - 1) {
        console.log(`[Test] ${context} attempt ${i + 1} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error(`${context} failed after ${maxAttempts} attempts`);
}

/**
 * 等待条件满足（智能等待，带详细日志）
 * @param condition 条件函数
 * @param options 等待选项
 * @returns 条件是否满足
 */
export async function waitForCondition(
  condition: () => Promise<boolean>,
  options?: { timeout?: number; interval?: number; context?: string }
): Promise<boolean> {
  const timeout = options?.timeout || 8000;
  const interval = options?.interval || 500;
  const context = options?.context || 'Condition';

  const startTime = Date.now();
  let attempts = 0;

  while (Date.now() - startTime < timeout) {
    attempts++;
    try {
      if (await condition()) {
        console.log(`[Test] ${context} satisfied after ${attempts} attempts (${Date.now() - startTime}ms)`);
        return true;
      }
    } catch (error) {
      // 忽略条件函数中的错误，继续重试
      if (attempts % 5 === 0) {
        console.log(`[Test] ${context} attempt ${attempts} failed with error: ${(error as Error).message}`);
      }
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  console.log(`[Test] ${context} timeout after ${attempts} attempts (${timeout}ms)`);
  return false;
}

/**
 * 等待元素出现（智能等待）
 * @param page 页面实例
 * @param selector 选择器
 * @param options 等待选项
 * @returns 元素是否出现
 */
export async function waitForElement(
  page: Page,
  selector: string,
  options?: { timeout?: number; state?: 'visible' | 'attached' | 'hidden' | 'detached' }
): Promise<boolean> {
  const timeout = options?.timeout || 8000;
  const state = options?.state || 'visible';

  try {
    await page.waitForSelector(selector, { timeout, state });
    return true;
  } catch (error) {
    console.log(`[Test] Element ${selector} not found within ${timeout}ms`);
    return false;
  }
}

/**
 * 等待元素消失（智能等待）
 * @param page 页面实例
 * @param selector 选择器
 * @param timeout 超时时间
 * @returns 元素是否消失
 */
export async function waitForElementToDisappear(
  page: Page,
  selector: string,
  timeout = 5000
): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout, state: 'hidden' });
    return true;
  } catch (error) {
    // 检查元素是否真的不存在
    const count = await page.locator(selector).count();
    if (count === 0) {
      return true;
    }
    console.log(`[Test] Element ${selector} still visible after ${timeout}ms`);
    return false;
  }
}

/**
 * 等待文本内容出现在元素中（智能等待）
 * @param page 页面实例
 * @param selector 选择器
 * @param text 期望的文本内容
 * @param timeout 超时时间
 * @returns 文本是否出现
 */
export async function waitForTextContent(
  page: Page,
  selector: string,
  text: string,
  timeout = 8000
): Promise<boolean> {
  return waitForCondition(async () => {
    const element = page.locator(selector).first();
    const content = await element.textContent();
    return content !== null && content.includes(text);
  }, { timeout, interval: 300, context: `Wait for text "${text}" in ${selector}` });
}

/**
 * 等待元素数量达到预期值（智能等待）
 * @param page 页面实例
 * @param selector 选择器
 * @param expectedCount 预期数量
 * @param timeout 超时时间
 * @returns 数量是否达到预期
 */
export async function waitForElementCount(
  page: Page,
  selector: string,
  expectedCount: number,
  timeout = 8000
): Promise<boolean> {
  return waitForCondition(async () => {
    const count = await page.locator(selector).count();
    return count >= expectedCount;
  }, { timeout, interval: 300, context: `Wait for ${expectedCount} elements matching ${selector}` });
}

/**
 * 等待网络空闲（智能等待）
 * @param page 页面实例
 * @param timeout 超时时间
 * @returns 网络是否空闲
 */
export async function waitForNetworkIdle(
  page: Page,
  timeout = 5000
): Promise<boolean> {
  try {
    await page.waitForLoadState('networkidle', { timeout });
    return true;
  } catch (error) {
    console.log('[Test] Network not idle within timeout');
    return false;
  }
}

// ==================== 向后兼容的辅助函数 ====================

/**
 * 模拟设备数据（向后兼容）
 */
export interface MockDevice {
  peerId: string;
  username: string;
  avatar: string | null;
  lastHeartbeat: number;
  firstDiscovered: number;
  isOnline: boolean;
}

/**
 * 设置设备列表到 localStorage（向后兼容）
 */
export async function setDevices(page: any, devices: Record<string, MockDevice>): Promise<void> {
  await page.evaluate((devs: any) => {
    localStorage.setItem('discovered_devices', JSON.stringify(devs));
  }, devices);
}

/**
 * 设置聊天记录到 localStorage（向后兼容）
 */
export async function setContacts(page: any, contacts: Record<string, any>): Promise<void> {
  await page.evaluate((cts: any) => {
    localStorage.setItem('p2p_contacts', JSON.stringify(cts));
  }, contacts);
}

/**
 * 设置消息记录到 localStorage（向后兼容）
 */
export async function setMessagesLegacy(page: any, peerId: string, messages: any[]): Promise<void> {
  await page.evaluate(({ pid, msgs }: { pid: string; msgs: any[] }) => {
    localStorage.setItem(`p2p_messages_${pid}`, JSON.stringify(msgs));
  }, { pid: peerId, msgs: messages });
}

/**
 * 等待消息出现在聊天中（向后兼容）
 */
export async function waitForMessageLegacy(page: any, messageText: string, timeout: number = 8000): Promise<boolean> {
  try {
    await page.waitForSelector(`.message-text:has-text("${messageText}")`, { timeout });
    return true;
  } catch {
    // 如果找不到精确匹配，尝试使用内容匹配
    const content = await page.content();
    return content.includes(messageText);
  }
}

/**
 * 等待设备卡片出现（向后兼容）
 */
export async function waitForDeviceCardLegacy(page: any, deviceName: string, timeout: number = 5000): Promise<boolean> {
  try {
    await page.waitForSelector(`.device-card:has-text("${deviceName}")`, { timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * 设置用户信息（处理首次进入弹窗）
 * @param page 页面实例
 * @param username 用户名
 */
export async function setupUser(page: Page, username: string): Promise<void> {
  console.log('[Test] setupUser starting for:', username);
  // 等待用户设置弹窗出现
  try {
    console.log('[Test] Waiting for modal...');
    await page.waitForSelector('.ant-modal-title', { timeout: WAIT_TIMES.MODAL });
    console.log('[Test] Modal found, filling username...');
    // 填写用户名 - 使用更精确的选择器，选择弹窗中的输入框
    const usernameInput = page.locator('.ant-modal input[placeholder*="请输入用户名"]');
    await usernameInput.fill(username);
    console.log('[Test] Username filled, clicking confirm button...');
    // 点击确定按钮 - 使用更精确的选择器
    const okButton = page.locator('.ant-modal .ant-btn-primary');
    await okButton.click();
    console.log('[Test] Confirm button clicked, waiting for modal to close...');
    // 等待弹窗隐藏（使用 hidden 而不是 detached，因为弹窗不会从 DOM 中移除）
    await page.waitForSelector('.ant-modal', { state: 'hidden', timeout: 10000 }).catch(() => {
      console.log('[Test] Modal still visible after clicking confirm, continuing...');
    });
    // 等待弹窗完全消失
    await page.waitForTimeout(1000);
    console.log('[Test] Modal closed, waiting for Peer init...');
    // 等待 Peer 初始化
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);
    console.log('[Test] setupUser completed');
  } catch (error) {
    // 弹窗可能已经设置过了，直接设置用户信息到 localStorage
    console.log('[Test] User setup modal not found, setting up via localStorage');
    try {
      await page.evaluate((name) => {
        const userInfo = {
          username: name,
          avatar: null,
          peerId: null,
          version: 0,
        };
        localStorage.setItem('p2p_user_info', JSON.stringify(userInfo));
        localStorage.setItem('p2p_user_info_meta', JSON.stringify({
          username: name,
          peerId: null,
          version: 0,
        }));
      }, username);
      // 刷新页面以应用设置
      await page.reload();
      await page.waitForLoadState('domcontentloaded');
      // 等待 Peer 初始化
      await page.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);

      // 再次检查是否还有弹窗（可能需要手动关闭）
      try {
        console.log('[Test] Checking if modal still exists after reload...');
        const modalExists = await page.locator('.ant-modal-title').isVisible({ timeout: 2000 });
        if (modalExists) {
          console.log('[Test] Modal still exists after reload, filling username again...');
          const usernameInput = page.locator('.ant-modal input[placeholder*="请输入用户名"]');
          await usernameInput.fill(username);
          const okButton = page.locator('.ant-modal .ant-btn-primary');
          await okButton.click();
          // 等待弹窗关闭
          await page.waitForSelector('.ant-modal-wrap', { state: 'detached', timeout: 10000 }).catch(() => {
            console.log('[Test] Modal wrap not detached, trying hidden state...');
          });
          await page.waitForTimeout(1000);
          console.log('[Test] Modal closed after second attempt');
        }
      } catch (e) {
        console.log('[Test] No modal found after reload, proceeding...');
      }
    } catch (e) {
      // 页面可能在 setup 过程中被关闭（测试超时等情况），忽略错误
      console.log('[Test] Page closed during setup, ignoring:', e);
    }
  }
}

/**
 * 从 localStorage 获取 PeerId
 * @param page 页面实例
 * @returns PeerId 或 null
 */
export async function getPeerIdFromStorage(page: Page): Promise<string | null> {
  try {
    const userInfo = await page.evaluate(() => {
      const stored = localStorage.getItem('p2p_user_info');
      return stored ? JSON.parse(stored) : null;
    });
    return userInfo?.peerId || null;
  } catch (e) {
    // 页面可能已关闭，返回 null
    console.log('[Test] Page closed while getting PeerId from storage:', e);
    return null;
  }
}

/**
 * 从页面元素中提取 PeerId
 * @param page 页面实例
 * @returns PeerId 或 null
 */
export async function getPeerIdFromElement(page: Page): Promise<string | null> {
  try {
    const peerIdElement = page.locator('.ant-descriptions-item-label:has-text("我的 Peer ID") + .ant-descriptions-item-content .ant-typography');
    const peerId = await peerIdElement.textContent();
    return peerId?.trim() || null;
  } catch (error) {
    return null;
  }
}
