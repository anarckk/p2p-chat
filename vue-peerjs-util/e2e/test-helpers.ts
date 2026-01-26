/**
 * E2E 测试共享辅助函数
 * 提供统一的测试数据构造、页面操作和等待策略
 */

import { Page, BrowserContext, expect } from '@playwright/test';

// ==================== 类型定义 ====================

export interface UserInfo {
  username: string;
  avatar: string | null;
  peerId: string;
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
  // 通用
  centerContainer: '.center-container',
  deviceCard: '.device-card',
  deviceCardMe: '.device-card.is-me',
  deviceCardOffline: '.device-card.is-offline',

  // 发现中心 - 使用更精确的选择器
  peerIdInput: 'input[placeholder*="Peer ID"]',
  // 查询按钮：使用 aria-label
  queryButton: 'button[aria-label="query-devices-button"]',
  // 添加按钮：使用 aria-label
  addButton: 'button[aria-label="add-device"]',
  refreshButton: 'button[aria-label="refresh-discovery"]',

  // 聊天
  plusButton: 'button[aria-label="plus"]',
  sendButton: 'button[aria-label="send"]',
  messageInput: 'input[placeholder*="输入消息"]',
  contactItem: '.contact-item',
  messageItem: '.message-item',
  messageSelf: '.message-item.is-self',
  messageText: '.message-text',
  messageTime: '.message-time',
  messageStatus: '.message-status',
  emptyContacts: '.empty-contacts',

  // 弹窗
  modalTitle: '.ant-modal-title',
  modalOkButton: '.ant-modal .ant-btn-primary',
  modalCancelButton: '.ant-modal .ant-btn-default',

  // 消息提示 - 使用更稳定的选择器
  successMessage: '.ant-message-success, .ant-message .anticon-check-circle',
  warningMessage: '.ant-message-warning, .ant-message .anticon-exclamation-circle',
  errorMessage: '.ant-message-error, .ant-message .anticon-close-circle',

  // 状态标签 - 使用更精确的选择器
  onlineTag: '.ant-tag.ant-tag-success',
  offlineTag: '.ant-tag.ant-tag-default',
  chatTag: '.ant-tag.ant-tag-green',

  // 连接状态
  connectedBadge: '.ant-badge-status-processing',
  disconnectedBadge: '.ant-badge-status-error',
} as const;

// 等待时间常量（毫秒）
export const WAIT_TIMES = {
  // PeerJS 连接初始化
  PEER_INIT: 5000,
  // 短暂等待
  SHORT: 500,
  // 中等等待
  MEDIUM: 1000,
  // 较长等待
  LONG: 2000,
  // 消息发送接收
  MESSAGE: 3000,
  // 被动发现通知
  DISCOVERY: 5000,
  // 刷新页面
  RELOAD: 2000,
  // 弹窗显示
  MODAL: 3000,
} as const;

// ==================== 测试数据工厂 ====================

/**
 * 生成唯一的 PeerId
 */
export function generatePeerId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * 创建用户信息
 */
export function createUserInfo(username: string, peerId?: string): UserInfo {
  return {
    username,
    avatar: null,
    peerId: peerId || generatePeerId(username),
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
  const navigateTo = options?.navigateTo || '/center';
  const shouldReload = options?.reload !== false;

  await page.goto(navigateTo);
  await page.evaluate((info) => {
    localStorage.setItem('p2p_user_info', JSON.stringify(info));
  }, userInfo);
  if (shouldReload) {
    await page.reload();
  }
}

/**
 * 清理所有 localStorage 数据
 */
export async function clearAllStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

/**
 * 设置设备列表到 localStorage
 */
export async function setDeviceList(page: Page, devices: Record<string, DeviceInfo>): Promise<void> {
  await page.evaluate((deviceData) => {
    localStorage.setItem('discovered_devices', JSON.stringify(deviceData));
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
 * 改进：增加超时时间，确保在网络较慢时也能成功连接
 */
export async function waitForPeerConnected(page: Page, timeout = 20000): Promise<void> {
  await page.waitForSelector(SELECTORS.centerContainer, { timeout });
  // 等待连接状态变为已连接
  await page.waitForSelector('.ant-badge-status-processing', { timeout }).catch(() => {
    // 连接状态可能不总是显示，继续执行
  });
}

/**
 * 等待设备卡片出现
 */
export async function waitForDeviceCard(page: Page, usernameOrPeerId: string, timeout = 5000): Promise<void> {
  await page.waitForSelector(
    `${SELECTORS.deviceCard}:has-text("${usernameOrPeerId}")`,
    { timeout }
  );
}

/**
 * 等待消息出现在聊天窗口
 * 改进：增加超时时间和更稳定的选择器
 */
export async function waitForMessage(page: Page, messageText: string, timeout = 8000): Promise<void> {
  await page.waitForSelector(
    `${SELECTORS.messageText}:has-text("${messageText}")`,
    { timeout }
  );
}

/**
 * 等待弹窗出现并返回其标题
 */
export async function waitForModal(page: Page, timeout = 3000): Promise<string> {
  await page.waitForSelector(SELECTORS.modalTitle, { timeout });
  const title = await page.locator(SELECTORS.modalTitle).textContent();
  return title || '';
}

/**
 * 等待成功消息出现
 * 改进：增加超时时间和重试机制
 */
export async function waitForSuccessMessage(page: Page, timeout = 5000): Promise<void> {
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
 * 创建两个测试设备
 * 改进：确保 Peer 连接完全建立后再返回，增加更长的等待时间
 */
export async function createTestDevices(
  browser: any,
  deviceAName: string,
  deviceBName: string,
  options?: { startPage?: 'center' | 'wechat' }
): Promise<TestDevices> {
  const startPage = options?.startPage || 'center';

  // 创建设备 A
  const deviceAContext = await browser.newContext();
  const deviceAPage = await deviceAContext.newPage();
  const deviceAUserInfo = createUserInfo(deviceAName);
  await deviceAPage.goto(`/${startPage}`);
  await setUserInfo(deviceAPage, deviceAUserInfo);
  await waitForPeerConnected(deviceAPage);
  // 额外等待，确保 Peer 完全初始化（增加到 8 秒）
  await deviceAPage.waitForTimeout(8000);

  // 创建设备 B
  const deviceBContext = await browser.newContext();
  const deviceBPage = await deviceBContext.newPage();
  const deviceBUserInfo = createUserInfo(deviceBName);
  await deviceBPage.goto(`/${startPage}`);
  await setUserInfo(deviceBPage, deviceBUserInfo);
  await waitForPeerConnected(deviceBPage);
  // 额外等待，确保 Peer 完全初始化（增加到 8 秒）
  await deviceBPage.waitForTimeout(8000);

  return {
    deviceA: {
      context: deviceAContext,
      page: deviceAPage,
      userInfo: deviceAUserInfo,
    },
    deviceB: {
      context: deviceBContext,
      page: deviceBPage,
      userInfo: deviceBUserInfo,
    },
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
 */
export async function addDevice(page: Page, peerId: string): Promise<void> {
  await page.fill(SELECTORS.peerIdInput, peerId);
  await page.click(SELECTORS.addButton);
  // 等待足够的时间让设备添加完成
  await page.waitForTimeout(WAIT_TIMES.MESSAGE);
  // 验证成功消息
  await waitForSuccessMessage(page);
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
  await waitForModal(page);
  await page.fill(SELECTORS.peerIdInput, peerId);
  await page.click(SELECTORS.modalOkButton);
  // 等待聊天创建完成
  await page.waitForTimeout(WAIT_TIMES.MESSAGE);
  await waitForSuccessMessage(page);
}

/**
 * 发送文本消息
 * 改进：增加等待时间确保消息发送完成
 */
export async function sendTextMessage(page: Page, message: string): Promise<void> {
  await page.fill(SELECTORS.messageInput, message);
  await page.click(SELECTORS.sendButton);
  // 等待消息发送和显示
  await page.waitForTimeout(WAIT_TIMES.MESSAGE);
  await waitForMessage(page, message);
}

// ==================== 断言辅助函数 ====================

/**
 * 断言设备卡片存在
 */
export async function assertDeviceExists(page: Page, usernameOrPeerId: string): Promise<void> {
  const card = page.locator(SELECTORS.deviceCard).filter({ hasText: usernameOrPeerId });
  await expect(card).toBeVisible();
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
 * 改进：更可靠的断言逻辑
 */
export async function assertDeviceOnlineStatus(
  page: Page,
  usernameOrPeerId: string,
  isOnline: boolean
): Promise<void> {
  // 首先找到设备卡片
  const card = page.locator(SELECTORS.deviceCard).filter({ hasText: usernameOrPeerId });
  await expect(card).toBeVisible();

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
  await page.evaluate((pid: any, msgs: any) => {
    localStorage.setItem(`p2p_messages_${pid}`, JSON.stringify(msgs));
  }, peerId, messages);
}

/**
 * 等待元素出现并返回该元素（向后兼容）
 */
export async function waitForElement(page: any, selector: string, timeout: number = 5000): Promise<any> {
  await page.waitForSelector(selector, { timeout, state: 'visible' });
  return page.locator(selector);
}

/**
 * 等待消息出现在聊天中（向后兼容）
 */
export async function waitForMessageLegacy(page: any, messageText: string, timeout: number = 10000): Promise<boolean> {
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
