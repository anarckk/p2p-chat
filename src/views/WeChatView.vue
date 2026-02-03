<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, onUnmounted, h } from 'vue';
import { useUserStore } from '../stores/userStore';
import { useChatStore } from '../stores/chatStore';
import { useDeviceStore } from '../stores/deviceStore';
import { usePeerManager } from '../composables/usePeerManager';
import type { ChatMessage, Contact, MessageType, MessageContent } from '../types';
import type { FileContent, ImageContent, VideoContent } from '../types';
import { fileToBase64 } from '../util/fileHelper';
import {
  UserOutlined,
  LeftOutlined,
  MoreOutlined,
  MessageOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
  SendOutlined,
  PlusOutlined,
  PictureOutlined,
  FileOutlined,
  VideoCameraOutlined,
  DeleteOutlined,
} from '@ant-design/icons-vue';

const userStore = useUserStore();
const chatStore = useChatStore();
const deviceStore = useDeviceStore();
const peerManager = usePeerManager();
const { sendMessageWithRetry } = peerManager;

const showAddChatModal = ref(false);
const messageInput = ref('');
const addChatPeerIdInput = ref('');
const messagesContainer = ref<HTMLElement | null>(null);
const isMobile = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

// 内联提示状态
const inlineMessage = ref('');
const inlineMessageType = ref<'success' | 'error' | 'warning' | 'info'>('info');

const currentContact = computed(() => {
  if (!chatStore.currentChatPeerId) return null;
  const contact = chatStore.getContact(chatStore.currentChatPeerId);
  if (!contact) return null;

  // 从 deviceStore 获取最新的设备状态
  const device = deviceStore.getDevice(chatStore.currentChatPeerId);

  // 返回联系人信息，如果设备存在则使用设备的在线状态
  return {
    ...contact,
    online: device ? device.isOnline : contact.online,
    lastSeen: device ? device.lastHeartbeat : contact.lastSeen,
  };
});

/**
 * 聊天列表（仅包含已创建聊天的联系人）
 * 注意：不在 chatStore 中的设备（仅在发现中心的）不应出现在聊天列表中
 */
const chatListContacts = computed(() => {
  // 显示所有在 chatStore 中的联系人（已创建聊天的）
  const contacts = chatStore.sortedContacts
    .map((contact) => {
      // 从 deviceStore 获取最新的设备状态（如果存在）
      const device = deviceStore.getDevice(contact.peerId);
      if (device) {
        // 更新联系人的在线状态和用户信息
        return {
          ...contact,
          online: device.isOnline ?? false,
          lastSeen: device.lastHeartbeat,
          username: device.username,
          avatar: device.avatar,
        };
      }
      return contact;
    });

  // 排序：在线优先，然后按最后活跃时间
  return contacts.sort((a, b) => {
    if (a.online !== b.online) {
      return a.online ? -1 : 1;
    }
    return b.lastSeen - a.lastSeen;
  });
});

onMounted(() => {
  // 加载聊天数据
  chatStore.loadFromStorage();
  // 加载设备数据
  deviceStore.loadDevices();

  // 检测移动端
  checkMobile();
  window.addEventListener('resize', checkMobile);
});

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);
});

function checkMobile() {
  isMobile.value = window.innerWidth < 768;
}

watch(
  () => chatStore.currentChatPeerId,
  (newPeerId) => {
    if (newPeerId) {
      chatStore.loadMessages(newPeerId);
      scrollToBottom();
    }
  },
);

watch(
  () => chatStore.currentMessages.length,
  () => {
    nextTick(() => scrollToBottom());
  },
);

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
  }
}

function selectContact(peerId: string) {
  chatStore.setCurrentChat(peerId);
}

function backToList() {
  chatStore.setCurrentChat(null);
}

/**
 * 显示内联提示
 */
function showInlineMessage(msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
  inlineMessage.value = msg;
  inlineMessageType.value = type;
}

/**
 * 清除内联提示
 */
function clearInlineMessage() {
  inlineMessage.value = '';
}

/**
 * 新增聊天
 */
async function handleAddChat() {
  const peerId = addChatPeerIdInput.value.trim();
  clearInlineMessage();

  if (!peerId) {
    showInlineMessage('请输入对方 Peer ID', 'warning');
    return;
  }

  if (peerId === userStore.myPeerId) {
    showInlineMessage('不能与自己聊天', 'warning');
    return;
  }

  // 使用 peerId 作为默认用户名（跳过查询，避免超时或错误）
  const username = peerId;

  console.log('[WeChat] Creating chat with peerId:', peerId, 'username:', username);

  // 创建聊天
  await chatStore.createChat(peerId, username);
  chatStore.setCurrentChat(peerId);

  showAddChatModal.value = false;
  addChatPeerIdInput.value = '';

  showInlineMessage('已创建聊天', 'success');

  console.log('[WeChat] Chat created successfully');
}

/**
 * 删除聊天
 */
function handleDeleteChat() {
  if (!chatStore.currentChatPeerId) return;

  const contact = currentContact.value;
  const contactName = contact?.username || chatStore.currentChatPeerId;

  chatStore.deleteChat(chatStore.currentChatPeerId);
  showInlineMessage(`已删除与 ${contactName} 的聊天`, 'success');
}

/**
 * 发送文本消息
 */
async function sendTextMessage() {
  const content = messageInput.value.trim();
  if (!content || !chatStore.currentChatPeerId) {
    return;
  }

  console.log('[WeChat] Sending text message:', { to: chatStore.currentChatPeerId, content });

  const messageId = await sendMessageWithRetry(chatStore.currentChatPeerId, content, 'text');

  console.log('[WeChat] Message sent with ID:', messageId);

  messageInput.value = '';

  // 等待一小段时间确保消息已添加到 store
  await nextTick();
  console.log('[WeChat] Current messages count:', chatStore.currentMessages.length);
}

/**
 * 选择文件
 * @param accept - 文件类型限制（如 'image/*'）
 */
function selectFile(accept?: string) {
  if (fileInputRef.value && accept) {
    fileInputRef.value.setAttribute('accept', accept);
  }
  fileInputRef.value?.click();
}

/**
 * 处理文件选择
 */
async function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file || !chatStore.currentChatPeerId) {
    return;
  }
  clearInlineMessage();

  // 限制文件大小 50MB
  if (file.size > 50 * 1024 * 1024) {
    showInlineMessage('文件大小不能超过 50MB', 'warning');
    return;
  }

  try {
    const dataUrl = await fileToBase64(file);
    let content: MessageContent;
    let type: MessageType;

    if (file.type.startsWith('image/')) {
      // 图片
      try {
        const img = await loadImageDimensions(file);
        content = {
          name: file.name,
          size: file.size,
          width: img.width,
          height: img.height,
          data: dataUrl,
        } as ImageContent;
        type = 'image';
      } catch (imgError) {
        // 图片加载失败（例如不是有效的图片格式），回退到普通文件
        console.warn('[Chat] Failed to load image dimensions, treating as file:', imgError);
        content = {
          name: file.name,
          size: file.size,
          type: file.type,
          data: dataUrl,
        } as FileContent;
        type = 'file';
      }
    } else if (file.type.startsWith('video/')) {
      // 视频
      content = {
        name: file.name,
        size: file.size,
        data: dataUrl,
      } as VideoContent;
      type = 'video';
    } else {
      // 普通文件
      content = {
        name: file.name,
        size: file.size,
        type: file.type,
        data: dataUrl,
      } as FileContent;
      type = 'file';
    }

    await sendMessageWithRetry(chatStore.currentChatPeerId, content, type);
    showInlineMessage('文件发送成功', 'success');
  } catch (error) {
    console.error('[Chat] File send error:', error);
    showInlineMessage('文件发送失败', 'error');
  }

  // 清空 input
  if (target) {
    target.value = '';
  }
}

/**
 * 加载图片尺寸
 */
function loadImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

/**
 * 下载文件
 */
function downloadFile(msg: ChatMessage) {
  const content = msg.content as FileContent | ImageContent | VideoContent;
  if (typeof content === 'string') return;

  const link = document.createElement('a');
  link.href = content.data;
  link.download = content.name;
  link.click();
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getAvatarUrl(avatar: string | null, username: string): string {
  if (avatar) return avatar;
  return '';
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 获取联系人显示名称：优先显示用户名，若无用户名则显示 PeerID
 */
function getContactDisplayName(contact: Contact): string {
  // 如果用户名存在且不等于 peerId，则显示用户名
  if (contact.username && contact.username !== contact.peerId) {
    return contact.username;
  }
  // 否则显示 PeerID
  return contact.peerId;
}

/**
 * 获取联系人副标题：如果显示了用户名，则显示 PeerID
 */
function getContactSubtitle(contact: Contact): string {
  // 如果主标题显示的是用户名，则副标题显示 PeerID
  if (contact.username && contact.username !== contact.peerId) {
    return `${contact.peerId.slice(0, 8)}...${contact.peerId.slice(-4)}`;
  }
  // 如果主标题显示的是 PeerID，则副标题为空
  return '';
}

/**
 * 渲染消息内容
 */
function renderMessageContent(msg: ChatMessage) {
  const { content, type } = msg;

  if (typeof content === 'string') {
    // 文本消息
    return h('div', { class: 'message-text' }, content);
  }

  switch (type) {
    case 'image': {
      const imgContent = content as ImageContent;
      return h('div', { class: 'message-image' }, [
        h('img', {
          src: imgContent.data,
          alt: imgContent.name,
          style: { maxWidth: '100%', maxHeight: '300px', borderRadius: '8px' },
        }),
        h('div', { class: 'file-info' }, [
          h('span', { class: 'file-name' }, imgContent.name),
          h('span', { class: 'file-size' }, formatFileSize(imgContent.size)),
        ]),
      ]);
    }
    case 'video': {
      const videoContent = content as VideoContent;
      return h('div', { class: 'message-video' }, [
        h('video', {
          src: videoContent.data,
          controls: true,
          style: { maxWidth: '100%', maxHeight: '300px', borderRadius: '8px' },
        }),
        h('div', { class: 'file-info' }, [
          h('span', { class: 'file-name' }, videoContent.name),
          h('span', { class: 'file-size' }, formatFileSize(videoContent.size)),
        ]),
      ]);
    }
    case 'file': {
      const fileContent = content as FileContent;
      return h('div', { class: 'message-file' }, [
        h(FileOutlined, { style: { fontSize: '48px', color: '#1890ff' } }),
        h('div', { class: 'file-details' }, [
          h('div', { class: 'file-name' }, fileContent.name),
          h('div', { class: 'file-size' }, formatFileSize(fileContent.size)),
        ]),
        h('a', {
          class: 'download-link',
          onClick: () => downloadFile(msg),
        }, '下载'),
      ]);
    }
    default:
      return h('div', { class: 'message-text' }, '[不支持的消息类型]');
  }
}
</script>

<template>
  <div class="wechat-container">
    <!-- 新增聊天弹窗 -->
    <a-modal
      v-model:open="showAddChatModal"
      title="新增聊天"
      ok-text="创建"
      @ok="handleAddChat"
    >
      <a-form layout="vertical">
        <a-form-item label="对方 Peer ID">
          <a-input
            v-model:value="addChatPeerIdInput"
            placeholder="请输入对方的 Peer ID"
          />
        </a-form-item>
        <a-typography-text type="secondary">
          提示：在发现中心可以查看和复制其他设备的 Peer ID
        </a-typography-text>
        <!-- 内联提示 -->
        <div v-if="inlineMessage" class="inline-message" :class="`inline-message-${inlineMessageType}`">
          {{ inlineMessage }}
        </div>
      </a-form>
    </a-modal>

    <!-- 主界面 -->
    <div class="wechat-layout">
      <!-- 左侧联系人列表 -->
      <div v-if="!isMobile || !chatStore.currentChatPeerId" class="contacts-panel">
        <div class="contacts-header">
          <div class="user-info">
            <a-avatar :src="userStore.userInfo.avatar || undefined" :size="40">
              {{ userStore.userInfo.username?.charAt(0).toUpperCase() || 'U' }}
            </a-avatar>
            <span class="username">{{ userStore.userInfo.username }}</span>
          </div>
          <div class="header-actions">
            <a-button type="text" size="small" aria-label="plus" @click="showAddChatModal = true">
              <template #icon>
                <PlusOutlined />
              </template>
            </a-button>
          </div>
        </div>

        <div class="contacts-list">
          <div v-if="chatListContacts.length === 0" class="empty-contacts">
            <a-empty description="暂无聊天">
              <template #description>
                <span style="color: #999">点击 + 号添加聊天，或在发现中心查看可用设备</span>
              </template>
            </a-empty>
          </div>

          <div
            v-for="contact in chatListContacts"
            :key="contact.peerId"
            class="contact-item"
            :class="{ active: chatStore.currentChatPeerId === contact.peerId }"
            @click="selectContact(contact.peerId)"
          >
            <a-badge :count="contact.unreadCount" :offset="[-4, 4]">
              <a-avatar :src="contact.avatar || undefined" :size="48">
                {{ contact.username.charAt(0).toUpperCase() }}
              </a-avatar>
            </a-badge>
            <div class="contact-info">
              <div class="contact-top">
                <span class="contact-name">{{ getContactDisplayName(contact) }}</span>
                <span class="contact-time">{{ formatTime(contact.lastSeen) }}</span>
              </div>
              <div class="contact-bottom">
                <span v-if="getContactSubtitle(contact)" class="contact-peer-id">{{ getContactSubtitle(contact) }}</span>
                <a-badge
                  :status="contact.online ? 'processing' : 'default'"
                  :text="contact.online ? '在线' : '离线'"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧聊天窗口 -->
      <div
        v-if="!isMobile || chatStore.currentChatPeerId"
        class="chat-panel"
        :class="{ 'mobile-show': isMobile && chatStore.currentChatPeerId }"
      >
        <template v-if="currentContact">
          <!-- 聊天头部 -->
          <div class="chat-header">
            <div class="chat-header-left">
              <a-button
                v-if="isMobile"
                type="text"
                @click="backToList"
                class="back-button"
              >
                <template #icon>
                  <LeftOutlined />
                </template>
              </a-button>
              <a-avatar :src="currentContact.avatar || undefined" :size="36">
                {{ currentContact.username.charAt(0).toUpperCase() }}
              </a-avatar>
              <div class="chat-title">
                <div class="chat-name">{{ currentContact.username }}</div>
                <div class="chat-status">
                  <a-badge
                    :status="currentContact.online ? 'processing' : 'default'"
                    :text="currentContact.online ? '在线' : '离线'"
                  />
                </div>
              </div>
            </div>
            <a-dropdown>
              <a-button type="text" size="small" aria-label="more">
                <template #icon>
                  <MoreOutlined />
                </template>
              </a-button>
              <template #overlay>
                <a-menu>
                  <a-menu-item @click="handleDeleteChat" style="color: #ff4d4f">
                    <DeleteOutlined />
                    删除聊天
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </div>

          <!-- 消息区域 -->
          <div ref="messagesContainer" class="messages-area">
            <div v-if="chatStore.currentMessages.length === 0" class="empty-messages">
              <a-empty description="开始聊天吧">
                <MessageOutlined style="font-size: 48px; color: #ddd" />
              </a-empty>
            </div>

            <div v-else class="messages-list">
              <div
                v-for="msg in chatStore.currentMessages"
                :key="msg.id"
                class="message-item"
                :class="{ 'is-self': msg.from === userStore.myPeerId }"
              >
                <div class="message-content">
                  <component :is="renderMessageContent(msg)" />
                </div>
                <div class="message-meta">
                  <span v-if="msg.from === userStore.myPeerId" class="message-status" :class="`message-status-${msg.status}`">
                    <CheckCircleOutlined v-if="msg.status === 'delivered'" />
                    <ExclamationCircleOutlined v-else-if="msg.status === 'failed'" />
                    <LoadingOutlined v-else-if="msg.status === 'sending'" />
                  </span>
                  <span class="message-time">{{ formatTime(msg.timestamp) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 输入区域 -->
          <div class="input-area">
            <div class="input-toolbar">
              <a-button type="text" size="small" aria-label="upload-file" @click="selectFile()">
                <template #icon>
                  <PlusOutlined />
                </template>
              </a-button>
              <a-button type="text" size="small" aria-label="upload-image" @click="selectFile('image/*')">
                <template #icon>
                  <PictureOutlined />
                </template>
              </a-button>
              <a-button type="text" size="small" aria-label="upload-file" @click="selectFile()">
                <template #icon>
                  <FileOutlined />
                </template>
              </a-button>
              <a-button type="text" size="small" aria-label="upload-video" @click="selectFile('video/*')">
                <template #icon>
                  <VideoCameraOutlined />
                </template>
              </a-button>
              <input
                ref="fileInputRef"
                type="file"
                data-testid="file-input"
                style="display: none"
                @change="handleFileSelect"
              />
            </div>
            <div class="input-row">
              <a-input
                v-model:value="messageInput"
                placeholder="输入消息..."
                size="large"
                @press-enter="sendTextMessage"
              >
                <template #suffix>
                  <a-button
                    type="primary"
                    :disabled="!messageInput.trim()"
                    @click="sendTextMessage"
                    aria-label="send"
                  >
                    <template #icon>
                      <SendOutlined />
                    </template>
                  </a-button>
                </template>
              </a-input>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="no-chat-selected">
            <a-empty description="选择一个联系人开始聊天">
              <template #image>
                <MessageOutlined style="font-size: 64px; color: #ccc" />
              </template>
            </a-empty>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wechat-container {
  height: calc(100vh - 64px);
  background: #f5f5f5;
}

.wechat-layout {
  display: flex;
  height: 100%;
  max-width: 1400px;
  margin: 0 auto;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* 联系人面板 */
.contacts-panel {
  width: 320px;
  border-right: 1px solid #eee;
  display: flex;
  flex-direction: column;
  background: #f8f9fa;
}

.contacts-header {
  padding: 16px;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.username {
  font-weight: 500;
  color: #333;
}

.header-actions {
  display: flex;
  gap: 4px;
}

.contacts-list {
  flex: 1;
  overflow-y: auto;
}

.empty-contacts {
  padding: 40px 20px;
  text-align: center;
}

.contact-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.2s;
  border-bottom: 1px solid #f0f0f0;
}

.contact-item:hover {
  background: #f0f0f0;
}

.contact-item.active {
  background: #e6f7ff;
}

.contact-info {
  flex: 1;
  min-width: 0;
}

.contact-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.contact-name {
  font-weight: 500;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contact-time {
  font-size: 12px;
  color: #999;
}

.contact-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.contact-peer-id {
  font-size: 11px;
  color: #999;
  font-family: 'Courier New', monospace;
}

/* 聊天面板 */
.chat-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
}

.chat-header {
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-button {
  margin-right: -8px;
}

.chat-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chat-name {
  font-weight: 500;
  color: #333;
}

.chat-status {
  font-size: 12px;
}

.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.empty-messages {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.message-item.is-self {
  align-items: flex-end;
}

.message-content {
  max-width: 70%;
}

.message-bubble,
.message-text,
.message-image,
.message-video,
.message-file {
  padding: 10px 14px;
  border-radius: 8px;
  background: #fff;
  word-break: break-word;
}

.message-item.is-self > .message-content > * {
  background: #1890ff;
  color: #fff;
}

.message-image img,
.message-video video {
  border-radius: 8px;
}

.file-info {
  margin-top: 8px;
  font-size: 12px;
  opacity: 0.8;
}

.file-name {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.file-size {
  font-size: 11px;
  opacity: 0.7;
}

.message-file {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  min-width: 200px;
}

.file-details {
  flex: 1;
}

.message-item.is-self .file-details * {
  color: #fff;
}

.download-link {
  color: #1890ff;
  cursor: pointer;
  text-decoration: underline;
}

.message-item.is-self .download-link {
  color: #fff;
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  padding: 0 2px;
  background: transparent !important;
}

.message-time {
  font-size: 11px;
  color: #999;
  line-height: 1.4;
}

.message-item.is-self .message-time {
  color: rgba(0, 0, 0, 0.45);
}

.message-status {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
}

.message-status .anticon {
  font-size: 11px;
}

.message-status-delivered .anticon {
  color: #52c41a;
}

.message-status-failed .anticon {
  color: #ff4d4f;
}

.message-status-sending .anticon {
  color: #999;
}

.input-area {
  padding: 12px 16px;
  background: #fff;
  border-top: 1px solid #eee;
}

.input-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.input-row {
  display: flex;
  gap: 8px;
}

.no-chat-selected {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .contacts-panel {
    width: 100%;
  }

  .chat-panel {
    position: fixed;
    top: 64px;
    left: 0;
    right: 0;
    bottom: 0;
    transform: translateX(100%);
    transition: transform 0.3s;
    z-index: 1000;
  }

  .chat-panel.mobile-show {
    transform: translateX(0);
  }

  .message-content {
    max-width: 80%;
  }
}

/* 内联提示样式 */
.inline-message {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 14px;
}

.inline-message-success {
  background-color: #f6ffed;
  border: 1px solid #b7eb8f;
  color: #52c41a;
}

.inline-message-error {
  background-color: #fff2f0;
  border: 1px solid #ffccc7;
  color: #ff4d4f;
}

.inline-message-warning {
  background-color: #fffbe6;
  border: 1px solid #ffe58f;
  color: #faad14;
}

.inline-message-info {
  background-color: #e6f7ff;
  border: 1px solid #91d5ff;
  color: #1890ff;
}

</style>
