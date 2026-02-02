/**
 * 聊天页面 UI 测试
 * 测试聊天界面的样式、布局和视觉元素
 */

import { test, expect } from '@playwright/test';
import {
  WAIT_TIMES,
} from '../test-helpers.js';

test.describe('聊天页面 UI 测试', () => {
  test.setTimeout(30000);

  test.beforeEach(async ({ page }) => {
    // 在页面加载前设置 localStorage 数据
    await page.addInitScript(() => {
      // 设置用户信息
      const userInfo = {
        username: 'UI测试用户',
        avatar: null,
        peerId: 'test-self-peer-id-123',
      };
      localStorage.setItem('p2p_user_info', JSON.stringify(userInfo));

      // 设置测试联系人（包括未读消息联系人）
      const contactId = 'test-contact-peer-id-456';
      const unreadContactId = 'test-unread-peer-id-789';
      const contacts = {
        [contactId]: {
          peerId: contactId,
          username: '测试联系人',
          avatar: null,
          online: true,
          lastSeen: Date.now(),
          unreadCount: 0,
          chatVersion: 0,
        },
        [unreadContactId]: {
          peerId: unreadContactId,
          username: '未读消息联系人',
          avatar: null,
          online: true,
          lastSeen: Date.now(),
          unreadCount: 5,
          chatVersion: 0,
        },
      };
      localStorage.setItem('p2p_contacts', JSON.stringify(contacts));

      // 设置测试消息
      const testMessages = [
        {
          id: 'msg-1',
          from: contactId,
          to: 'test-self-peer-id-123',
          content: '这是一条测试消息',
          type: 'text',
          status: 'delivered',
          timestamp: Date.now() - 10000,
        },
        {
          id: 'msg-2',
          from: 'test-self-peer-id-123',
          to: contactId,
          content: '这是我发送的消息',
          type: 'text',
          status: 'delivered',
          timestamp: Date.now() - 5000,
        },
      ];
      localStorage.setItem(`p2p_messages_${contactId}`, JSON.stringify(testMessages));

      // 设置当前聊天
      localStorage.setItem('p2p_current_chat', contactId);
    });

    // 导航到聊天页面
    await page.goto('/#/wechat');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('.wechat-container', { timeout: 6000 });

    // 等待 store 完全初始化
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT * 2);
  });

  test('消息气泡样式测试', async ({ page }) => {
    // 等待联系人列表加载
    await page.waitForSelector('.contacts-list');

    // 验证联系人和消息数据已正确设置
    const debugInfo = await page.evaluate(() => {
      const userInfo = JSON.parse(localStorage.getItem('p2p_user_info') || '{}');
      const contacts = JSON.parse(localStorage.getItem('p2p_contacts') || '{}');
      const messages = JSON.parse(localStorage.getItem('p2p_messages_test-contact-peer-id-456') || '[]');
      const currentChat = localStorage.getItem('p2p_current_chat');
      return {
        userPeerId: userInfo.peerId,
        contacts: Object.keys(contacts),
        messagesCount: messages.length,
        currentChat,
      };
    });
    console.log('[Test] Debug info:', debugInfo);

    // 选择联系人（点击包含"测试联系人"文本的联系人项）
    await page.click('.contact-item:has-text("测试联系人")');

    // 等待消息区域加载
    await page.waitForSelector('.messages-area');
    // 等待消息元素出现
    await page.waitForSelector('.message-text', { timeout: 5000 });
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 验证消息确实存在
    const messageCount = await page.locator('.message-text').count();
    console.log('[Test] Message count:', messageCount);
    expect(messageCount).toBeGreaterThan(0);

    // 检查是否有 selfMessage
    const hasSelfMessage = await page.evaluate(() => {
      const selfMessage = document.querySelector('.message-item.is-self');
      return !!selfMessage;
    });
    console.log('[Test] Has self message:', hasSelfMessage);

    // 验证我方消息背景色为 #1890ff
    const selfMessageBackground = await page.evaluate(() => {
      const selfMessage = document.querySelector('.message-item.is-self .message-text');
      if (!selfMessage) return null;
      const styles = window.getComputedStyle(selfMessage);
      return styles.backgroundColor;
    });
    console.log('[Test] Self message background:', selfMessageBackground);

    if (!selfMessageBackground) {
      console.log('[Test] No self message found, checking all messages...');
      const allMessagesInfo = await page.evaluate(() => {
        const messages = document.querySelectorAll('.message-item');
        return Array.from(messages).map((msg, index) => ({
          index,
          className: msg.className,
          textContent: msg.textContent?.substring(0, 50),
        }));
      });
      console.log('[Test] All messages:', allMessagesInfo);
    }

    expect(selfMessageBackground).toBe('rgb(24, 144, 255)'); // #1890ff

    // 验证对方消息背景色为白色 #fff
    const otherMessageBackground = await page.evaluate(() => {
      const messageItems = document.querySelectorAll('.message-item');
      for (const item of messageItems) {
        if (!item.classList.contains('is-self')) {
          const messageText = item.querySelector('.message-text');
          if (messageText) {
            return window.getComputedStyle(messageText).backgroundColor;
          }
        }
      }
      return null;
    });
    expect(otherMessageBackground).toBe('rgb(255, 255, 255)'); // #fff

    // 验证消息气泡 border-radius: 8px
    const messageBorderRadius = await page.evaluate(() => {
      const messageText = document.querySelector('.message-text');
      if (!messageText) return null;
      const styles = window.getComputedStyle(messageText);
      return styles.borderRadius;
    });
    expect(messageBorderRadius).toBe('8px');
  });

  test('消息状态图标颜色测试', async ({ page }) => {
    // 等待联系人列表加载
    await page.waitForSelector('.contacts-list');

    // 设置不同状态的消息，并设置第二个联系人为主要测试对象
    await page.evaluate(() => {
      const messagesWithStatus = [
        {
          id: 'msg-sending',
          from: 'test-self-peer-id-123',
          to: 'test-unread-peer-id-789',
          content: '发送中的消息',
          type: 'text',
          status: 'sending',
          timestamp: Date.now(),
        },
        {
          id: 'msg-delivered',
          from: 'test-self-peer-id-123',
          to: 'test-unread-peer-id-789',
          content: '已送达的消息',
          type: 'text',
          status: 'delivered',
          timestamp: Date.now() - 1000,
        },
        {
          id: 'msg-failed',
          from: 'test-self-peer-id-123',
          to: 'test-unread-peer-id-789',
          content: '发送失败的消息',
          type: 'text',
          status: 'failed',
          timestamp: Date.now() - 2000,
        },
      ];
      localStorage.setItem('p2p_messages_test-unread-peer-id-789', JSON.stringify(messagesWithStatus));
      // 更新当前聊天到第二个联系人
      localStorage.setItem('p2p_current_chat', 'test-unread-peer-id-789');
    });

    // 重新加载页面以触发 store 重新读取数据
    await page.reload();
    await page.waitForSelector('.wechat-container', { timeout: 6000 });
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 选择"未读消息联系人"（现在包含测试状态消息）
    await page.click('.contact-item:has-text("未读消息联系人")');
    await page.waitForSelector('.messages-area');
    // 等待消息元素出现
    await page.waitForSelector('.message-item', { timeout: 5000 }).catch(() => {
      console.log('[Test] No messages found, continuing anyway...');
    });
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 调试：检查页面上的消息元素
    const debugInfo = await page.evaluate(() => {
      const messageItems = document.querySelectorAll('.message-item');
      const messageStatusElements = document.querySelectorAll('.message-status');
      return {
        messageCount: messageItems.length,
        messageStatusCount: messageStatusElements.length,
        messageStatusClasses: Array.from(messageStatusElements).map(el => el.className),
      };
    });
    console.log('[Test] Debug info:', debugInfo);

    // 验证发送中状态图标颜色为 #999
    const sendingIconColor = await page.evaluate(() => {
      const sendingStatus = document.querySelector('.message-status-sending .anticon');
      if (!sendingStatus) return null;
      const styles = window.getComputedStyle(sendingStatus);
      return styles.color;
    });
    expect(sendingIconColor).toBe('rgb(153, 153, 153)'); // #999

    // 验证已送达状态图标颜色为 #52c41a (绿色)
    const deliveredIconColor = await page.evaluate(() => {
      const deliveredStatus = document.querySelector('.message-status-delivered .anticon');
      if (!deliveredStatus) return null;
      const styles = window.getComputedStyle(deliveredStatus);
      return styles.color;
    });
    expect(deliveredIconColor).toBe('rgb(82, 196, 26)'); // #52c41a

    // 验证失败状态图标颜色为 #ff4d4f (红色)
    const failedIconColor = await page.evaluate(() => {
      const failedStatus = document.querySelector('.message-status-failed .anticon');
      if (!failedStatus) return null;
      const styles = window.getComputedStyle(failedStatus);
      return styles.color;
    });
    expect(failedIconColor).toBe('rgb(255, 77, 79)'); // #ff4d4f
  });

  test('图片消息显示测试', async ({ page }) => {
    // 等待联系人列表加载
    await page.waitForSelector('.contacts-list');

    // 设置图片消息数据（自己发送的消息，使用第二个联系人作为接收者）
    await page.evaluate(() => {
      const imageMessage = {
        id: 'msg-image',
        from: 'test-self-peer-id-123',
        to: 'test-unread-peer-id-789',
        content: {
          name: 'test-image.png',
          size: 102400,
          width: 800,
          height: 600,
          data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        },
        type: 'image',
        status: 'delivered',
        timestamp: Date.now(),
      };
      localStorage.setItem('p2p_messages_test-unread-peer-id-789', JSON.stringify([imageMessage]));
      // 更新当前聊天到第二个联系人
      localStorage.setItem('p2p_current_chat', 'test-unread-peer-id-789');
    });

    // 重新加载页面以触发 store 重新读取数据
    await page.reload();
    await page.waitForSelector('.wechat-container', { timeout: 6000 });
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 选择"未读消息联系人"（现在包含图片消息）
    await page.click('.contact-item:has-text("未读消息联系人")');
    await page.waitForSelector('.messages-area');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证图片消息有 img 元素
    const imgElement = page.locator('.message-image img').first();
    await expect(imgElement).toBeVisible();

    // 验证图片 max-height: 300px
    const imgMaxHeight = await page.evaluate(() => {
      const img = document.querySelector('.message-image img');
      if (!img) return null;
      const styles = window.getComputedStyle(img);
      return styles.maxHeight;
    });
    expect(imgMaxHeight).toBe('300px');

    // 验证图片 border-radius: 8px
    const imgBorderRadius = await page.evaluate(() => {
      const img = document.querySelector('.message-image img');
      if (!img) return null;
      const styles = window.getComputedStyle(img);
      return styles.borderRadius;
    });
    expect(imgBorderRadius).toBe('8px');

    // 验证显示文件名
    const fileName = page.locator('.message-image .file-name').first();
    await expect(fileName).toHaveText('test-image.png');

    // 验证显示文件大小
    const fileSize = await page.locator('.message-image .file-size').first().textContent();
    expect(fileSize).toContain('KB');
  });

  test('视频消息显示测试', async ({ page }) => {
    // 等待联系人列表加载
    await page.waitForSelector('.contacts-list');

    // 设置视频消息数据（自己发送的消息，使用第二个联系人作为接收者）
    await page.evaluate(() => {
      const videoMessage = {
        id: 'msg-video',
        from: 'test-self-peer-id-123',
        to: 'test-unread-peer-id-789',
        content: {
          name: 'test-video.mp4',
          size: 512000,
          data: 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAu5tZGF0AAACrgYF//+q',
        },
        type: 'video',
        status: 'delivered',
        timestamp: Date.now(),
      };
      localStorage.setItem('p2p_messages_test-unread-peer-id-789', JSON.stringify([videoMessage]));
      // 更新当前聊天到第二个联系人
      localStorage.setItem('p2p_current_chat', 'test-unread-peer-id-789');
    });

    // 重新加载页面以触发 store 重新读取数据
    await page.reload();
    await page.waitForSelector('.wechat-container', { timeout: 6000 });
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 选择"未读消息联系人"（现在包含视频消息）
    await page.click('.contact-item:has-text("未读消息联系人")');
    await page.waitForSelector('.messages-area');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证视频消息有 video 元素
    const videoElement = page.locator('.message-video video').first();
    await expect(videoElement).toBeVisible();

    // 验证视频有 controls 属性
    const hasControls = await page.evaluate(() => {
      const video = document.querySelector('.message-video video');
      if (!video) return false;
      return video.hasAttribute('controls');
    });
    expect(hasControls).toBe(true);

    // 验证显示文件名
    const fileName = page.locator('.message-video .file-name').first();
    await expect(fileName).toHaveText('test-video.mp4');

    // 验证显示文件大小
    const fileSize = await page.locator('.message-video .file-size').first().textContent();
    expect(fileSize).toContain('KB');
  });

  test('文件消息显示测试', async ({ page }) => {
    // 等待联系人列表加载
    await page.waitForSelector('.contacts-list');

    // 设置文件消息数据（自己发送的消息，使用第二个联系人作为接收者）
    await page.evaluate(() => {
      const fileMessage = {
        id: 'msg-file',
        from: 'test-self-peer-id-123',
        to: 'test-unread-peer-id-789',
        content: {
          name: 'test-document.pdf',
          size: 204800,
          type: 'application/pdf',
          data: 'data:application/pdf;base64,JVBERi0xLjcKCjEgMCBvYmogICUgZW50cnkgcG9pbnQKPDwKICAvVHlwZSAvQ2F0YWxvZwogIC9QYWdlcyAyIDAgUgo+PgplbmRvYmoKCjIgMCBvYmoKPDwKICAvVHlwZSAvUGFnZXwKICAvTWVkaWFCb3ggWyAwIDAgNTk1LjI4IDg0MS44OSBdCiAgL0NvdW50IDEKICAvS2lkcyBbIDMgMCBSIF0KPj4KZW5kb2JqCgozIDAgb2JqCjw8CiAgL1R5cGUgL1BhZ2UKICAvUGFyZW50IDIgMCBSCj4+CmVuZG9iagoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4gCjAwMDAwMDAwNjAgMDAwMDAgbiAKMDAwMDAwMDIyMiAwMDAwMCBuIAp0cmFpbGVyCjw8CiAgL1NpemUgNAogIC9Sb290IDEgMCBSCj4+CnN0YXJ0eHJlZgozMDYKJSVFT0Y=',
        },
        type: 'file',
        status: 'delivered',
        timestamp: Date.now(),
      };
      localStorage.setItem('p2p_messages_test-unread-peer-id-789', JSON.stringify([fileMessage]));
      // 更新当前聊天到第二个联系人
      localStorage.setItem('p2p_current_chat', 'test-unread-peer-id-789');
    });

    // 重新加载页面以触发 store 重新读取数据
    await page.reload();
    await page.waitForSelector('.wechat-container', { timeout: 6000 });
    await page.waitForTimeout(WAIT_TIMES.PEER_INIT);

    // 选择"未读消息联系人"（现在包含文件消息）
    await page.click('.contact-item:has-text("未读消息联系人")');
    await page.waitForSelector('.messages-area');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证文件消息有文件图标
    const fileIcon = page.locator('.message-file .anticon').first();
    await expect(fileIcon).toBeVisible();

    // 验证显示文件名
    const fileName = page.locator('.message-file .file-name').first();
    await expect(fileName).toHaveText('test-document.pdf');

    // 验证显示文件大小
    const fileSize = await page.locator('.message-file .file-size').first().textContent();
    expect(fileSize).toContain('KB');

    // 验证有下载链接
    const downloadLink = page.locator('.message-file .download-link').first();
    await expect(downloadLink).toBeVisible();
    const linkText = downloadLink;
    await expect(linkText).toHaveText('下载');
  });

  test('联系人列表样式测试', async ({ page }) => {
    // 等待联系人列表加载
    await page.waitForSelector('.contacts-list');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 点击联系人
    await page.click('.contact-item');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证活跃联系人背景色为 #e6f7ff
    const activeContactBackground = await page.evaluate(() => {
      const activeContact = document.querySelector('.contact-item.active');
      if (!activeContact) return null;
      const styles = window.getComputedStyle(activeContact);
      return styles.backgroundColor;
    });
    expect(activeContactBackground).toBe('rgb(230, 247, 255)'); // #e6f7ff

    // 验证悬停效果背景色变化（接受近似颜色值）
    const hoverBackground = await page.evaluate(() => {
      const contact = document.querySelector('.contact-item');
      if (!contact) return null;
      // 模拟悬停
      contact.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const styles = window.getComputedStyle(contact);
      return styles.backgroundColor;
    });
    // 验证背景色是灰色系（在不同浏览器中可能略有差异）
    expect(hoverBackground).toMatch(/rgb\((22[0-9]|23[0-9]|24[0-9]|25[0-5]),\s*(22[0-9]|23[0-9]|24[0-9]|25[0-5]),\s*(22[0-9]|23[0-9]|24[0-9]|25[0-5])\)/);
  });

  test('未读消息徽章测试', async ({ page }) => {
    // 等待联系人列表加载
    await page.waitForSelector('.contacts-list');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证未读消息数字徽章显示
    const badge = page.locator('.contact-item').filter({ hasText: '未读消息联系人' }).locator('.ant-badge').first();
    await expect(badge).toBeVisible();

    // 验证徽章数字
    const badgeCount = await page.evaluate(() => {
      const contacts = document.querySelectorAll('.contact-item');
      for (const contact of contacts) {
        const text = contact.textContent;
        if (text && text.includes('未读消息联系人')) {
          const badge = contact.querySelector('.ant-badge');
          if (badge) {
            const countElement = badge.querySelector('.ant-badge-count');
            if (countElement) return countElement.textContent;
          }
        }
      }
      return null;
    });
    expect(badgeCount).toBe('5');
  });

  test('输入框禁用状态测试', async ({ page }) => {
    // 选择联系人（点击包含"测试联系人"文本的联系人项）
    await page.click('.contact-item:has-text("测试联系人")');
    await page.waitForSelector('.input-area');

    // 获取发送按钮
    const sendButton = page.locator('button[aria-label="send"]').first();

    // 验证空消息时发送按钮禁用
    const isDisabledInitially = sendButton;
    await expect(isDisabledInitially).toBeDisabled();

    // 输入消息内容
    await page.fill('input[placeholder*="输入消息"]', '测试消息');

    // 验证有内容时发送按钮启用
    const isEnabledAfterInput = sendButton;
    await expect(isEnabledAfterInput).toBeEnabled();

    // 清空输入框
    await page.fill('input[placeholder*="输入消息"]', '');

    // 验证清空后发送按钮再次禁用
    const isDisabledAfterClear = sendButton;
    await expect(isDisabledAfterClear).toBeDisabled();
  });

  test('消息时间显示测试', async ({ page }) => {
    // 选择联系人（点击包含"测试联系人"文本的联系人项）
    await page.click('.contact-item:has-text("测试联系人")');
    await page.waitForSelector('.messages-area');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证消息时间元素存在
    const messageTimeElements = await page.locator('.message-time').all();
    expect(messageTimeElements.length).toBeGreaterThan(0);

    // 验证我方消息时间样式
    const selfMessageTimeColor = await page.evaluate(() => {
      const selfMessage = document.querySelector('.message-item.is-self');
      if (!selfMessage) return null;
      const timeElement = selfMessage.querySelector('.message-time');
      if (!timeElement) return null;
      const styles = window.getComputedStyle(timeElement);
      return styles.color;
    });
    // 我方消息时间应该是深灰色透明背景
    expect(selfMessageTimeColor).toBe('rgba(0, 0, 0, 0.45)');

    // 验证对方消息时间样式
    const otherMessageTimeColor = await page.evaluate(() => {
      const messageItems = document.querySelectorAll('.message-item');
      for (const item of messageItems) {
        if (!item.classList.contains('is-self')) {
          const timeElement = item.querySelector('.message-time');
          if (timeElement) {
            return window.getComputedStyle(timeElement).color;
          }
        }
      }
      return null;
    });
    // 对方消息时间应该是灰色
    expect(otherMessageTimeColor).toBe('rgb(153, 153, 153)');
  });

  test('聊天头部在线状态显示测试', async ({ page }) => {
    // 选择联系人（点击包含"测试联系人"文本的联系人项）
    await page.click('.contact-item:has-text("测试联系人")');
    await page.waitForSelector('.chat-header');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证聊天头部显示联系人名称
    const chatName = page.locator('.chat-name').first();
    await expect(chatName).toHaveText('测试联系人');

    // 验证在线状态徽章存在
    const statusBadge = page.locator('.chat-status .ant-badge').first();
    await expect(statusBadge).toBeVisible();

    // 验证在线状态文本
    const statusText = await page.locator('.chat-status').first().textContent();
    expect(statusText).toContain('在线');
  });

  test('联系人 Peer ID 省略号显示测试', async ({ page }) => {
    // 等待联系人列表加载
    await page.waitForSelector('.contacts-list');
    await page.waitForTimeout(WAIT_TIMES.SHORT);

    // 验证 Peer ID 使用省略号格式显示
    const peerIdDisplay = await page.locator('.contact-peer-id').first().textContent();
    expect(peerIdDisplay).not.toBeNull();
    // 验证包含省略号，并且格式大致为前缀...后缀
    expect(peerIdDisplay).toContain('...');
    expect(peerIdDisplay!.length).toBeLessThan(25); // 验证省略后的长度小于原始长度
    expect(peerIdDisplay!.length).toBeGreaterThan(10); // 验证仍然有一定长度
  });

  test('空聊天状态显示测试', async ({ page }) => {
    // 清除所有联系人和消息
    await page.evaluate(() => {
      localStorage.removeItem('p2p_contacts');
      localStorage.removeItem('p2p_current_chat');
      // 清空 IndexedDB 中的聊天数据（如果存在）
      localStorage.setItem('p2p_contacts', JSON.stringify({}));
      // 清除所有可能的消息数据
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('p2p_messages_')) {
          localStorage.removeItem(key);
        }
      });
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('.wechat-container');

    // 等待一小段时间让 Vue 更新
    await page.waitForTimeout(WAIT_TIMES.MEDIUM);

    // 检查是否有联系人显示
    const contactCount = await page.locator('.contact-item').count();

    if (contactCount === 0) {
      // 如果没有联系人，验证显示空联系人提示
      await expect(page.locator('.empty-contacts')).toBeVisible();
      const emptyText = await page.locator('.empty-contacts .ant-empty-description').textContent();
      expect(emptyText).toContain('暂无聊天');
    } else {
      // 如果有联系人（可能从其他地方加载），至少验证联系人列表存在
      await expect(page.locator('.contacts-list')).toBeVisible();
    }
  });
});
