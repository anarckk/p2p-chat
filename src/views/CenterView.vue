<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useUserStore } from '../stores/userStore';
import { useChatStore } from '../stores/chatStore';
import { useDeviceStore } from '../stores/deviceStore';
import { usePeerManager } from '../composables/usePeerManager';
import { message } from 'ant-design-vue';
import type { OnlineDevice } from '../types';
import { ReloadOutlined, TeamOutlined, PlusOutlined } from '@ant-design/icons-vue';

const userStore = useUserStore();
const chatStore = useChatStore();
const deviceStore = useDeviceStore();
const peerManager = usePeerManager();
const {
  isConnected,
  queryDiscoveredDevices,
  addDiscoveredDevice,
  sendDiscoveryNotification,
  queryUsername,
  checkOnline,
  requestAllDeviceLists,
  requestDeviceList,
  tryBecomeBootstrap,
} = peerManager;

const queryPeerIdInput = ref('');
const isQuerying = ref(false);

// 使用 deviceStore 中的设备列表
const storedDevices = computed(() => deviceStore.allDevices);

// 我的设备信息
const myDeviceInfo = computed(() => {
  if (!userStore.myPeerId) return null;
  return {
    peerId: userStore.myPeerId,
    username: userStore.userInfo.username || userStore.myPeerId,
    avatar: userStore.userInfo.avatar,
    lastHeartbeat: Date.now(),
    firstDiscovered: Date.now(),
    isOnline: true,
  };
});

// 排序后的设备列表（按最后心跳时间降序）
const sortedDevices = computed(() => {
  const allDevices = [...storedDevices.value];
  if (myDeviceInfo.value) {
    // 确保自己在列表中
    const myId = myDeviceInfo.value.peerId;
    const hasMe = allDevices.some((d) => d.peerId === myId);
    if (!hasMe) {
      allDevices.push(myDeviceInfo.value);
    }
  }
  return allDevices.sort((a, b) => b.lastHeartbeat - a.lastHeartbeat);
});

// 检查设备是否已在聊天列表
function isInChat(peerId: string): boolean {
  const contact = chatStore.getContact(peerId);
  return contact !== undefined;
}

// 在线检查函数：检查指定设备是否在线
async function checkDeviceOnline(device: OnlineDevice): Promise<boolean> {
  if (!isConnected.value) {
    return false;
  }

  try {
    // 发送在线检查请求（携带版本号，自动触发用户信息同步）
    return await checkOnline(device.peerId);
  } catch (error) {
    console.error('[Center] Check online error:', error);
    return false;
  }
}

onMounted(async () => {
  // 尝试成为宇宙启动者
  tryBecomeBootstrap();

  // 从 localStorage 加载已保存的设备列表
  deviceStore.loadDevices();

  // 加载聊天数据（确保 isInChat 能正确工作）
  chatStore.loadFromStorage();

  // 启动心跳定时器
  deviceStore.startHeartbeatTimer(async (device: OnlineDevice) => {
    // 定时检查设备在线状态的回调函数
    if (!isConnected.value) {
      return false;
    }

    try {
      // 发送在线检查请求（携带版本号，自动触发用户信息同步）
      return await checkOnline(device.peerId);
    } catch (error) {
      console.error('[Center] Heartbeat check error:', error);
      return false;
    }
  });

  // 监听发现设备更新事件，自动刷新
  const handleDiscoveryUpdate = () => {
    console.log('[Center] Discovery devices updated, refreshing...');
    // 触发重新渲染
    deviceStore.updateOnlineStatus();
  };

  window.addEventListener('discovery-devices-updated', handleDiscoveryUpdate);

  // 清理事件监听器
  onUnmounted(() => {
    window.removeEventListener('discovery-devices-updated', handleDiscoveryUpdate);
  });
});

onUnmounted(() => {
  // 停止心跳定时器（注意：不在这里停止，让它在全局运行）
  // deviceStore.stopHeartbeatTimer();
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
  if (storedDevices.value.some((d) => d.peerId === peerId)) {
    message.info('该设备已存在');
    return;
  }

  console.log('[Center] Adding device manually:', peerId);

  // 先添加到在线设备列表（使用临时用户名）
  const newDevice: OnlineDevice = {
    peerId,
    username: peerId,
    avatar: null,
    lastHeartbeat: Date.now(),
    firstDiscovered: Date.now(),
    isOnline: true,
  };

  // 添加到 peerInstance 和 deviceStore
  addDiscoveredDevice(newDevice);
  console.log('[Center] Device added to store:', newDevice);

  // 发送发现通知给对端
  console.log('[Center] Sending discovery notification to:', peerId);
  try {
    await sendDiscoveryNotification(peerId);
    console.log('[Center] Discovery notification sent to:', peerId);
  } catch (error) {
    console.error('[Center] Error sending discovery notification:', error);
  }

  // 显示成功消息（设备已添加，即使查询用户名失败也算成功）
  message.success(`已添加设备 ${peerId}`);
  queryPeerIdInput.value = '';

  // 设备互相发现：向新添加的设备询问其设备列表
  requestDeviceList(peerId).then((devices) => {
    if (devices.length > 0) {
      console.log('[Center] Discovered ' + devices.length + ' devices from ' + peerId);
    }
  }).catch((error) => {
    console.error('[Center] Request device list error:', error);
  });

  // 异步查询对端的用户名（不阻塞UI）
  console.log('[Center] About to query username for:', peerId);
  queryUsername(peerId).then((userInfo) => {
    if (userInfo) {
      console.log('[Center] Received user info:', userInfo);
      // 更新设备信息
      newDevice.username = userInfo.username;
      newDevice.avatar = userInfo.avatar;
      // 同时更新 peerInstance 和 deviceStore
      addDiscoveredDevice({ ...newDevice });
      // 触发 UI 更新
      deviceStore.addOrUpdateDevice({ ...newDevice });
    } else {
      console.warn('[Center] Failed to get user info for:', peerId);
      // 即使查询失败，设备也已添加
      deviceStore.addOrUpdateDevice({ ...newDevice });
    }
  }).catch((error) => {
    console.error('[Center] Error querying username:', error);
  });
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
 * 刷新发现列表（设备互相发现 + 在线状态检查）
 */
async function refreshDiscovery() {
  // 记录刷新开始
  console.log('[Center] Refresh discovery started');

  // 检查是否已连接
  if (!isConnected.value) {
    console.warn('[Center] Not connected to Peer Server');
    // 仍然继续执行，但记录警告
  }

  // 检查用户信息是否已设置
  if (!userStore.myPeerId) {
    console.warn('[Center] User info not set');
    // 仍然继续执行，但记录警告
  }

  try {
    // 1. 向所有设备请求设备列表（设备互相发现）
    await requestAllDeviceLists();
  } catch (error) {
    console.error('[Center] Request device lists error:', error);
  }

  // 2. 主动检查每个设备的在线状态（除了自己）
  const devicesToCheck = storedDevices.value.filter(
    (d) => d.peerId !== userStore.myPeerId
  );

  let onlineCount = 0;
  const checkPromises = devicesToCheck.map(async (device) => {
    try {
      const isOnline = await checkOnline(device.peerId);
      if (isOnline) {
        onlineCount++;
      }
      // 更新设备的在线状态
      deviceStore.updateDeviceOnlineStatus(device.peerId, isOnline);
      return { peerId: device.peerId, isOnline };
    } catch (error) {
      // 单个设备检查失败不应影响其他设备
      console.warn('[Center] Check online failed for ' + device.peerId + ':', error);
      return { peerId: device.peerId, isOnline: false };
    }
  });

  await Promise.allSettled(checkPromises);

  console.log('[Center] Refresh completed: ' + storedDevices.value.length + ' devices, ' + onlineCount + ' online');

  // 注意：不调用 updateOnlineStatus()，因为它会根据 lastHeartbeat 重新计算状态，
  // 可能会覆盖 checkOnline() 的实际检查结果

  message.success(`已刷新，当前发现 ${storedDevices.value.length} 个设备，其中 ${onlineCount} 个在线`);
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
            <a-button size="small" @click="refreshDiscovery" aria-label="refresh-discovery">
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
              <a-button type="primary" @click="queryDevices" :loading="isQuerying" aria-label="query-devices-button">
                查询
              </a-button>
              <a-button @click="addDeviceManually" aria-label="add-device">
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
                3. 每个节点都是发现中心，可以互相询问已发现的设备<br />
                4. 设备列表会自动保存，刷新页面后依然保留<br />
                5. 超过3天未在线的设备会自动删除
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
                  :class="{ 'is-me': item.peerId === userStore.myPeerId, 'is-offline': !item.isOnline }"
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
                      <template v-else>
                        <a-tag v-if="isInChat(item.peerId)" color="green" size="small">聊天中</a-tag>
                        <a-tag v-if="item.isOnline" color="success" size="small">在线</a-tag>
                        <a-tag v-else color="default" size="small">离线</a-tag>
                      </template>
                    </template>
                    <template #description>
                      <a-typography-text type="secondary" style="font-size: 12px">
                        {{ item.peerId }}
                      </a-typography-text>
                    </template>
                  </a-card-meta>
                  <template #actions>
                    <a-badge :status="item.isOnline ? 'processing' : 'default'" :text="item.isOnline ? '在线' : '离线'" />
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

.device-card.is-offline {
  opacity: 0.7;
}

@media (max-width: 768px) {
  .center-container {
    padding: 16px;
  }
}

</style>
