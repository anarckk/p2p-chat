<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useUserStore } from '../stores/userStore';
import { useChatStore } from '../stores/chatStore';
import { usePeerManager } from '../composables/usePeerManager';
import { message } from 'ant-design-vue';
import type { OnlineDevice } from '../types';
import { ReloadOutlined, TeamOutlined } from '@ant-design/icons-vue';

const userStore = useUserStore();
const chatStore = useChatStore();
const { isConnected, myPeerId, init, sendMessage } = usePeerManager();

// 发现中心的固定 PeerId
const CENTER_PEER_ID = 'p2p_discovery_center_2025';

const isCenterConnected = ref(false);
const onlineDevices = ref<Map<string, OnlineDevice>>(new Map());
const heartbeatInterval = ref<number | null>(null);

const sortedDevices = computed(() => {
  return Array.from(onlineDevices.value.values()).sort(
    (a, b) => b.lastHeartbeat - a.lastHeartbeat,
  );
});

onMounted(async () => {
  // 确保 Peer 已初始化
  if (!isConnected.value) {
    init();
  }

  // 连接发现中心
  await connectToCenter();

  // 开始心跳
  startHeartbeat();
});

onUnmounted(() => {
  if (heartbeatInterval.value) {
    clearInterval(heartbeatInterval.value);
  }
});

async function connectToCenter() {
  try {
    // 发送注册消息到发现中心
    const success = await sendMessage(CENTER_PEER_ID, {
      type: 'register',
      data: {
        username: userStore.userInfo.username,
        avatar: userStore.userInfo.avatar,
        peerId: myPeerId.value,
      },
    });

    if (success) {
      isCenterConnected.value = true;
      message.success('已连接到发现中心');
    } else {
      message.warning('发现中心未在线，但可以手动添加设备');
    }
  } catch (error) {
    console.error('[Center] Connect error:', error);
  }
}

function startHeartbeat() {
  // 每 30 秒发送一次心跳
  heartbeatInterval.value = window.setInterval(() => {
    if (myPeerId.value) {
      sendMessage(CENTER_PEER_ID, {
        type: 'heartbeat',
        data: {
          peerId: myPeerId.value,
          timestamp: Date.now(),
        },
      });
    }
  }, 30000);
}

function handleDeviceClick(device: OnlineDevice) {
  // 添加到联系人
  chatStore.addOrUpdateContact({
    peerId: device.peerId,
    username: device.username,
    avatar: device.avatar,
    online: true,
    lastSeen: device.lastHeartbeat,
    unreadCount: 0,
  });

  message.success(`已添加 ${device.username} 到聊天列表`);
}

function copyPeerId(id: string) {
  navigator.clipboard.writeText(id);
  message.success('已复制到剪贴板');
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
                v-if="myPeerId"
                copyable
                :copy-text="myPeerId"
                @copy="copyPeerId(myPeerId!)"
              >
                {{ myPeerId }}
              </a-typography-text>
              <a-typography-text v-else type="secondary">连接中...</a-typography-text>
            </a-descriptions-item>
            <a-descriptions-item label="发现中心">
              <a-badge
                :status="isCenterConnected ? 'processing' : 'error'"
                :text="isCenterConnected ? '已连接' : '未连接'"
              />
            </a-descriptions-item>
          </a-descriptions>
        </a-card>
      </a-col>

      <a-col :xs="24" :md="16">
        <a-card title="在线设备" :bordered="false">
          <template #extra>
            <a-button size="small" @click="connectToCenter">
              <template #icon>
                <ReloadOutlined />
              </template>
              刷新
            </a-button>
          </template>

          <div v-if="sortedDevices.length === 0" class="empty-state">
            <a-empty description="暂无在线设备">
              <template #image>
                <TeamOutlined style="font-size: 64px; color: #ccc" />
              </template>
            </a-empty>
          </div>

          <a-list v-else :data-source="sortedDevices" :grid="{ gutter: 16, xs: 1, sm: 2, md: 2 }">
            <template #renderItem="{ item }">
              <a-list-item>
                <a-card
                  hoverable
                  size="small"
                  class="device-card"
                  @click="handleDeviceClick(item)"
                >
                  <a-card-meta>
                    <template #avatar>
                      <a-avatar :src="item.avatar || undefined" :size="48">
                        {{ item.username.charAt(0).toUpperCase() }}
                      </a-avatar>
                    </template>
                    <template #title>
                      {{ item.username }}
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

@media (max-width: 768px) {
  .center-container {
    padding: 16px;
  }
}
</style>
