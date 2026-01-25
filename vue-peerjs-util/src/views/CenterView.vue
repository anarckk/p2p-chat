<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useUserStore } from '../stores/userStore';
import { useChatStore } from '../stores/chatStore';
import { usePeerManager } from '../composables/usePeerManager';
import { message } from 'ant-design-vue';
import type { OnlineDevice } from '../types';
import { ReloadOutlined, TeamOutlined, PlusOutlined, UserOutlined } from '@ant-design/icons-vue';

const userStore = useUserStore();
const chatStore = useChatStore();
const {
  isConnected,
  init,
  queryDiscoveredDevices,
  getDiscoveredDevices,
  addDiscoveredDevice,
  sendDiscoveryNotification,
  queryUsername,
} = usePeerManager();

const onlineDevices = ref<Map<string, OnlineDevice>>(new Map());
const queryPeerIdInput = ref('');
const isQuerying = ref(false);
const showSetupModal = ref(false);

const setupForm = ref({
  username: '',
  avatarFile: null as File | null,
  avatarPreview: null as string | null,
});

// 我的设备信息
const myDeviceInfo = computed(() => {
  if (!userStore.myPeerId) return null;
  return {
    peerId: userStore.myPeerId,
    username: userStore.userInfo.username || userStore.myPeerId,
    avatar: userStore.userInfo.avatar,
    lastHeartbeat: Date.now(),
  };
});

const sortedDevices = computed(() => {
  const allDevices = Array.from(onlineDevices.value.values());
  return allDevices.sort((a, b) => b.lastHeartbeat - a.lastHeartbeat);
});

// 检查设备是否已在聊天列表
function isInChat(peerId: string): boolean {
  return chatStore.getContact(peerId) !== undefined;
}

onMounted(async () => {
  // 加载用户信息
  const isSetup = userStore.loadUserInfo();

  // 如果用户未设置，显示设置弹窗
  if (!isSetup) {
    showSetupModal.value = true;
  }

  // 确保 Peer 已初始化
  if (!isConnected.value) {
    init();
  }

  // 将自己添加到在线设备列表
  if (myDeviceInfo.value) {
    onlineDevices.value.set(myDeviceInfo.value.peerId, myDeviceInfo.value);
  }

  // 监听发现设备更新事件，自动刷新
  const handleDiscoveryUpdate = () => {
    console.log('[Center] Discovery devices updated, refreshing...');
    const devices = getDiscoveredDevices();
    devices.forEach((device) => {
      onlineDevices.value.set(device.peerId, device);
    });
    // 确保自己在列表中
    if (myDeviceInfo.value) {
      onlineDevices.value.set(myDeviceInfo.value.peerId, myDeviceInfo.value);
    }
  };

  window.addEventListener('discovery-devices-updated', handleDiscoveryUpdate);

  // 清理事件监听器
  onUnmounted(() => {
    window.removeEventListener('discovery-devices-updated', handleDiscoveryUpdate);
  });
});

onUnmounted(() => {
  // 清理
});

/**
 * 查询指定节点的已发现设备
 */
async function queryDevices() {
  if (!queryPeerIdInput.value.trim()) {
    message.warning('请输入要查询的 Peer ID');
    return;
  }

  isQuerying.value = true;
  try {
    const devices = await queryDiscoveredDevices(queryPeerIdInput.value.trim());

    if (devices.length > 0) {
      // 合并到在线设备列表
      devices.forEach((device) => {
        onlineDevices.value.set(device.peerId, device);
        // 同时添加到 peerManager 的发现列表
        addDiscoveredDevice(device);
      });
      message.success(`从 ${queryPeerIdInput.value} 发现了 ${devices.length} 个设备`);
    } else {
      message.info('未发现任何设备');
    }

    queryPeerIdInput.value = '';
  } catch (error) {
    console.error('[Center] Query error:', error);
    message.error('查询失败');
  } finally {
    isQuerying.value = false;
  }
}

/**
 * 手动添加设备
 */
async function addDeviceManually() {
  if (!queryPeerIdInput.value.trim()) {
    message.warning('请输入要添加的 Peer ID');
    return;
  }

  const peerId = queryPeerIdInput.value.trim();

  // 检查是否已存在
  if (onlineDevices.value.has(peerId)) {
    message.info('该设备已存在');
    return;
  }

  // 先添加到在线设备列表（使用临时用户名）
  const newDevice: OnlineDevice = {
    peerId,
    username: peerId,
    avatar: null,
    lastHeartbeat: Date.now(),
  };

  onlineDevices.value.set(peerId, newDevice);
  addDiscoveredDevice(newDevice);

  // 发送发现通知给对端
  await sendDiscoveryNotification(peerId);

  // 查询对端的用户名
  const userInfo = await queryUsername(peerId);
  if (userInfo) {
    // 更新设备信息
    newDevice.username = userInfo.username;
    newDevice.avatar = userInfo.avatar;
    onlineDevices.value.set(peerId, { ...newDevice });
    // 同时更新已发现的设备
    addDiscoveredDevice({ ...newDevice });
  }

  message.success(`已添加设备 ${peerId}`);
  queryPeerIdInput.value = '';
}

/**
 * 将设备添加到聊天列表
 */
function handleDeviceClick(device: OnlineDevice) {
  // 创建聊天
  chatStore.createChat(device.peerId, device.username);

  message.success(`已添加 ${device.username} 到聊天列表`);
}

/**
 * 复制 Peer ID
 */
function copyPeerId(id: string) {
  navigator.clipboard.writeText(id);
  message.success('已复制到剪贴板');
}

/**
 * 刷新发现列表
 */
function refreshDiscovery() {
  // 重新从 peerManager 获取已发现的设备
  const devices = getDiscoveredDevices();
  devices.forEach((device) => {
    onlineDevices.value.set(device.peerId, device);
  });

  // 确保自己在列表中
  if (myDeviceInfo.value) {
    onlineDevices.value.set(myDeviceInfo.value.peerId, myDeviceInfo.value);
  }

  message.success(`已刷新，当前发现 ${onlineDevices.value.size} 个设备`);
}

/**
 * 提交用户设置
 */
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

/**
 * 文件转 DataURL
 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 头像变更
 */
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
</script>

<template>
  <div class="center-container">
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
        <a-form-item label="用户名" required>
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
    <a-row :gutter="[16, 16]">
      <a-col :xs="24" :md="8">
        <a-card title="我的信息" :bordered="false">
          <a-descriptions :column="1">
            <a-descriptions-item label="用户名">
              {{ userStore.userInfo.username || '未设置' }}
            </a-descriptions-item>
            <a-descriptions-item label="我的 Peer ID">
              <a-typography-text
                v-if="userStore.myPeerId"
                copyable
                :copy-text="userStore.myPeerId"
                @copy="copyPeerId(userStore.myPeerId!)"
              >
                {{ userStore.myPeerId }}
              </a-typography-text>
              <a-typography-text v-else type="secondary">连接中...</a-typography-text>
            </a-descriptions-item>
            <a-descriptions-item label="连接状态">
              <a-badge
                :status="isConnected ? 'processing' : 'error'"
                :text="isConnected ? '已连接' : '未连接'"
              />
            </a-descriptions-item>
          </a-descriptions>
        </a-card>
      </a-col>

      <a-col :xs="24" :md="16">
        <a-card title="发现中心" :bordered="false">
          <template #extra>
            <a-button size="small" @click="refreshDiscovery">
              <template #icon>
                <ReloadOutlined />
              </template>
              刷新
            </a-button>
          </template>

          <!-- 查询/添加设备 -->
          <div class="query-section">
            <a-input-group compact>
              <a-input
                v-model:value="queryPeerIdInput"
                placeholder="输入对方 Peer ID 进行查询或添加"
                style="width: calc(100% - 130px)"
                @pressEnter="queryDevices"
              />
              <a-button type="primary" @click="queryDevices" :loading="isQuerying">
                查询
              </a-button>
              <a-button @click="addDeviceManually">
                <template #icon>
                  <PlusOutlined />
                </template>
                添加
              </a-button>
            </a-input-group>
          </div>

          <!-- 在线设备列表 -->
          <div v-if="sortedDevices.length === 0" class="empty-state">
            <a-empty description="暂无在线设备">
              <template #image>
                <TeamOutlined style="font-size: 64px; color: #ccc" />
              </template>
              <a-typography-paragraph type="secondary">
                <p>去中心化发现中心使用说明：</p>
              </a-typography-paragraph>
              <a-typography-paragraph type="secondary" style="font-size: 12px">
                1. 输入已知设备的 Peer ID 点击"查询"，向该设备询问它已发现的设备<br />
                2. 输入新的 Peer ID 点击"添加"，直接将该设备添加到发现列表<br />
                3. 每个节点都是发现中心，可以互相询问已发现的设备
              </a-typography-paragraph>
            </a-empty>
          </div>

          <a-list v-else :data-source="sortedDevices" :grid="{ gutter: 16, xs: 1, sm: 2, md: 2 }">
            <template #renderItem="{ item }">
              <a-list-item>
                <a-card
                  hoverable
                  size="small"
                  class="device-card"
                  :class="{ 'is-me': item.peerId === userStore.myPeerId }"
                  @click="item.peerId !== userStore.myPeerId && handleDeviceClick(item)"
                >
                  <a-card-meta>
                    <template #avatar>
                      <a-avatar :src="item.avatar || undefined" :size="48">
                        {{ item.username.charAt(0).toUpperCase() }}
                      </a-avatar>
                    </template>
                    <template #title>
                      {{ item.username }}
                      <a-tag v-if="item.peerId === userStore.myPeerId" color="blue" size="small">我</a-tag>
                      <a-tag v-else-if="isInChat(item.peerId)" color="green" size="small">已加入聊天</a-tag>
                    </template>
                    <template #description>
                      <a-typography-text type="secondary" style="font-size: 12px">
                        {{ item.peerId }}
                      </a-typography-text>
                    </template>
                  </a-card-meta>
                  <template #actions>
                    <a-badge status="processing" text="在线" />
                  </template>
                </a-card>
              </a-list-item>
            </template>
          </a-list>
        </a-card>
      </a-col>
    </a-row>
  </div>
</template>

<style scoped>
.center-container {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.query-section {
  margin-bottom: 16px;
}

.empty-state {
  padding: 40px 0;
}

.device-card {
  cursor: pointer;
  transition: all 0.3s;
}

.device-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.device-card.is-me {
  cursor: default;
  background-color: #f0f5ff;
  border-color: #1890ff;
}

.device-card.is-me:hover {
  transform: none;
  box-shadow: none;
}

@media (max-width: 768px) {
  .center-container {
    padding: 16px;
  }
}

.avatar-tip {
  font-size: 12px;
  color: #999;
  margin-top: 8px;
}
</style>
