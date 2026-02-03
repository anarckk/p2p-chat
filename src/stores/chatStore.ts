import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  ChatMessage,
  Contact,
  PendingMessage,
  MessageType,
  MessageContent,
} from '../types';
import indexedDBStorage from '../util/indexedDBStorage';

const MESSAGES_KEY = 'p2p_messages_';
const CONTACTS_KEY = 'p2p_contacts';
const PENDING_KEY = 'p2p_pending_messages';
const MESSAGE_CONTENT_MIGRATION_KEY = 'message_content_migrated_to_indexeddb'; // 标记是否已迁移消息内容

export const useChatStore = defineStore('chat', () => {
  const messages = ref<Map<string, ChatMessage[]>>(new Map());
  const contacts = ref<Map<string, Contact>>(new Map());
  const pendingMessages = ref<Map<string, PendingMessage>>(new Map());
  const currentChatPeerId = ref<string | null>(null);

  /**
   * 从消息中提取大型内容（图片、文件）
   * 返回: { sanitizedMessage: ChatMessage, largeContents: Array<{id, messageId, type, content}> }
   */
  function extractLargeContents(message: ChatMessage) {
    const largeContents: Array<{ id: string; messageId: string; type: MessageType; content: string }> = [];
    const sanitizedMessage = { ...message };

    // 检查是否是图片或文件类型
    if (message.type === 'image' || message.type === 'file' || message.type === 'video') {
      const contentId = `msg-content-${message.id}`;
      largeContents.push({
        id: contentId,
        messageId: message.id,
        type: message.type,
        content: message.content as string,
      });
      // 将内容替换为引用 ID
      sanitizedMessage.content = contentId;
    }

    return { sanitizedMessage, largeContents };
  }

  /**
   * 保存大型消息内容到 IndexedDB
   */
  async function saveLargeMessageContents(messageId: string, type: MessageType, content: string) {
    const contentId = `msg-content-${messageId}`;
    await indexedDBStorage.set('messages', {
      id: contentId,
      messageId,
      type,
      content,
    });
  }

  /**
   * 从 IndexedDB 加载大型消息内容
   */
  async function loadLargeMessageContent(messageId: string): Promise<string | null> {
    const contentId = `msg-content-${messageId}`;
    const data = await indexedDBStorage.get('messages', contentId);
    return data?.content || null;
  }

  /**
   * 迁移旧消息数据到新的混合存储策略
   */
  async function migrateOldMessageDataIfNeeded() {
    const hasMigrated = localStorage.getItem(MESSAGE_CONTENT_MIGRATION_KEY);
    if (hasMigrated) {
      return; // 已迁移过
    }

    try {
      console.log('[ChatStore] 开始检查消息数据迁移...');

      // 检查所有联系人的消息
      const contactsData = localStorage.getItem(CONTACTS_KEY);
      if (!contactsData) {
        localStorage.setItem(MESSAGE_CONTENT_MIGRATION_KEY, 'true');
        return;
      }

      const contacts = JSON.parse(contactsData);
      const peerIds = Object.keys(contacts);
      let migratedCount = 0;

      for (const peerId of peerIds) {
        const messageData = localStorage.getItem(MESSAGES_KEY + peerId);
        if (!messageData) continue;

        const messages: ChatMessage[] = JSON.parse(messageData);
        let peerMigrated = 0;

        for (const message of messages) {
          // 只迁移图片、文件、视频类型
          if (message.type === 'image' || message.type === 'file' || message.type === 'video') {
            const content = message.content as string;
            if (content && content.length > 1000) { // 只迁移较大的内容
              await saveLargeMessageContents(message.id, message.type, content);
              // 更新消息内容为引用 ID
              message.content = `msg-content-${message.id}`;
              peerMigrated++;
            }
          }
        }

        if (peerMigrated > 0) {
          // 保存更新后的消息
          localStorage.setItem(MESSAGES_KEY + peerId, JSON.stringify(messages));
          migratedCount += peerMigrated;
        }
      }

      localStorage.setItem(MESSAGE_CONTENT_MIGRATION_KEY, 'true');
      console.log(`[ChatStore] 消息数据迁移完成！迁移了 ${migratedCount} 条大型消息内容`);
    } catch (e) {
      console.error('[ChatStore] 消息数据迁移失败:', e);
    }
  }

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

  /**
   * 从存储加载数据（混合策略：localStorage + IndexedDB）
   */
  async function loadFromStorage() {
    // 首次加载时检查是否需要迁移旧数据
    await migrateOldMessageDataIfNeeded();

    // 加载当前聊天
    const currentChatData = localStorage.getItem('p2p_current_chat');
    if (currentChatData) {
      try {
        currentChatPeerId.value = currentChatData;
      } catch (e) {
        console.error('[ChatStore] Failed to load current chat:', e);
      }
    }

    const contactsData = localStorage.getItem(CONTACTS_KEY);
    if (contactsData) {
      try {
        const parsed = JSON.parse(contactsData);
        contacts.value = new Map(Object.entries(parsed));

        // 为每个联系人加载对应的消息
        for (const [peerId] of contacts.value) {
          await loadMessages(peerId);
        }
      } catch (e) {
        console.error('[ChatStore] Failed to load contacts:', e);
      }
    }

    const pendingData = localStorage.getItem(PENDING_KEY);
    if (pendingData) {
      try {
        const parsed = JSON.parse(pendingData);
        pendingMessages.value = new Map(Object.entries(parsed));
      } catch (e) {
        console.error('[ChatStore] Failed to load pending messages:', e);
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

  /**
   * 保存消息（混合策略：localStorage + IndexedDB）
   * 小数据（文本消息元数据）→ localStorage
   * 大数据（图片、文件内容）→ IndexedDB
   */
  async function saveMessages(peerId: string) {
    const msgs = messages.value.get(peerId) || [];
    const sanitizedMessages: ChatMessage[] = [];

    // 分离大型内容
    for (const msg of msgs) {
      if (msg.type === 'image' || msg.type === 'file' || msg.type === 'video') {
        const content = msg.content as string;
        // 如果内容是引用 ID，说明已经在 IndexedDB 中
        if (content.startsWith('msg-content-')) {
          sanitizedMessages.push(msg);
        } else if (content && content.length > 1000) {
          // 大型内容，保存到 IndexedDB
          await saveLargeMessageContents(msg.id, msg.type, content);
          sanitizedMessages.push({
            ...msg,
            content: `msg-content-${msg.id}`,
          });
        } else {
          sanitizedMessages.push(msg);
        }
      } else {
        sanitizedMessages.push(msg);
      }
    }

    localStorage.setItem(MESSAGES_KEY + peerId, JSON.stringify(sanitizedMessages));
  }

  /**
   * 加载消息（混合策略：localStorage + IndexedDB）
   */
  async function loadMessages(peerId: string) {
    const data = localStorage.getItem(MESSAGES_KEY + peerId);
    if (data) {
      try {
        const parsed: ChatMessage[] = JSON.parse(data);
        const messagesWithContent: ChatMessage[] = [];

        // 为每条消息加载大型内容
        for (const msg of parsed) {
          if ((msg.type === 'image' || msg.type === 'file' || msg.type === 'video') &&
              typeof msg.content === 'string' && msg.content.startsWith('msg-content-')) {
            // 从 IndexedDB 加载实际内容
            const actualContent = await loadLargeMessageContent(msg.id);
            messagesWithContent.push({
              ...msg,
              content: actualContent || msg.content,
            });
          } else {
            messagesWithContent.push(msg);
          }
        }

        messages.value.set(peerId, messagesWithContent);
        return messagesWithContent;
      } catch (e) {
        console.error('[ChatStore] Failed to load messages:', e);
      }
    }
    return [];
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

  /**
   * 添加消息（支持 IndexedDB 存储）
   */
  async function addMessage(peerId: string, message: ChatMessage) {
    if (!messages.value.has(peerId)) {
      messages.value.set(peerId, []);
    }
    messages.value.get(peerId)!.push(message);
    await saveMessages(peerId);

    const contact = contacts.value.get(peerId);
    if (contact && message.from === peerId) {
      const lastMsg = messages.value.get(peerId);
      if (lastMsg && lastMsg.length > 0) {
        contact.lastSeen = message.timestamp;
      }
      saveContacts();
    }
  }

  // 根据消息ID更新消息状态（支持 IndexedDB）
  async function updateMessageStatus(peerId: string, messageId: string, status: ChatMessage['status']) {
    const msgs = messages.value.get(peerId);
    if (msgs) {
      const msg = msgs.find((m) => m.id === messageId);
      if (msg) {
        msg.status = status;
        if (status === 'delivered') {
          msg.deliveredAt = Date.now();
        }
        await saveMessages(peerId);
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

  // 创建新聊天（支持 IndexedDB）
  async function createChat(peerId: string, username: string = peerId) {
    if (!contacts.value.has(peerId)) {
      addOrUpdateContact({
        peerId,
        username,
        avatar: null,
        online: false,
        lastSeen: Date.now(),
        unreadCount: 0,
        chatVersion: 0,
      });
    }
    await loadMessages(peerId);
    // 注意：不再添加空的系统消息，让聊天以干净的状态开始
  }

  // 删除聊天（支持 IndexedDB）
  async function deleteChat(peerId: string) {
    contacts.value.delete(peerId);
    messages.value.delete(peerId);

    // 清除 IndexedDB 中该联系人的消息内容
    const messageData = localStorage.getItem(MESSAGES_KEY + peerId);
    if (messageData) {
      try {
        const messages: ChatMessage[] = JSON.parse(messageData);
        for (const msg of messages) {
          if (msg.type === 'image' || msg.type === 'file' || msg.type === 'video') {
            await indexedDBStorage.delete('messages', `msg-content-${msg.id}`);
          }
        }
      } catch (e) {
        console.error('[ChatStore] Failed to clean up IndexedDB messages:', e);
      }
    }

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
    // 保存当前聊天到 localStorage
    if (peerId) {
      localStorage.setItem('p2p_current_chat', peerId);
      const contact = contacts.value.get(peerId);
      if (contact) {
        contact.unreadCount = 0;
        saveContacts();
      }
    } else {
      localStorage.removeItem('p2p_current_chat');
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
