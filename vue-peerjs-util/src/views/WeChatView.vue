<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, onUnmounted } from 'vue';
import { useUserStore } from '../stores/userStore';
import { useChatStore } from '../stores/chatStore';
import { usePeerManager } from '../composables/usePeerManager';
import { message } from 'ant-design-vue';
import type { ChatMessage, Contact } from '../types';
import {
  UserOutlined,
  SettingOutlined,
  LeftOutlined,
  MoreOutlined,
  ReloadOutlined,
  CloseOutlined,
  MessageOutlined,
  CheckOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
  SendOutlined,
} from '@ant-design/icons-vue';

const userStore = useUserStore();
const chatStore = useChatStore();
const { myPeerId, init, sendMessage } = usePeerManager();

const showSetupModal = ref(false);
const messageInput = ref('');
const messagesContainer = ref<HTMLElement | null>(null);
const isMobile = ref(false);

const currentContact = computed(() => {
  if (!chatStore.currentChatPeerId) return null;
  return chatStore.getContact(chatStore.currentChatPeerId);
});

const setupForm = ref({
  username: '',
  avatarFile: null as File | null,
  avatarPreview: null as string | null,
});

onMounted(() => {
  // 加载用户信息
  const isSetup = userStore.loadUserInfo();
  if (!isSetup) {
    showSetupModal.value = true;
  }

  // 加载聊天数据
  chatStore.loadFromStorage();

  // 初始化 Peer
  if (!myPeerId.value) {
    init();
  }

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

async function handleSetupSubmit() {
  const username = setupForm.value.username.trim();
  if (!username) {
    message.warning('请输入用户名');
    return;
  }

  let avatarDataUrl: string | null = null;

  if (setupForm.value.avatarFile) {
    try {
      avatarDataUrl = await fileToDataUrl(setupForm.value.avatarFile);
    } catch (e) {
      message.error('头像处理失败');
      return;
    }
  }

  userStore.saveUserInfo({
    username,
    avatar: avatarDataUrl,
  });

  showSetupModal.value = false;
  message.success('设置完成');
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function handleAvatarChange(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    if (file.size > 2 * 1024 * 1024) {
      message.warning('头像大小不能超过 2MB');
      return;
    }

    setupForm.value.avatarFile = file;
    fileToDataUrl(file).then((dataUrl) => {
      setupForm.value.avatarPreview = dataUrl;
    });
  }
}

function selectContact(peerId: string) {
  chatStore.setCurrentChat(peerId);
}

function backToList() {
  chatStore.setCurrentChat(null);
}

async function sendChatMessage() {
  const content = messageInput.value.trim();
  if (!content || !chatStore.currentChatPeerId || !myPeerId.value) {
    return;
  }

  const contact = currentContact.value;
  if (!contact) return;

  const msgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const chatMessage: ChatMessage = {
    id: msgId,
    from: myPeerId.value,
    to: contact.peerId,
    content,
    timestamp: Date.now(),
    status: 'sending',
    type: 'text',
  };

  // 先显示在界面上
  chatStore.addMessage(contact.peerId, chatMessage);
  messageInput.value = '';

  // 尝试发送
  const success = await sendMessage(contact.peerId, {
    type: 'chat',
    data: {
      content,
      timestamp: chatMessage.timestamp,
    },
  });

  if (success) {
    chatStore.updateMessageStatus(contact.peerId, msgId, 'sent');
  } else {
    chatStore.updateMessageStatus(contact.peerId, msgId, 'failed');
    // 添加到待发送队列
    chatStore.addPendingMessage({
      id: msgId,
      to: contact.peerId,
      content,
      timestamp: chatMessage.timestamp,
      retryCount: 0,
    });
    message.warning('发送失败，消息已保存，对方上线后将自动发送');
  }
}

function getAvatarUrl(avatar: string | null, username: string): string {
  if (avatar) return avatar;
  // 使用 ant-design-vue 默认头像
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

function retrySendFailedMessages() {
  if (!chatStore.currentChatPeerId) return;

  const pending = chatStore.getPendingMessagesForPeer(chatStore.currentChatPeerId);
  if (pending.length === 0) {
    message.info('没有待发送的消息');
    return;
  }

  message.info(`尝试发送 ${pending.length} 条待发送消息...`);

  pending.forEach((pendingMsg) => {
    sendMessage(pendingMsg.to, {
      type: 'chat',
      data: {
        content: pendingMsg.content,
        timestamp: pendingMsg.timestamp,
      },
    }).then((success) => {
      if (success) {
        chatStore.removePendingMessage(pendingMsg.id);
        message.success('消息发送成功');
      }
    });
  });
}
</script>

<template>
  <div class="wechat-container">
    <!-- 用户设置弹窗 -->
    <a-modal
      v-model:open="showSetupModal"
      title="设置用户信息"
      :mask-closable="false"
      :closable="false"
      ok-text="完成"
      @ok="handleSetupSubmit"
    >
      <a-form layout="vertical">
        <a-form-item label="用户名">
          <a-input
            v-model:value="setupForm.username"
            placeholder="请输入用户名"
            :maxlength="20"
          />
        </a-form-item>
        <a-form-item label="头像（可选）">
          <a-upload
            :before-upload="() => false"
            @change="handleAvatarChange"
            :show-upload-list="false"
            accept="image/*"
          >
            <a-avatar :size="64" :src="setupForm.avatarPreview || undefined" style="cursor: pointer">
              <template #icon>
                <UserOutlined />
              </template>
            </a-avatar>
          </a-upload>
          <div class="avatar-tip">点击上传头像，最大 2MB</div>
        </a-form-item>
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
          <a-button type="text" size="small" @click="showSetupModal = true">
            <template #icon>
              <SettingOutlined />
            </template>
          </a-button>
        </div>

        <div class="contacts-list">
          <div v-if="chatStore.sortedContacts.length === 0" class="empty-contacts">
            <a-empty description="暂无聊天">
              <template #description>
                <span style="color: #999">暂无聊天</span>
              </template>
            </a-empty>
          </div>

          <div
            v-for="contact in chatStore.sortedContacts"
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
              <a-button type="text" size="small">
                <template #icon>
                  <MoreOutlined />
                </template>
              </a-button>
              <template #overlay>
                <a-menu>
                  <a-menu-item @click="retrySendFailedMessages">
                    <ReloadOutlined />
                    重发失败消息
                  </a-menu-item>
                  <a-menu-item @click="chatStore.setCurrentChat(null)">
                    <CloseOutlined />
                    关闭聊天
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
                :class="{
                  'is-self': msg.from === myPeerId,
                  'is-system': msg.type === 'system',
                }"
              >
                <template v-if="msg.type === 'system'">
                  <a-tag color="blue">{{ msg.content }}</a-tag>
                </template>
                <template v-else>
                  <div class="message-content">
                    <div class="message-bubble">
                      {{ msg.content }}
                    </div>
                    <div class="message-meta">
                      <span class="message-time">{{ formatTime(msg.timestamp) }}</span>
                      <span v-if="msg.from === myPeerId" class="message-status">
                        <CheckOutlined
                          v-if="msg.status === 'sent'"
                          style="color: #52c41a"
                        />
                        <ExclamationCircleOutlined
                          v-else-if="msg.status === 'failed'"
                          style="color: #ff4d4f"
                        />
                        <LoadingOutlined v-else />
                      </span>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>

          <!-- 输入区域 -->
          <div class="input-area">
            <a-input
              v-model:value="messageInput"
              placeholder="输入消息..."
              size="large"
              @press-enter="sendChatMessage"
            >
              <template #suffix>
                <a-button
                  type="primary"
                  :disabled="!messageInput.trim()"
                  @click="sendChatMessage"
                >
                  <template #icon>
                    <SendOutlined />
                  </template>
                </a-button>
              </template>
            </a-input>
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

.message-item.is-system {
  justify-content: center;
}

.message-content {
  max-width: 70%;
}

.message-bubble {
  padding: 10px 14px;
  border-radius: 8px;
  background: #fff;
  word-break: break-word;
}

.message-item.is-self .message-bubble {
  background: #1890ff;
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

/* 设置弹窗 */
.avatar-tip {
  font-size: 12px;
  color: #999;
  margin-top: 8px;
}
</style>
