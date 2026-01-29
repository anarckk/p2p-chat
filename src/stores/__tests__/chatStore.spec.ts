import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useChatStore } from '../chatStore';
import type { Contact, ChatMessage, PendingMessage } from '../../types';

describe('chatStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('初始状态', () => {
    it('应该有正确的初始状态', () => {
      const store = useChatStore();

      expect(store.messages).toBeInstanceOf(Map);
      expect(store.contacts).toBeInstanceOf(Map);
      expect(store.pendingMessages).toBeInstanceOf(Map);
      expect(store.currentChatPeerId).toBeNull();
      expect(store.sortedContacts).toEqual([]);
      expect(store.currentMessages).toEqual([]);
    });
  });

  describe('addOrUpdateContact', () => {
    it('应该添加新联系人', () => {
      const store = useChatStore();

      const contact: Contact = {
        peerId: 'peer-1',
        username: 'User1',
        avatar: null,
        online: true,
        lastSeen: Date.now(),
        unreadCount: 0,
        chatVersion: 0,
      };

      store.addOrUpdateContact(contact);

      expect(store.contacts.get('peer-1')).toEqual(contact);
    });

    it('应该更新现有联系人', () => {
      const store = useChatStore();

      const contact1: Contact = {
        peerId: 'peer-1',
        username: 'User1',
        avatar: null,
        online: false,
        lastSeen: 1000,
        unreadCount: 0,
        chatVersion: 0,
      };

      store.addOrUpdateContact(contact1);

      const contact2: Contact = {
        peerId: 'peer-1',
        username: 'User1Updated',
        avatar: 'new-avatar.png',
        online: true,
        lastSeen: 2000,
        unreadCount: 5,
        chatVersion: 0,
      };

      store.addOrUpdateContact(contact2);

      const saved = store.contacts.get('peer-1');
      expect(saved?.username).toBe('User1Updated');
      expect(saved?.avatar).toBe('new-avatar.png');
      expect(saved?.online).toBe(true);
      expect(saved?.unreadCount).toBe(5);
    });

    it('应该保存到 localStorage', () => {
      const store = useChatStore();

      const contact: Contact = {
        peerId: 'peer-1',
        username: 'User1',
        avatar: null,
        online: true,
        lastSeen: Date.now(),
        unreadCount: 0,
        chatVersion: 0,
      };

      store.addOrUpdateContact(contact);

      const saved = localStorage.getItem('p2p_contacts');
      expect(saved).toBeTruthy();

      const parsed = JSON.parse(saved!);
      expect(parsed['peer-1']).toEqual(contact);
    });
  });

  describe('addMessage', () => {
    it('应该添加消息', () => {
      const store = useChatStore();

      const message: ChatMessage = {
        id: 'msg-1',
        from: 'peer-1',
        to: 'me',
        content: 'Hello',
        timestamp: Date.now(),
        status: 'sending',
        type: 'text',
      };

      store.addMessage('peer-1', message);

      expect(store.messages.get('peer-1')).toEqual([message]);
    });

    it('应该保存到 localStorage', () => {
      const store = useChatStore();

      const message: ChatMessage = {
        id: 'msg-1',
        from: 'peer-1',
        to: 'me',
        content: 'Hello',
        timestamp: Date.now(),
        status: 'sending',
        type: 'text',
      };

      store.addMessage('peer-1', message);

      const saved = localStorage.getItem('p2p_messages_peer-1');
      expect(saved).toBeTruthy();

      const parsed = JSON.parse(saved!);
      expect(parsed).toEqual([message]);
    });

    it('应该追加多条消息到同一联系人', () => {
      const store = useChatStore();

      const msg1: ChatMessage = {
        id: 'msg-1',
        from: 'peer-1',
        to: 'me',
        content: 'Hello',
        timestamp: 1000,
        status: 'sending',
        type: 'text',
      };

      const msg2: ChatMessage = {
        id: 'msg-2',
        from: 'peer-1',
        to: 'me',
        content: 'World',
        timestamp: 2000,
        status: 'sending',
        type: 'text',
      };

      store.addMessage('peer-1', msg1);
      store.addMessage('peer-1', msg2);

      expect(store.messages.get('peer-1')).toEqual([msg1, msg2]);
    });
  });

  describe('updateMessageStatus', () => {
    it('应该更新消息状态', () => {
      const store = useChatStore();

      const message: ChatMessage = {
        id: 'msg-1',
        from: 'peer-1',
        to: 'me',
        content: 'Hello',
        timestamp: Date.now(),
        status: 'sending',
        type: 'text',
      };

      store.addMessage('peer-1', message);
      store.updateMessageStatus('peer-1', 'msg-1', 'delivered');

      const msgs = store.messages.get('peer-1');
      expect(msgs?.[0]?.status).toBe('delivered');
    });
  });

  describe('pendingMessages', () => {
    it('应该添加待发送消息', () => {
      const store = useChatStore();

      const pending: PendingMessage = {
        id: 'pending-1',
        to: 'peer-1',
        content: 'Hello',
        timestamp: Date.now(),
        retryCount: 0,
        type: 'text',
      };

      store.addPendingMessage(pending);

      expect(store.pendingMessages.get('pending-1')).toEqual(pending);
    });

    it('应该删除待发送消息', () => {
      const store = useChatStore();

      const pending: PendingMessage = {
        id: 'pending-1',
        to: 'peer-1',
        content: 'Hello',
        timestamp: Date.now(),
        retryCount: 0,
        type: 'text',
      };

      store.addPendingMessage(pending);
      store.removePendingMessage('pending-1');

      expect(store.pendingMessages.has('pending-1')).toBe(false);
    });

    it('应该获取特定联系人的待发送消息', () => {
      const store = useChatStore();

      const pending1: PendingMessage = {
        id: 'pending-1',
        to: 'peer-1',
        content: 'Hello 1',
        timestamp: Date.now(),
        retryCount: 0,
        type: 'text',
      };

      const pending2: PendingMessage = {
        id: 'pending-2',
        to: 'peer-2',
        content: 'Hello 2',
        timestamp: Date.now(),
        retryCount: 0,
        type: 'text',
      };

      store.addPendingMessage(pending1);
      store.addPendingMessage(pending2);

      const peer1Pending = store.getPendingMessagesForPeer('peer-1');
      expect(peer1Pending).toHaveLength(1);
      expect(peer1Pending[0]?.id).toBe('pending-1');
    });

    it('应该清除特定联系人的所有待发送消息', () => {
      const store = useChatStore();

      const pending1: PendingMessage = {
        id: 'pending-1',
        to: 'peer-1',
        content: 'Hello 1',
        timestamp: Date.now(),
        retryCount: 0,
        type: 'text',
      };

      const pending2: PendingMessage = {
        id: 'pending-2',
        to: 'peer-1',
        content: 'Hello 2',
        timestamp: Date.now(),
        retryCount: 0,
        type: 'text',
      };

      const pending3: PendingMessage = {
        id: 'pending-3',
        to: 'peer-2',
        content: 'Hello 3',
        timestamp: Date.now(),
        retryCount: 0,
        type: 'text',
      };

      store.addPendingMessage(pending1);
      store.addPendingMessage(pending2);
      store.addPendingMessage(pending3);

      const cleared = store.clearPendingMessagesForPeer('peer-1');

      expect(cleared).toHaveLength(2);
      expect(store.pendingMessages.has('pending-1')).toBe(false);
      expect(store.pendingMessages.has('pending-2')).toBe(false);
      expect(store.pendingMessages.has('pending-3')).toBe(true);
    });
  });

  describe('setCurrentChat', () => {
    it('应该设置当前聊天联系人', () => {
      const store = useChatStore();

      store.setCurrentChat('peer-1');

      expect(store.currentChatPeerId).toBe('peer-1');
    });

    it('应该清除联系人未读数', () => {
      const store = useChatStore();

      const contact: Contact = {
        peerId: 'peer-1',
        username: 'User1',
        avatar: null,
        online: true,
        lastSeen: Date.now(),
        unreadCount: 5,
        chatVersion: 0,
      };

      store.addOrUpdateContact(contact);
      store.setCurrentChat('peer-1');

      expect(store.contacts.get('peer-1')?.unreadCount).toBe(0);
    });

    it('应该设置为 null', () => {
      const store = useChatStore();

      store.setCurrentChat('peer-1');
      store.setCurrentChat(null);

      expect(store.currentChatPeerId).toBeNull();
    });
  });

  describe('incrementUnread', () => {
    it('应该增加未读数', () => {
      const store = useChatStore();

      const contact: Contact = {
        peerId: 'peer-1',
        username: 'User1',
        avatar: null,
        online: true,
        lastSeen: Date.now(),
        unreadCount: 2,
        chatVersion: 0,
      };

      store.addOrUpdateContact(contact);
      store.incrementUnread('peer-1');

      expect(store.contacts.get('peer-1')?.unreadCount).toBe(3);
    });

    it('如果正在聊天不应该增加未读数', () => {
      const store = useChatStore();

      const contact: Contact = {
        peerId: 'peer-1',
        username: 'User1',
        avatar: null,
        online: true,
        lastSeen: Date.now(),
        unreadCount: 2,
        chatVersion: 0,
      };

      store.addOrUpdateContact(contact);
      store.setCurrentChat('peer-1');
      store.incrementUnread('peer-1');

      expect(store.contacts.get('peer-1')?.unreadCount).toBe(0);
    });
  });

  describe('sortedContacts', () => {
    it('应该按在线状态和时间排序', () => {
      const store = useChatStore();

      const now = Date.now();

      store.addOrUpdateContact({
        peerId: 'peer-1',
        username: 'Offline User',
        avatar: null,
        online: false,
        lastSeen: now - 10000,
        unreadCount: 0,
        chatVersion: 0,
      });

      store.addOrUpdateContact({
        peerId: 'peer-2',
        username: 'Online User 1',
        avatar: null,
        online: true,
        lastSeen: now - 5000,
        unreadCount: 0,
        chatVersion: 0,
      });

      store.addOrUpdateContact({
        peerId: 'peer-3',
        username: 'Online User 2',
        avatar: null,
        online: true,
        lastSeen: now - 2000,
        unreadCount: 0,
        chatVersion: 0,
      });

      const sorted = store.sortedContacts;
      expect(sorted[0]?.peerId).toBe('peer-3'); // 最新在线
      expect(sorted[1]?.peerId).toBe('peer-2'); // 之前在线
      expect(sorted[2]?.peerId).toBe('peer-1'); // 离线
    });
  });

  describe('loadFromStorage', () => {
    it('应该从 localStorage 加载联系人', () => {
      const store = useChatStore();

      const contacts = {
        'peer-1': {
          peerId: 'peer-1',
          username: 'User1',
          avatar: null,
          online: true,
          lastSeen: Date.now(),
          unreadCount: 0,
        },
      };

      localStorage.setItem('p2p_contacts', JSON.stringify(contacts));
      store.loadFromStorage();

      expect(store.contacts.get('peer-1')).toEqual(contacts['peer-1']);
    });

    it('应该从 localStorage 加载待发送消息', () => {
      const store = useChatStore();

      const pending = {
        'pending-1': {
          id: 'pending-1',
          to: 'peer-1',
          content: 'Hello',
          timestamp: Date.now(),
          retryCount: 0,
        },
      };

      localStorage.setItem('p2p_pending_messages', JSON.stringify(pending));
      store.loadFromStorage();

      expect(store.pendingMessages.get('pending-1')).toEqual(pending['pending-1']);
    });
  });
});
