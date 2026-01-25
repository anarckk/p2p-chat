import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  ChatMessage,
  Contact,
  PendingMessage,
  ProcessedMessageIds,
  MessageType,
  MessageContent,
} from '../types';

const MESSAGES_KEY = 'p2p_messages_';
const CONTACTS_KEY = 'p2p_contacts';
const PENDING_KEY = 'p2p_pending_messages';
const PROCESSED_IDS_KEY = 'p2p_processed_ids';

// 清理过期消息ID的时间间隔（7天）
const CLEANUP_INTERVAL = 7 * 24 * 60 * 60 * 1000;

export const useChatStore = defineStore('chat', () => {
  const messages = ref<Map<string, ChatMessage[]>>(new Map());
  const contacts = ref<Map<string, Contact>>(new Map());
  const pendingMessages = ref<Map<string, PendingMessage>>(new Map());
  const currentChatPeerId = ref<string | null>(null);

  // 已处理的消息ID集合（用于去重）
  const processedMessageIds = ref<Set<string>>(new Set());
  const lastCleanup = ref<number>(Date.now());

  const currentMessages = computed(() => {
    if (!currentChatPeerId.value) return [];
    return messages.value.get(currentChatPeerId.value) || [];
  });

  const sortedContacts = computed(() => {
    return Array.from(contacts.value.values()).sort((a, b) => {
      if (a.online !== b.online) {
        return a.online ? -1 : 1;
      }
      return b.lastSeen - a.lastSeen;
    });
  });

  function loadFromStorage() {
    const contactsData = localStorage.getItem(CONTACTS_KEY);
    if (contactsData) {
      try {
        const parsed = JSON.parse(contactsData);
        contacts.value = new Map(Object.entries(parsed));

        // 为每个联系人加载对应的消息
        contacts.value.forEach((contact, peerId) => {
          loadMessages(peerId);
        });
      } catch (e) {
        console.error('Failed to load contacts:', e);
      }
    }

    const pendingData = localStorage.getItem(PENDING_KEY);
    if (pendingData) {
      try {
        const parsed = JSON.parse(pendingData);
        pendingMessages.value = new Map(Object.entries(parsed));
      } catch (e) {
        console.error('Failed to load pending messages:', e);
      }
    }

    const processedIdsData = localStorage.getItem(PROCESSED_IDS_KEY);
    if (processedIdsData) {
      try {
        const parsed: ProcessedMessageIds = JSON.parse(processedIdsData);
        processedMessageIds.value = new Set(parsed.messageIds);
        lastCleanup.value = parsed.lastCleanup;
        cleanupProcessedIds();
      } catch (e) {
        console.error('Failed to load processed message IDs:', e);
      }
    }
  }

  function saveContacts() {
    const obj = Object.fromEntries(contacts.value);
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(obj));
  }

  function savePendingMessages() {
    const obj = Object.fromEntries(pendingMessages.value);
    localStorage.setItem(PENDING_KEY, JSON.stringify(obj));
  }

  function saveProcessedIds() {
    const data: ProcessedMessageIds = {
      messageIds: Array.from(processedMessageIds.value),
      lastCleanup: lastCleanup.value,
    };
    localStorage.setItem(PROCESSED_IDS_KEY, JSON.stringify(data));
  }

  function cleanupProcessedIds() {
    const now = Date.now();
    if (now - lastCleanup.value > CLEANUP_INTERVAL) {
      // 清理超过7天的消息ID（简单实现：全部清空）
      processedMessageIds.value.clear();
      lastCleanup.value = now;
      saveProcessedIds();
    }
  }

  function saveMessages(peerId: string) {
    const msgs = messages.value.get(peerId) || [];
    localStorage.setItem(MESSAGES_KEY + peerId, JSON.stringify(msgs));
  }

  function loadMessages(peerId: string) {
    const data = localStorage.getItem(MESSAGES_KEY + peerId);
    if (data) {
      try {
        const parsed = JSON.parse(data);
        messages.value.set(peerId, parsed);
        return parsed;
      } catch (e) {
        console.error('Failed to load messages:', e);
      }
    }
    return [];
  }

  // 检查消息ID是否已处理
  function isMessageProcessed(messageId: string): boolean {
    return processedMessageIds.value.has(messageId);
  }

  // 标记消息ID为已处理
  function markMessageProcessed(messageId: string) {
    processedMessageIds.value.add(messageId);
    saveProcessedIds();
    cleanupProcessedIds();
  }

  function addOrUpdateContact(contact: Contact) {
    const existing = contacts.value.get(contact.peerId);
    if (existing) {
      contacts.value.set(contact.peerId, { ...existing, ...contact });
    } else {
      contacts.value.set(contact.peerId, contact);
    }
    saveContacts();
  }

  function getContact(peerId: string): Contact | undefined {
    return contacts.value.get(peerId);
  }

  function setContactOnline(peerId: string, online: boolean) {
    const contact = contacts.value.get(peerId);
    if (contact) {
      contact.online = online;
      contact.lastSeen = Date.now();
      saveContacts();
    }
  }

  function addMessage(peerId: string, message: ChatMessage) {
    if (!messages.value.has(peerId)) {
      messages.value.set(peerId, []);
    }
    messages.value.get(peerId)!.push(message);
    saveMessages(peerId);

    const contact = contacts.value.get(peerId);
    if (contact && message.from !== peerId) {
      const lastMsg = messages.value.get(peerId);
      if (lastMsg && lastMsg.length > 0) {
        contact.lastSeen = message.timestamp;
      }
      saveContacts();
    }
  }

  // 根据消息ID更新消息状态
  function updateMessageStatus(peerId: string, messageId: string, status: ChatMessage['status']) {
    const msgs = messages.value.get(peerId);
    if (msgs) {
      const msg = msgs.find((m) => m.id === messageId);
      if (msg) {
        msg.status = status;
        if (status === 'delivered') {
          msg.deliveredAt = Date.now();
        }
        saveMessages(peerId);
      }
    }
  }

  // 根据消息ID获取消息
  function getMessageById(messageId: string): ChatMessage | null {
    for (const msgs of messages.value.values()) {
      const msg = msgs.find((m) => m.id === messageId);
      if (msg) return msg;
    }
    return null;
  }

  // 添加待发送消息
  function addPendingMessage(message: PendingMessage) {
    pendingMessages.value.set(message.id, message);
    savePendingMessages();
  }

  // 移除待发送消息
  function removePendingMessage(messageId: string) {
    pendingMessages.value.delete(messageId);
    savePendingMessages();
  }

  // 增加重试次数
  function incrementRetryCount(messageId: string): boolean {
    const msg = pendingMessages.value.get(messageId);
    if (msg) {
      msg.retryCount++;
      savePendingMessages();
      // 如果设置了最大重试次数且超过限制，返回 false
      if (msg.maxRetries !== undefined && msg.retryCount > msg.maxRetries) {
        return false;
      }
      return true;
    }
    return false;
  }

  function getPendingMessagesForPeer(peerId: string): PendingMessage[] {
    return Array.from(pendingMessages.value.values()).filter((m) => m.to === peerId);
  }

  function clearPendingMessagesForPeer(peerId: string) {
    const toRemove = Array.from(pendingMessages.value.entries()).filter(
      ([, m]) => m.to === peerId,
    );
    toRemove.forEach(([id]) => pendingMessages.value.delete(id));
    savePendingMessages();
    return toRemove.map(([, m]) => m);
  }

  // 创建新聊天
  function createChat(peerId: string, username: string = peerId) {
    if (!contacts.value.has(peerId)) {
      addOrUpdateContact({
        peerId,
        username,
        avatar: null,
        online: false,
        lastSeen: Date.now(),
        unreadCount: 0,
      });
    }
    loadMessages(peerId);
  }

  // 删除聊天
  function deleteChat(peerId: string) {
    contacts.value.delete(peerId);
    messages.value.delete(peerId);
    localStorage.removeItem(MESSAGES_KEY + peerId);
    saveContacts();

    // 清除该联系人的待发送消息
    clearPendingMessagesForPeer(peerId);

    if (currentChatPeerId.value === peerId) {
      currentChatPeerId.value = null;
    }
  }

  function setCurrentChat(peerId: string | null) {
    currentChatPeerId.value = peerId;
    if (peerId) {
      const contact = contacts.value.get(peerId);
      if (contact) {
        contact.unreadCount = 0;
        saveContacts();
      }
    }
  }

  function incrementUnread(peerId: string) {
    const contact = contacts.value.get(peerId);
    if (contact && currentChatPeerId.value !== peerId) {
      contact.unreadCount++;
      saveContacts();
    }
  }

  function getTotalUnread(): number {
    return Array.from(contacts.value.values()).reduce((sum, c) => sum + c.unreadCount, 0);
  }

  return {
    messages,
    contacts,
    pendingMessages,
    currentChatPeerId,
    currentMessages,
    sortedContacts,
    loadFromStorage,
    loadMessages,
    isMessageProcessed,
    markMessageProcessed,
    addOrUpdateContact,
    getContact,
    setContactOnline,
    addMessage,
    updateMessageStatus,
    getMessageById,
    addPendingMessage,
    removePendingMessage,
    incrementRetryCount,
    getPendingMessagesForPeer,
    clearPendingMessagesForPeer,
    createChat,
    deleteChat,
    setCurrentChat,
    incrementUnread,
    getTotalUnread,
  };
});
