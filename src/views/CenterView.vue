<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue';
import { useUserStore } from '../stores/userStore';
import { useChatStore } from '../stores/chatStore';
import { useDeviceStore } from '../stores/deviceStore';
import { usePeerManager } from '../composables/usePeerManager';
import type { OnlineDevice } from '../types';
import { RadarChartOutlined, ReloadOutlined, TeamOutlined, PlusOutlined, LoadingOutlined, SyncOutlined, LinkOutlined, KeyOutlined, EyeOutlined, CrownOutlined, SafetyCertificateOutlined, UserOutlined, CopyOutlined } from '@ant-design/icons-vue';
import { useRouter } from 'vue-router';

const router = useRouter();

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

// 查看公钥弹窗状态
const publicKeyModalVisible = ref(false);
const selectedDevicePublicKey = ref('');
const selectedDeviceName = ref('');
const selectedDeviceKeyStatus = ref<string | undefined>(undefined);

/**
 * 获取设备的刷新状态
 */
function getDeviceRefreshStatus(peerId: string): DeviceRefreshStatus {
  return deviceRefreshStatus.value.get(peerId) || { refreshing: false, duration: null, error: false };
}

// 使用 deviceStore 中的设备列表
const storedDevices = computed(() => deviceStore.allDevices);

// ==================== 身份安全相关 ====================

// 计算属性：我的密钥
const myPublicKey = computed(() => userStore.myPublicKey);
const myPrivateKey = computed(() => userStore.myPrivateKey);
const isCryptoInitialized = computed(() => userStore.isCryptoInitialized);

// 有公钥的设备
const devicesWithKeys = computed(() => {
  return sortedDevices.value.filter((d) => d.peerId !== userStore.myPeerId && d.peerId !== 'connecting...' && d.publicKey);
});

// 截断公钥显示
function truncateKey(key: string): string {
  if (key.length < 40) return key;
  return `${key.substring(0, 20)}...${key.substring(key.length - 20)}`;
}

const myPublicKeyTruncated = computed(() => {
  if (!myPublicKey.value) return '加载中...';
  return truncateKey(myPublicKey.value);
});

// 获取密钥状态颜色
function getKeyStatusColor(status?: string): string {
  switch (status) {
    case 'verified': return 'success';
    case 'exchanged': return 'processing';
    case 'compromised': return 'error';
    case 'pending': return 'warning';
    default: return 'default';
  }
}

// 获取密钥状态文本
function getKeyStatusText(status?: string): string {
  switch (status) {
    case 'verified': return '已验证';
    case 'exchanged': return '已交换';
    case 'compromised': return '被攻击';
    case 'pending': return '交换中';
    default: return '未交换';
  }
}

// 复制公钥
async function copyMyPublicKey() {
  if (myPublicKey.value) {
    await navigator.clipboard.writeText(myPublicKey.value);
    console.log('[CenterView] Public key copied');
  }
}

// 复制设备公钥
async function copyDevicePublicKey(peerId: string) {
  const device = deviceStore.getDevice(peerId);
  if (device?.publicKey) {
    await navigator.clipboard.writeText(device.publicKey);
    console.log('[CenterView] Device public key copied:', peerId);
  }
}

// 信任设备
async function trustDevice(peerId: string) {
  const device = deviceStore.getDevice(peerId);
  if (device) {
    device.keyExchangeStatus = 'verified';
    await deviceStore.addOrUpdateDevice(device);
    console.log('[CenterView] Device trusted:', peerId);
  }
}

// 标记为被攻击
async function markCompromised(peerId: string) {
  await deviceStore.removeDevice(peerId);
  console.log('[CenterView] Device removed as compromised:', peerId);
}

// 重新生成密钥
async function handleRegenerateKeys() {
  try {
    await userStore.regenerateCryptoKeys();
    console.log('[CenterView] Keys regenerated');
  } catch (error) {
    console.error('[CenterView] Failed to regenerate keys:', error);
  }
}

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
    // 获取超时配置（毫秒）
    const timeout = userStore.loadDeviceCheckTimeout() * 1000;
    // 发送在线检查请求（携带版本号，自动触发用户信息同步）
    return await checkOnline(device.peerId, timeout);
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

  // 检查是否有未处理的待定事件
  const pendingUpdate = (window as any).__pendingDiscoveryUpdate;
  if (pendingUpdate) {
    console.log('[Center] Found pending discovery update, processing now');
    setTimeout(() => {
      handleDiscoveryUpdate();
      delete (window as any).__pendingDiscoveryUpdate;
    }, 100);
  }
  
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
  // 加载设备状态检测间隔配置
  const checkInterval = userStore.loadDeviceCheckInterval();
  const checkTimeout = userStore.loadDeviceCheckTimeout() * 1000;
  deviceStore.startHeartbeatTimer(async (device: OnlineDevice) => {
    // 定时检查设备在线状态的回调函数
    if (!isConnected.value) {
      return false;
    }

    try {
      // 发送在线检查请求（携带版本号，自动触发用户信息同步）
      return await checkOnline(device.peerId, checkTimeout);
    } catch (error) {
      console.error('[Center] Heartbeat check error:', error);
      return false;
    }
  }, checkInterval);
  perfLog('after-heartbeat', '心跳定时器启动完成');

  // 监听发现设备更新事件，自动刷新
  const handleDiscoveryUpdate = () => {
    console.log('[Center] Discovery devices updated, refreshing...');

    // 强制刷新设备列表
    deviceStore.updateOnlineStatus();

    // 同步更新 chatStore 中所有联系人的在线状态，确保发现中心和聊天列表的在线状态保持一致
    deviceStore.allDevices.forEach((device) => {
      if (chatStore.getContact(device.peerId)) {
        chatStore.setContactOnline(device.peerId, device.isOnline ?? false);
      }
    });

    // 强制重新渲染
    nextTick(() => {
      console.log('[Center] Discovery update processed, UI refreshed');
    });
  };

  // 检查是否有未处理的事件（在组件挂载前触发的事件）
  if ((window as any).__pendingDiscoveryUpdate) {
    console.log('[Center] Processing pending discovery update');
    handleDiscoveryUpdate();
    delete (window as any).__pendingDiscoveryUpdate;
  }

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
 * 查看设备公钥
 */
function viewDevicePublicKey(device: OnlineDevice) {
  if (!device.publicKey) {
    showInlineMessage('该设备暂无公钥信息', 'warning');
    return;
  }
  selectedDevicePublicKey.value = device.publicKey;
  selectedDeviceName.value = device.username;
  selectedDeviceKeyStatus.value = device.keyExchangeStatus;
  publicKeyModalVisible.value = true;
}

/**
 * 复制设备公钥（从弹窗中）
 */
async function copyPublicKeyFromModal() {
  if (selectedDevicePublicKey.value) {
    await navigator.clipboard.writeText(selectedDevicePublicKey.value);
    showInlineMessage('公钥已复制到剪贴板', 'success');
  }
}

/**
 * 关闭公钥弹窗
 */
function closePublicKeyModal() {
  publicKeyModalVisible.value = false;
  selectedDevicePublicKey.value = '';
  selectedDeviceName.value = '';
  selectedDeviceKeyStatus.value = undefined;
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
    <!-- 页面标题 -->
    <div class="page-header">
      <h1 class="page-title">
        <RadarChartOutlined class="title-icon" />
        发现中心
      </h1>
      <p class="page-subtitle">去中心化的设备发现与互联</p>
    </div>

    <a-row :gutter="[20, 20]">
      <!-- 左侧：我的信息 -->
      <a-col :xs="24" :lg="6">
        <a-card class="my-info-card" :bordered="false">
          <template #title>
            <UserOutlined />
            我的信息
          </template>
          <div class="info-section">
            <div class="avatar-section">
              <a-avatar :size="80" :src="userStore.userInfo.avatar">
                {{ userStore.userInfo.username?.charAt(0).toUpperCase() || 'U' }}
              </a-avatar>
            </div>
            <a-descriptions :column="1" size="small">
              <a-descriptions-item label="用户名">
                <span class="username-text">{{ userStore.userInfo.username || '未设置' }}</span>
              </a-descriptions-item>
              <a-descriptions-item label="Peer ID">
                <a-typography-text
                  v-if="userStore.myPeerId"
                  copyable
                  :copy-text="userStore.myPeerId"
                  class="peer-id-text"
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
            <div v-if="isBootstrap" class="bootstrap-badge">
              <a-tag color="purple" style="margin: 0;">
                <CrownOutlined style="margin-right: 4px;" />
                宇宙启动者
              </a-tag>
            </div>
          </div>
        </a-card>

        <!-- 身份安全区域 -->
        <a-card v-if="isCryptoInitialized" class="security-card" title="身份安全" :bordered="false">
          <template #title>
            <SafetyCertificateOutlined />
            身份安全
          </template>
          <div class="security-section">
            <div class="key-display">
              <div class="key-label">我的公钥</div>
              <a-typography-text code copyable class="key-text">
                {{ myPublicKeyTruncated }}
              </a-typography-text>
            </div>
            <a-collapse ghost class="private-key-collapse">
              <a-collapse-panel header="查看私钥">
                <a-typography-text code class="key-text">
                  {{ myPrivateKey || '未初始化' }}
                </a-typography-text>
              </a-collapse-panel>
            </a-collapse>
          </div>
        </a-card>
      </a-col>

      <!-- 右侧：发现中心 -->
      <a-col :xs="24" :lg="18">
        <a-card class="discovery-card" :bordered="false">
          <template #title>
            <TeamOutlined />
            在线设备
            <a-badge :count="sortedDevices.length" :number-style="{ backgroundColor: '#52c41a' }" style="margin-left: 8px;" />
          </template>
          <template #extra>
            <a-button :loading="isRefreshing" @click="refreshDiscovery" aria-label="refresh-discovery">
              <template #icon>
                <ReloadOutlined />
              </template>
              刷新
            </a-button>
          </template>

          <!-- 查询/添加设备 -->
          <div class="query-section">
            <a-space compact style="width: 100%;">
              <a-input
                v-model:value="queryPeerIdInput"
                placeholder="输入 Peer ID 添加设备"
                @pressEnter="addDeviceManually"
                style="flex: 1;"
              />
              <a-button type="primary" @click="addDeviceManually" :loading="isQuerying" aria-label="add-device-button">
                <template #icon>
                  <PlusOutlined />
                </template>
                添加
              </a-button>
            </a-space>
            <!-- 内联提示 -->
            <div v-if="inlineMessage" class="inline-message" :class="`inline-message-${inlineMessageType}`">
              {{ inlineMessage }}
            </div>
          </div>

          <!-- 设备列表 -->
          <div v-if="sortedDevices.length === 0" class="empty-state">
            <a-empty description="暂无设备">
              <template #image>
                <TeamOutlined style="font-size: 64px; color: #d9d9d9;" />
              </template>
              <a-typography-paragraph type="secondary">
                输入其他设备的 Peer ID 添加设备，开始去中心化通信
              </a-typography-paragraph>
            </a-empty>
          </div>

          <div v-else class="devices-grid">
            <div
              v-for="item in sortedDevices"
              :key="item.peerId"
              class="device-item"
              :class="{
                'is-me': item.peerId === userStore.myPeerId || item.peerId === 'connecting...',
                'is-offline': !item.isOnline
              }"
              @click="item.peerId !== userStore.myPeerId && item.peerId !== 'connecting...' && handleDeviceClick(item)"
            >
              <!-- 设备卡片头部 -->
              <div class="device-header">
                <a-avatar :src="item.avatar || undefined" :size="48">
                  {{ item.username.charAt(0).toUpperCase() }}
                </a-avatar>
                <div class="device-info">
                  <div class="device-name">{{ item.username }}</div>
                  <div class="device-peer-id">{{ item.peerId }}</div>
                </div>
                <div class="device-status">
                  <a-badge
                    :status="item.isOnline ? 'processing' : 'default'"
                    :text="item.isOnline ? '在线' : '离线'"
                  />
                </div>
              </div>

              <!-- 设备标签 -->
              <div class="device-tags">
                <a-tag v-if="item.peerId === userStore.myPeerId" color="blue" size="small">我</a-tag>
                <a-tag v-if="item.isBootstrap" color="purple" size="small">
                  <CrownOutlined style="margin-right: 2px;" />
                  启动者
                </a-tag>
                <a-tag v-if="isInChat(item.peerId)" color="green" size="small">聊天中</a-tag>
                <a-tag
                  v-if="item.keyExchangeStatus && item.keyExchangeStatus !== 'exchanged'"
                  :color="getKeyStatusColor(item.keyExchangeStatus)"
                  size="small"
                >
                  {{ getKeyStatusText(item.keyExchangeStatus) }}
                </a-tag>
                <template v-if="item.isOnline && item.peerId !== userStore.myPeerId">
                  <SyncOutlined v-if="getDeviceRefreshStatus(item.peerId).refreshing" spin class="refresh-icon" />
                  <span v-else-if="getDeviceRefreshStatus(item.peerId).duration !== null" class="refresh-duration">
                    {{ getDeviceRefreshStatus(item.peerId).duration }}ms
                  </span>
                </template>
              </div>

              <!-- 设备操作 -->
              <div v-if="item.peerId !== userStore.myPeerId && item.peerId !== 'connecting...'" class="device-actions">
                <a-button
                  v-if="item.publicKey"
                  type="text"
                  size="small"
                  @click.stop="viewDevicePublicKey(item)"
                  aria-label="view-public-key"
                >
                  <KeyOutlined />
                  公钥
                </a-button>
              </div>
            </div>
          </div>
        </a-card>

        <!-- 设备公钥列表 -->
        <div v-if="devicesWithKeys.length > 0" class="devices-keys-section">
          <a-card title="设备公钥" :bordered="false">
            <template #title>
              <KeyOutlined />
              设备公钥
            </template>
            <a-space direction="vertical" :size="12" style="width: 100%;">
              <div
                v-for="device in devicesWithKeys"
                :key="device.peerId"
                class="device-key-item"
              >
                <div class="device-key-header">
                  <a-avatar :src="device.avatar || undefined" :size="32">
                    {{ device.username.charAt(0).toUpperCase() }}
                  </a-avatar>
                  <span class="device-key-name">{{ device.username }}</span>
                  <a-tag :color="getKeyStatusColor(device.keyExchangeStatus)" size="small">
                    {{ getKeyStatusText(device.keyExchangeStatus) }}
                  </a-tag>
                  <a-button
                    type="text"
                    size="small"
                    @click="copyDevicePublicKey(device.peerId)"
                    aria-label="copy-device-public-key"
                  >
                    <CopyOutlined />
                  </a-button>
                </div>
                <a-typography-text code class="device-key-text">
                  {{ truncateKey(device.publicKey || '') }}
                </a-typography-text>
                <div v-if="device.keyExchangeStatus === 'compromised'" class="warning-section">
                  <a-alert
                    type="warning"
                    message="安全警告"
                    description="此设备的公钥已发生变化"
                    show-icon
                    size="small"
                  />
                </div>
              </div>
            </a-space>
          </a-card>
        </div>
      </a-col>
    </a-row>

    <!-- 查看公钥弹窗 -->
    <a-modal
      v-model:open="publicKeyModalVisible"
      :title="`${selectedDeviceName} 的公钥`"
      width="500px"
      aria-label="device-public-key-modal"
    >
      <div class="public-key-modal-content">
        <a-descriptions :column="1" size="small">
          <a-descriptions-item label="密钥交换状态">
            <a-tag :color="getKeyStatusColor(selectedDeviceKeyStatus)">
              {{ getKeyStatusText(selectedDeviceKeyStatus) }}
            </a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="公钥">
            <a-typography-text code copyable class="modal-key-text">
              {{ truncateKey(selectedDevicePublicKey) }}
            </a-typography-text>
          </a-descriptions-item>
        </a-descriptions>
        <div v-if="selectedDeviceKeyStatus === 'compromised'" class="warning-section">
          <a-alert
            type="warning"
            message="安全警告"
            description="此设备的公钥已发生变化，可能存在中间人攻击"
            show-icon
          />
        </div>
      </div>
      <template #footer>
        <a-button @click="closePublicKeyModal">关闭</a-button>
      </template>
    </a-modal>
  </div>
</template>

<style scoped>
.center-container {
  padding: 24px;
  max-width: 1600px;
  margin: 0 auto;
}

/* 页面标题 */
.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 28px;
  font-weight: 600;
  color: #1890ff;
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-icon {
  font-size: 28px;
}

.page-subtitle {
  font-size: 14px;
  color: #8c8c8c;
  margin: 0;
}

/* 我的信息卡片 */
.my-info-card {
  height: 100%;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.info-section {
  text-align: center;
}

.avatar-section {
  margin-bottom: 16px;
}

.username-text {
  font-size: 16px;
  font-weight: 500;
  color: #262626;
}

.peer-id-text {
  font-size: 12px;
  font-family: 'Courier New', monospace;
}

.bootstrap-badge {
  margin-top: 16px;
}

/* 身份安全卡片 */
.security-card {
  margin-top: 20px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.security-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.key-display {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.key-label {
  font-size: 13px;
  font-weight: 500;
  color: #595959;
}

.key-text {
  font-size: 11px;
  word-break: break-all;
  line-height: 1.6;
}

.private-key-collapse {
  border: none;
}

.private-key-collapse :deep(.ant-collapse-header) {
  padding: 8px 0;
  font-size: 13px;
  color: #8c8c8c;
}

.private-key-collapse :deep(.ant-collapse-content) {
  border: none;
}

/* 发现中心卡片 */
.discovery-card {
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.query-section {
  margin-bottom: 20px;
}

.inline-message {
  margin-top: 12px;
  padding: 10px 16px;
  border-radius: 8px;
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

/* 空状态 */
.empty-state {
  padding: 60px 20px;
  text-align: center;
}

/* 设备网格 */
.devices-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.device-item {
  background: #fff;
  border: 1px solid #f0f0f0;
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.device-item:hover {
  border-color: #1890ff;
  box-shadow: 0 4px 12px rgba(24, 144, 255, 0.15);
  transform: translateY(-2px);
}

.device-item.is-me {
  background: linear-gradient(135deg, #e6f7ff 0%, #f0f5ff 100%);
  border-color: #adc6ff;
  cursor: default;
}

.device-item.is-me:hover {
  transform: none;
  box-shadow: none;
}

.device-item.is-offline {
  opacity: 0.6;
}

/* 设备卡片头部 */
.device-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.device-info {
  flex: 1;
  min-width: 0;
}

.device-name {
  font-size: 15px;
  font-weight: 500;
  color: #262626;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.device-peer-id {
  font-size: 11px;
  color: #8c8c8c;
  font-family: 'Courier New', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.device-status {
  font-size: 12px;
}

/* 设备标签 */
.device-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
  min-height: 24px;
}

.refresh-icon {
  color: #1890ff;
  font-size: 12px;
  margin-left: 4px;
}

.refresh-duration {
  font-size: 11px;
  color: #52c41a;
  font-weight: 500;
  margin-left: 4px;
}

/* 设备操作 */
.device-actions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}

/* 设备公钥区域 */
.devices-keys-section {
  margin-top: 20px;
}

.device-key-item {
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 12px;
}

.device-key-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.device-key-name {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
}

.device-key-text {
  font-size: 11px;
  word-break: break-all;
  display: block;
  margin-bottom: 8px;
}

.warning-section {
  margin-top: 8px;
}

/* 弹窗样式 */
.public-key-modal-content {
  padding: 8px 0;
}

.modal-key-text {
  font-size: 11px;
  word-break: break-all;
  display: block;
}

/* 响应式 */
@media (max-width: 768px) {
  .center-container {
    padding: 16px;
  }

  .page-title {
    font-size: 24px;
  }

  .devices-grid {
    grid-template-columns: 1fr;
  }

  .device-item {
    padding: 12px;
  }
}
</style>
