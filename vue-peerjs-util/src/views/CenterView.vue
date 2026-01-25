<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useUserStore } from '../stores/userStore';
import { useChatStore } from '../stores/chatStore';
import { usePeerManager } from '../composables/usePeerManager';
import { message } from 'ant-design-vue';
import type { OnlineDevice } from '../types';
import { ReloadOutlined, TeamOutlined, PlusOutlined } from '@ant-design/icons-vue';

const userStore = useUserStore();
const chatStore = useChatStore();
const {
  isConnected,
  init,
  queryDiscoveredDevices,
  getDiscoveredDevices,
  addDiscoveredDevice,
} = usePeerManager();

const onlineDevices = ref<Map<string, OnlineDevice>>(new Map());
const queryPeerIdInput = ref('');
const isQuerying = ref(false);

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

onMounted(async () => {
  // 确保 Peer 已初始化
  if (!isConnected.value) {
    init();
  }

  // 将自己添加到在线设备列表
  if (myDeviceInfo.value) {
    onlineDevices.value.set(myDeviceInfo.value.peerId, myDeviceInfo.value);
  }
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
function addDeviceManually() {
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

  // 添加到在线设备列表
  const newDevice: OnlineDevice = {
    peerId,
    username: peerId,
    avatar: null,
    lastHeartbeat: Date.now(),
  };

  onlineDevices.value.set(peerId, newDevice);
  addDiscoveredDevice(newDevice);

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
</script>

<template>
  <div class="center-container">
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
</style>
