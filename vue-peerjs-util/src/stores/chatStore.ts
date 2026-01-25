import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ChatMessage, Contact, PendingMessage } from '../types';

const MESSAGES_KEY = 'p2p_messages_';
const CONTACTS_KEY = 'p2p_contacts';
const PENDING_KEY = 'p2p_pending_messages';

export const useChatStore = defineStore('chat', () => {
  const messages = ref<Map<string, ChatMessage[]>>(new Map());
  const contacts = ref<Map<string, Contact>>(new Map());
  const pendingMessages = ref<Map<string, PendingMessage>>(new Map());
  const currentChatPeerId = ref<string | null>(null);

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
  }

  function saveContacts() {
    const obj = Object.fromEntries(contacts.value);
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(obj));
  }

  function savePendingMessages() {
    const obj = Object.fromEntries(pendingMessages.value);
    localStorage.setItem(PENDING_KEY, JSON.stringify(obj));
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

  function updateMessageStatus(peerId: string, messageId: string, status: ChatMessage['status']) {
    const msgs = messages.value.get(peerId);
    if (msgs) {
      const msg = msgs.find((m) => m.id === messageId);
      if (msg) {
        msg.status = status;
        saveMessages(peerId);
      }
    }
  }

  function addPendingMessage(message: PendingMessage) {
    pendingMessages.value.set(message.id, message);
    savePendingMessages();
  }

  function removePendingMessage(messageId: string) {
    pendingMessages.value.delete(messageId);
    savePendingMessages();
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
    addOrUpdateContact,
    getContact,
    setContactOnline,
    addMessage,
    updateMessageStatus,
    addPendingMessage,
    removePendingMessage,
    getPendingMessagesForPeer,
    clearPendingMessagesForPeer,
    setCurrentChat,
    incrementUnread,
    getTotalUnread,
  };
});
