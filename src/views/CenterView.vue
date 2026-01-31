<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useUserStore } from '../stores/userStore';
import { useChatStore } from '../stores/chatStore';
import { useDeviceStore } from '../stores/deviceStore';
import { usePeerManager } from '../composables/usePeerManager';
import type { OnlineDevice } from '../types';
import { ReloadOutlined, TeamOutlined, PlusOutlined, LoadingOutlined, SyncOutlined } from '@ant-design/icons-vue';

const userStore = useUserStore();
const chatStore = useChatStore();
const deviceStore = useDeviceStore();
const peerManager = usePeerManager();
const {
  isConnected,
  isBootstrap,
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
const isRefreshing = ref(false);

// 内联提示状态
const inlineMessage = ref('');
const inlineMessageType = ref<'success' | 'error' | 'warning' | 'info'>('info');

// 设备刷新状态跟踪：Map<peerId, { refreshing: boolean, duration: number | null, error: boolean }>
interface DeviceRefreshStatus {
  refreshing: boolean;
  duration: number | null;
  error: boolean;
}

const deviceRefreshStatus = ref<Map<string, DeviceRefreshStatus>>(new Map());

/**
 * 获取设备的刷新状态
 */
function getDeviceRefreshStatus(peerId: string): DeviceRefreshStatus {
  return deviceRefreshStatus.value.get(peerId) || { refreshing: false, duration: null, error: false };
}

// 使用 deviceStore 中的设备列表
const storedDevices = computed(() => deviceStore.allDevices);

// 我的设备信息
const myDeviceInfo = computed((): (OnlineDevice | null) => {
  if (!userStore.userInfo.username) { return null; }
  return {
    peerId: userStore.myPeerId || 'connecting...',
    username: userStore.userInfo.username || (userStore.myPeerId || 'Unknown'),
    avatar: userStore.userInfo.avatar || null,
    lastHeartbeat: Date.now(),
    firstDiscovered: Date.now(),
    isOnline: true,
  };
});

// 排序后的设备列表（按最后心跳时间降序）
const sortedDevices = computed(() => {
  const allDevices = [...storedDevices.value];
  if (myDeviceInfo.value) {
    // 确保自己在列表中，并且始终使用最新的用户信息
    const myId = myDeviceInfo.value.peerId;
    const existingIndex = allDevices.findIndex((d) => d.peerId === myId);
    if (existingIndex >= 0) {
      // 如果已存在，更新用户信息（特别是头像可能已更新）
      allDevices[existingIndex] = {
        ...allDevices[existingIndex],
        username: myDeviceInfo.value.username,
        avatar: myDeviceInfo.value.avatar,
        lastHeartbeat: Date.now(),
      } as OnlineDevice;
    } else {
      // 如果不存在，添加自己
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
  // 确保用户信息已加载
  await userStore.loadUserInfo();
  
  // 调试日志：打印用户信息
  console.log('[Center] User info loaded:', {
    username: userStore.userInfo.username,
    avatarLength: userStore.userInfo.avatar?.length || 0,
    myPeerId: userStore.myPeerId,
  });

  // 性能监控：记录组件挂载开始时间
  const mountStartTime = performance.now();
  console.log('[Center-Performance] ===== 组件开始挂载 =====');
  console.log('[Center-Performance] Timestamp:', Date.now());

  // 性能日志辅助函数
  const perfLog = (phase: string, message: string) => {
    const now = performance.now();
    const duration = Math.round(now - mountStartTime);
    console.log(`[Center-Performance] [${phase}] +${duration}ms ${message}`);

    // 保存到 window 对象供 E2E 测试读取
    if (!(window as any).__performanceLogs) {
      (window as any).__performanceLogs = [];
    }
    (window as any).__performanceLogs.push({
      timestamp: Date.now(),
      phase,
      duration,
      message,
    });
  };

  perfLog('start', '组件开始挂载');

  // 尝试成为宇宙启动者
  perfLog('before-bootstrap', '准备成为宇宙启动者');
  const bootstrapStart = performance.now();
  tryBecomeBootstrap();
  perfLog('after-bootstrap', `成为宇宙启动者调用完成 (耗时 ${Math.round(performance.now() - bootstrapStart)}ms)`);

  // 从 localStorage 加载已保存的设备列表（异步等待）
  perfLog('before-load-devices', '准备加载设备列表');
  const loadDevicesStart = performance.now();
  await deviceStore.loadDevices();
  perfLog('after-load-devices', `设备列表加载完成 (耗时 ${Math.round(performance.now() - loadDevicesStart)}ms)`);

  // 加载聊天数据（确保 isInChat 能正确工作）
  perfLog('before-load-chat', '准备加载聊天数据');
  const loadChatStart = performance.now();
  chatStore.loadFromStorage();
  perfLog('after-load-chat', `聊天数据加载完成 (耗时 ${Math.round(performance.now() - loadChatStart)}ms)`);

  // 启动心跳定时器
  perfLog('before-heartbeat', '准备启动心跳定时器');
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
  perfLog('after-heartbeat', '心跳定时器启动完成');

  // 监听发现设备更新事件，自动刷新
  const handleDiscoveryUpdate = () => {
    console.log('[Center] Discovery devices updated, refreshing...');
    // 触发重新渲染
    deviceStore.updateOnlineStatus();
    // 同步更新 chatStore 中所有联系人的在线状态，确保发现中心和聊天列表的在线状态保持一致
    deviceStore.allDevices.forEach((device) => {
      if (chatStore.getContact(device.peerId)) {
        chatStore.setContactOnline(device.peerId, device.isOnline ?? false);
      }
    });
  };

  window.addEventListener('discovery-devices-updated', handleDiscoveryUpdate);
  perfLog('event-listeners', '事件监听器注册完成');

  // 清理事件监听器
  onUnmounted(() => {
    window.removeEventListener('discovery-devices-updated', handleDiscoveryUpdate);
  });

  perfLog('complete', '组件挂载完成');
  const totalMountTime = Math.round(performance.now() - mountStartTime);
  console.log('[Center-Performance] ===== 组件挂载完成 =====');
  console.log('[Center-Performance] 总耗时:', totalMountTime, 'ms');
});

onUnmounted(() => {
  // 停止心跳定时器（注意：不在这里停止，让它在全局运行）
  // deviceStore.stopHeartbeatTimer();
});

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
 * 查询指定节点的已发现设备
 */
async function queryDevices() {
  clearInlineMessage();

  if (!queryPeerIdInput.value.trim()) {
    showInlineMessage('请输入要查询的 Peer ID', 'warning');
    return;
  }

  isQuerying.value = true;
  try {
    const devices = await queryDiscoveredDevices(queryPeerIdInput.value.trim());

    if (devices.length > 0) {
      showInlineMessage(`从 ${queryPeerIdInput.value} 发现了 ${devices.length} 个设备`, 'success');
    } else {
      showInlineMessage('未发现任何设备', 'info');
    }

    queryPeerIdInput.value = '';
  } catch (error) {
    console.error('[Center] Query error:', error);
    showInlineMessage('查询失败', 'error');
  } finally {
    isQuerying.value = false;
  }
}

/**
 * 手动添加设备
 */
async function addDeviceManually() {
  clearInlineMessage();

  if (!queryPeerIdInput.value.trim()) {
    showInlineMessage('请输入要添加的 Peer ID', 'warning');
    return;
  }

  const peerId = queryPeerIdInput.value.trim();

  // 检查是否已存在
  const existingDevice = storedDevices.value.find((d) => d.peerId === peerId);
  if (existingDevice) {
    showInlineMessage('该设备已存在', 'info');
    // 即使设备已存在，也发送发现通知，确保对方知道我们的存在
    // 这对于被动发现机制很重要，特别是当设备通过宇宙启动者机制发现对方时
    console.log('[Center] Device already exists, but sending discovery notification anyway:', peerId);
    try {
      await sendDiscoveryNotification(peerId);
      console.log('[Center] Discovery notification sent to existing device:', peerId);
    } catch (error) {
      console.error('[Center] Error sending discovery notification:', error);
    }
    queryPeerIdInput.value = '';
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

  showInlineMessage(`已添加设备 ${peerId}`, 'success');
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
  showInlineMessage(`已添加 ${device.username} 到聊天列表`, 'success');
}

/**
 * 复制 Peer ID
 */
function copyPeerId(id: string) {
  clearInlineMessage();
  navigator.clipboard.writeText(id);
  showInlineMessage('已复制到剪贴板', 'success');
}

/**
 * 刷新发现列表（设备互相发现 + 在线状态检查）
 */
async function refreshDiscovery() {
  clearInlineMessage();

  // 记录刷新开始
  console.log('[Center] Refresh discovery started');

  isRefreshing.value = true;

  try {
    // 检查是否已连接
    if (!isConnected.value) {
      console.warn('[Center] Not connected to Peer Server');
    }

    // 检查用户信息是否已设置
    if (!userStore.myPeerId) {
      console.warn('[Center] User info not set');
    }

    // 获取要刷新的设备列表（排除自己）
    const devicesToCheck = storedDevices.value.filter(
      (d) => d.peerId !== userStore.myPeerId
    );

    // 初始化所有设备的刷新状态
    devicesToCheck.forEach((device) => {
      deviceRefreshStatus.value.set(device.peerId, {
        refreshing: true,
        duration: null,
        error: false,
      });
    });

    try {
      // 1. 向所有设备请求设备列表（设备互相发现）
      await requestAllDeviceLists();
    } catch (error) {
      console.error('[Center] Request device lists error:', error);
    }

    // loading 状态只覆盖发出请求阶段，请求发出后立即结束 loading
    // 后续的设备检查会在后台继续进行，每个设备独立更新状态
    isRefreshing.value = false;

    // 2. 主动检查每个设备的在线状态（并发执行，各自独立更新）
    const checkPromises = devicesToCheck.map(async (device) => {
      const startTime = Date.now();
      const peerId = device.peerId;

      try {
        // 发起在线检查请求
        const isOnline = await checkOnline(peerId);
        const duration = Date.now() - startTime;

        // 更新设备的在线状态
        deviceStore.updateDeviceOnlineStatus(peerId, isOnline);

        // 同步更新 chatStore 中的联系人在线状态，确保发现中心和聊天列表的在线状态保持一致
        if (chatStore.getContact(peerId)) {
          chatStore.setContactOnline(peerId, isOnline);
        }

        // 更新刷新状态（完成，显示耗时）
        deviceRefreshStatus.value.set(peerId, {
          refreshing: false,
          duration,
          error: false,
        });

        console.log('[Center] Device ' + peerId + ' checked: online=' + isOnline + ', duration=' + duration + 'ms');

        return { peerId, isOnline, duration };
      } catch (error) {
        // 单个设备检查失败不应影响其他设备
        console.warn('[Center] Check online failed for ' + peerId + ':', error);

        // 更新刷新状态（失败）
        deviceRefreshStatus.value.set(peerId, {
          refreshing: false,
          duration: null,
          error: true,
        });

        return { peerId, isOnline: false, duration: null };
      }
    });

    // 不等待所有检查完成，让它们在后台并发执行
    // 使用 Promise.allSettled 确保所有 Promise 都被处理（无论成功失败）
    Promise.allSettled(checkPromises).then((results) => {
      const onlineCount = results.filter((r) => r.status === 'fulfilled' && (r.value as any).isOnline).length;
      console.log('[Center] Refresh completed: ' + storedDevices.value.length + ' devices, ' + onlineCount + ' online');
      showInlineMessage(`已刷新，当前发现 ${storedDevices.value.length} 个设备，其中 ${onlineCount} 个在线`, 'success');
    });
  } catch (error) {
    console.error('[Center] Refresh error:', error);
    showInlineMessage('刷新失败', 'error');
    isRefreshing.value = false;
  }
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
            <a-button size="small" :loading="isRefreshing" @click="refreshDiscovery" aria-label="refresh-discovery">
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
            <!-- 内联提示 -->
            <div v-if="inlineMessage" class="inline-message" :class="`inline-message-${inlineMessageType}`">
              {{ inlineMessage }}
            </div>
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
                  :class="{ 'is-me': item.peerId === userStore.myPeerId || item.peerId === 'connecting...', 'is-offline': !item.isOnline }"
                  @click="item.peerId !== userStore.myPeerId && item.peerId !== 'connecting...' && handleDeviceClick(item)"
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
                      <a-tag v-if="item.peerId === userStore.myPeerId && isBootstrap" color="purple" size="small">宇宙启动者</a-tag>
                      <template v-if="item.peerId !== userStore.myPeerId && item.peerId !== 'connecting...'">
                        <a-tag v-if="item.isBootstrap" color="purple" size="small">宇宙启动者</a-tag>
                        <a-tag v-if="isInChat(item.peerId)" color="green" size="small">聊天中</a-tag>
                        <a-tag v-if="item.isOnline" color="success" size="small">在线</a-tag>
                        <a-tag v-else color="default" size="small">离线</a-tag>
                        <!-- 刷新状态显示（仅在线设备显示） -->
                        <template v-if="item.isOnline">
                          <template v-if="getDeviceRefreshStatus(item.peerId).refreshing">
                            <SyncOutlined spin style="color: #1890ff; margin-left: 4px;" />
                          </template>
                          <template v-else-if="getDeviceRefreshStatus(item.peerId).duration !== null">
                            <span class="refresh-duration">{{ getDeviceRefreshStatus(item.peerId).duration }}ms</span>
                          </template>
                        </template>
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

.refresh-duration {
  color: #52c41a;
  font-size: 12px;
  font-weight: 500;
  margin-left: 4px;
}

@media (max-width: 768px) {
  .center-container {
    padding: 16px;
  }
}

</style>
