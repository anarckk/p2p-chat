<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, onUnmounted, h } from 'vue';
import { useUserStore } from '../stores/userStore';
import { useChatStore } from '../stores/chatStore';
import { useDeviceStore } from '../stores/deviceStore';
import { usePeerManager } from '../composables/usePeerManager';
import { message } from 'ant-design-vue';
import type { ChatMessage, Contact, MessageType, MessageContent } from '../types';
import type { FileContent, ImageContent, VideoContent } from '../types';
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

const currentContact = computed(() => {
  if (!chatStore.currentChatPeerId) return null;
  return chatStore.getContact(chatStore.currentChatPeerId);
});

/**
 * 自动发现的聊天列表
 * 将发现中心的在线设备自动合并到聊天列表中
 */
const autoDiscoveredContacts = computed(() => {
  // 获取发现中心的在线设备（排除自己）
  const onlineDevices = deviceStore.onlineDevices.filter(
    (d) => d.peerId !== userStore.myPeerId
  );

  // 合并已有联系人和自动发现的设备
  const contactMap = new Map<string, Contact>();

  // 首先添加已有联系人
  chatStore.sortedContacts.forEach((contact) => {
    contactMap.set(contact.peerId, contact);
  });

  // 然后添加在线设备（如果不在联系人列表中）
  onlineDevices.forEach((device) => {
    if (!contactMap.has(device.peerId)) {
      contactMap.set(device.peerId, {
        peerId: device.peerId,
        username: device.username,
        avatar: device.avatar,
        online: device.isOnline || true,
        lastSeen: device.lastHeartbeat,
        unreadCount: 0,
        chatVersion: 0,
      });
    } else {
      // 更新现有联系人的在线状态和用户信息
      const existing = contactMap.get(device.peerId)!;
      existing.online = device.isOnline || true;
      existing.lastSeen = device.lastHeartbeat;
      existing.username = device.username;
      existing.avatar = device.avatar;
    }
  });

  // 转换为数组并排序
  return Array.from(contactMap.values()).sort((a, b) => {
    // 在线优先
    if (a.online !== b.online) {
      return a.online ? -1 : 1;
    }
    // 按最后活跃时间排序
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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function selectContact(peerId: string) {
  chatStore.setCurrentChat(peerId);
}

function backToList() {
  chatStore.setCurrentChat(null);
}

/**
 * 新增聊天
 */
async function handleAddChat() {
  const peerId = addChatPeerIdInput.value.trim();
  if (!peerId) {
    message.warning('请输入对方 Peer ID');
    return;
  }

  if (peerId === userStore.myPeerId) {
    message.warning('不能与自己聊天');
    return;
  }

  // 先尝试查询用户名
  let username = peerId;
  try {
    const result = await peerManager.queryUsername(peerId);
    if (result && result.username) {
      username = result.username;
    }
  } catch (error) {
    console.warn('[WeChat] Failed to query username, using peerId as username:', error);
  }

  // 创建聊天
  chatStore.createChat(peerId, username);
  chatStore.setCurrentChat(peerId);

  showAddChatModal.value = false;
  addChatPeerIdInput.value = '';
  message.success('已创建聊天');
}

/**
 * 删除聊天
 */
function handleDeleteChat() {
  if (!chatStore.currentChatPeerId) return;

  const contact = currentContact.value;
  const contactName = contact?.username || chatStore.currentChatPeerId;

  chatStore.deleteChat(chatStore.currentChatPeerId);
  message.success(`已删除与 ${contactName} 的聊天`);
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
  if (!file || !chatStore.currentChatPeerId) return;

  // 限制文件大小 50MB
  if (file.size > 50 * 1024 * 1024) {
    message.warning('文件大小不能超过 50MB');
    return;
  }

  try {
    const dataUrl = await fileToDataUrl(file);
    let content: MessageContent;
    let type: MessageType;

    if (file.type.startsWith('image/')) {
      // 图片
      const img = await loadImageDimensions(file);
      content = {
        name: file.name,
        size: file.size,
        width: img.width,
        height: img.height,
        data: dataUrl,
      } as ImageContent;
      type = 'image';
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
    message.success('文件发送成功');
  } catch (error) {
    console.error('[Chat] File send error:', error);
    message.error('文件发送失败');
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
          <div v-if="autoDiscoveredContacts.length === 0" class="empty-contacts">
            <a-empty description="暂无在线设备">
              <template #description>
                <span style="color: #999">在发现中心添加设备或点击 + 号手动添加</span>
              </template>
            </a-empty>
          </div>

          <div
            v-for="contact in autoDiscoveredContacts"
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
                <span class="contact-name">{{ contact.username }}</span>
                <span class="contact-time">{{ formatTime(contact.lastSeen) }}</span>
              </div>
              <div class="contact-bottom">
                <span class="contact-peer-id">{{ contact.peerId.slice(0, 20) }}...</span>
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
                  <div class="message-meta">
                    <span class="message-time">{{ formatTime(msg.timestamp) }}</span>
                    <span v-if="msg.from === userStore.myPeerId" class="message-status" :class="`message-status-${msg.status}`">
                      <CheckCircleOutlined v-if="msg.status === 'delivered'" style="color: #52c41a; font-size: 12px" />
                      <ExclamationCircleOutlined v-else-if="msg.status === 'failed'" style="color: #ff4d4f; font-size: 12px" />
                      <LoadingOutlined v-else-if="msg.status === 'sending'" style="font-size: 12px" />
                    </span>
                  </div>
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
}

.message-item.is-self {
  justify-content: flex-end;
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
  justify-content: flex-end;
  gap: 4px;
  margin-top: 4px;
}

.message-time {
  font-size: 11px;
  color: #999;
}

.message-item.is-self .message-time {
  color: rgba(255, 255, 255, 0.7);
}

.message-status {
  font-size: 12px;
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

</style>
