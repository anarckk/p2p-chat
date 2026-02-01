<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '../stores/userStore';
import { usePeerManager } from '../composables/usePeerManager';
import { SaveOutlined, UserOutlined, ThunderboltOutlined, FileTextOutlined, ClockCircleOutlined } from '@ant-design/icons-vue';

const router = useRouter();
const userStore = useUserStore();
const peerManager = usePeerManager();
const {
  setNetworkAccelerationEnabled,
  broadcastNetworkAccelerationStatus,
  broadcastUserInfoUpdate,
} = peerManager;

// 用户名
const username = ref('');
const originalUsername = ref('');

// 头像
const avatarPreview = ref<string | null>(null);
const avatarFile = ref<File | null>(null);
const avatarRemoved = ref(false);

// 网络加速
const networkAcceleration = ref(false);
const originalNetworkAcceleration = ref(false);

// 网络数据日志记录
const networkLogging = ref(false);
const originalNetworkLogging = ref(false);

// 设备状态检测配置
const deviceCheckInterval = ref(20);
const originalDeviceCheckInterval = ref(20);
const deviceCheckTimeout = ref(5);
const originalDeviceCheckTimeout = ref(5);

// 加载中状态
const isLoading = ref(false);
const isSaving = ref(false);

// 内联提示状态
const inlineMessage = ref('');
const inlineMessageType = ref<'success' | 'error' | 'warning' | 'info'>('info');

// 加载用户信息的标志
const userInfoLoaded = ref(false);

onMounted(async () => {
  // 确保从 localStorage 加载用户信息（异步）
  await userStore.loadUserInfo();
  // 初始化表单
  console.log('[SettingsView] userInfo.avatar:', userStore.userInfo.avatar);
  // 加载用户信息
  username.value = userStore.userInfo.username || '';
  originalUsername.value = username.value;
  avatarPreview.value = userStore.userInfo.avatar || null;
  console.log('[SettingsView] avatarPreview set to:', avatarPreview.value);

  console.log('[SettingsView] final avatarPreview:', avatarPreview.value, 'type:', typeof avatarPreview.value);

  // 加载网络加速开关状态
  networkAcceleration.value = userStore.loadNetworkAcceleration();
  originalNetworkAcceleration.value = networkAcceleration.value;

  // 同步 peerManager 的网络加速状态
  setNetworkAccelerationEnabled(networkAcceleration.value);

  // 加载网络数据日志记录开关状态
  networkLogging.value = userStore.loadNetworkLogging();
  originalNetworkLogging.value = networkLogging.value;

  // 加载设备状态检测配置
  deviceCheckInterval.value = userStore.loadDeviceCheckInterval();
  originalDeviceCheckInterval.value = deviceCheckInterval.value;
  deviceCheckTimeout.value = userStore.loadDeviceCheckTimeout();
  originalDeviceCheckTimeout.value = deviceCheckTimeout.value;

  userInfoLoaded.value = true;
});

// 监听用户信息加载完成后，初始化表单（不再需要，因为已经在 onMounted 中直接初始化）
watch(userInfoLoaded, (loaded) => {
  if (loaded) {
    console.log('[SettingsView] userInfoLoaded is true, form initialized');
  }
});

// 是否有修改
const hasChanges = computed(() => {
  return username.value !== originalUsername.value ||
    avatarFile.value !== null || avatarRemoved.value ||
    networkAcceleration.value !== originalNetworkAcceleration.value ||
    networkLogging.value !== originalNetworkLogging.value ||
    deviceCheckInterval.value !== originalDeviceCheckInterval.value ||
    deviceCheckTimeout.value !== originalDeviceCheckTimeout.value;
});

// 处理文件选择
function handleFileChange(info: any) {
  clearInlineMessage();

  const file = info.file;

  // 兼容两种情况：
  // 1. ant-design-vue 标准方式：file.originFileObj 存在
  // 2. 直接方式：file 本身就是 File 对象（在某些情况下会发生）
  const actualFile = file?.originFileObj || file;

  if (actualFile && actualFile instanceof File) {
    // 验证文件类型
    if (!actualFile.type.startsWith('image/')) {
      showInlineMessage('请选择图片文件', 'error');
      return;
    }

    // 验证文件大小（2MB）
    if (actualFile.size > 2 * 1024 * 1024) {
      showInlineMessage('图片大小不能超过 2MB', 'error');
      return;
    }

    avatarFile.value = actualFile;

    // 预览图片
    const reader = new FileReader();
    reader.onload = (e) => {
      avatarPreview.value = e.target?.result as string;
    };
    reader.readAsDataURL(actualFile);
  }
}

// 移除头像
function removeAvatar() {
  avatarRemoved.value = true;
  avatarPreview.value = null;
  avatarFile.value = null;
}

// 保存设置
async function handleSave() {
  clearInlineMessage();

  if (!username.value.trim()) {
    showInlineMessage('用户名不能为空', 'warning');
    return;
  }

  isSaving.value = true;

  try {
    const newUsername = username.value.trim();
    const newAvatar = avatarPreview.value;

    console.log('[Settings] Saving user info:', { newUsername, newAvatar, currentUsername: userStore.userInfo.username });

    // 检查用户名或头像是否有变更
    const hasUsernameChange = newUsername !== originalUsername.value;
    const hasAvatarChange = newAvatar !== userStore.userInfo.avatar;

    console.log('[Settings] Changes detected:', { hasUsernameChange, hasAvatarChange });

    // 保存用户信息
    await userStore.saveUserInfo({
      username: newUsername,
      avatar: newAvatar,
    });

    console.log('[Settings] User info saved. Current userStore.userInfo.username:', userStore.userInfo.username);

    // 如果用户名或头像有变更，广播给所有在线设备
    if (hasUsernameChange || hasAvatarChange) {
      await broadcastUserInfoUpdate();
      console.log('[Settings] User info update broadcasted to all devices');
    }

    // 保存网络加速开关
    if (networkAcceleration.value !== originalNetworkAcceleration.value) {
      userStore.setNetworkAcceleration(networkAcceleration.value);
      setNetworkAccelerationEnabled(networkAcceleration.value);

      // 广播网络加速状态给所有在线设备
      await broadcastNetworkAccelerationStatus();

      showInlineMessage(networkAcceleration.value ? '已开启网络加速' : '已关闭网络加速', 'success');
    }

    // 保存网络数据日志记录开关
    if (networkLogging.value !== originalNetworkLogging.value) {
      userStore.setNetworkLogging(networkLogging.value);
      showInlineMessage(networkLogging.value ? '已开启网络数据日志记录' : '已关闭网络数据日志记录', 'success');
    }

    // 保存设备状态检测配置
    if (deviceCheckInterval.value !== originalDeviceCheckInterval.value) {
      userStore.setDeviceCheckInterval(deviceCheckInterval.value);
      showInlineMessage('设备状态检测间隔已更新为 ' + deviceCheckInterval.value + ' 秒', 'success');
    }

    if (deviceCheckTimeout.value !== originalDeviceCheckTimeout.value) {
      userStore.setDeviceCheckTimeout(deviceCheckTimeout.value);
      showInlineMessage('设备状态检测超时已更新为 ' + deviceCheckTimeout.value + ' 秒', 'success');
    }

    originalUsername.value = username.value;
    originalNetworkAcceleration.value = networkAcceleration.value;
    originalNetworkLogging.value = networkLogging.value;
    avatarFile.value = null;

    showInlineMessage('设置已保存', 'success');
    avatarRemoved.value = false;
  } catch (error) {
    console.error('[Settings] Save error:', error);
    showInlineMessage('保存失败', 'error');
  } finally {
    isSaving.value = false;
  }
}

// 取消编辑
function handleCancel() {
  username.value = originalUsername.value;
  avatarPreview.value = userStore.userInfo.avatar;
  avatarFile.value = null;
  networkAcceleration.value = originalNetworkAcceleration.value;
  networkLogging.value = originalNetworkLogging.value;
  deviceCheckInterval.value = originalDeviceCheckInterval.value;
  deviceCheckTimeout.value = originalDeviceCheckTimeout.value;
}

// 跳转到发现中心
function goToCenter() {
  router.push('/center');
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

</script>

<template>
  <div class="settings-container">
    <a-row :gutter="[16, 16]">
      <!-- 用户信息设置 -->
      <a-col :xs="24" :md="12">
        <a-card title="用户信息" :bordered="false">
          <template #extra>
            <UserOutlined />
          </template>

          <a-form layout="vertical">
            <!-- 用户名 -->
            <a-form-item label="用户名">
              <a-input
                v-model:value="username"
                placeholder="请输入用户名"
                :maxlength="20"
                show-count
                allow-clear
              />
            </a-form-item>

            <!-- 头像 -->
            <a-form-item label="头像">
              <div class="avatar-section">
                <a-avatar
                  :size="80"
                  :src="avatarPreview"
                  v-if="avatarPreview"
                >
                  {{ username.charAt(0).toUpperCase() }}
                </a-avatar>
                <a-avatar
                  :size="80"
                  v-else
                >
                  {{ username.charAt(0).toUpperCase() }}
                </a-avatar>

                <div class="avatar-actions">
                  <a-upload
                    :before-upload="() => false"
                    @change="handleFileChange"
                    :show-upload-list="false"
                    accept="image/*"
                  >
                    <a-button size="small">
                      <template #icon>📷</template>
                      选择图片
                    </a-button>
                  </a-upload>
                  <a-button
                    v-if="avatarPreview"
                    size="small"
                    danger
                    @click="removeAvatar"
                    aria-label="remove-avatar-button"
                  >
                    移除
                  </a-button>
                </div>
              </div>
              <div class="avatar-hint">
                支持 JPG、PNG 格式，文件大小不超过 2MB
              </div>
            </a-form-item>
          </a-form>
        </a-card>
      </a-col>

      <!-- 网络加速设置 -->
      <a-col :xs="24" :md="12">
        <a-card title="网络加速" :bordered="false">
          <template #extra>
            <ThunderboltOutlined />
          </template>

          <div class="network-acceleration-section">
            <p class="description">
              开启网络加速后，您的设备可以帮助其他设备转发消息。
              同时，当您与某些设备直连失败时，也可以通过其他开启网络加速的设备中转消息。
            </p>

            <a-switch
              v-model:checked="networkAcceleration"
              checked-children="开启"
              un-checked-children="关闭"
              aria-label="network-acceleration-switch"
            />

            <div class="status-info">
              <a-alert
                v-if="networkAcceleration"
                type="info"
                show-icon
                message="网络加速已开启"
                description="您正在帮助其他设备转发消息，同时也可以使用其他设备的中转服务。"
              />
              <a-alert
                v-else
                type="warning"
                show-icon
                message="网络加速已关闭"
                description="您不会帮助其他设备转发消息，其他设备也不会帮助您转发消息。所有通信均为直连。"
              />
            </div>
          </div>
        </a-card>
      </a-col>

      <!-- 网络数据日志记录设置 -->
      <a-col :xs="24" :md="12">
        <a-card title="网络数据日志记录" :bordered="false">
          <template #extra>
            <FileTextOutlined />
          </template>

          <div class="network-logging-section">
            <p class="description">
              开启网络数据日志记录后，所有的 PeerJS 请求和响应数据都会被记录到本地 IndexedDB 中。
              这对于调试网络问题和分析通信数据非常有用。
            </p>

            <a-switch
              v-model:checked="networkLogging"
              checked-children="开启"
              un-checked-children="关闭"
              aria-label="network-logging-switch"
            />

            <div class="status-info">
              <a-alert
                v-if="networkLogging"
                type="info"
                show-icon
                message="网络数据日志记录已开启"
              >
                <template #description>
                  <div>所有的网络通信数据都会被记录到本地数据库中。</div>
                  <div style="margin-top: 8px;">
                    <a-button type="link" size="small" @click="router.push('/network-log')" style="padding: 0;">
                      查看网络数据日志 →
                    </a-button>
                  </div>
                </template>
              </a-alert>
              <a-alert
                v-else
                type="warning"
                show-icon
                message="网络数据日志记录已关闭"
              >
                <template #description>
                  网络通信数据不会被记录。开启后可在"网络数据日志"页面查看记录的数据。
                </template>
              </a-alert>
            </div>
          </div>
        </a-card>
      </a-col>

      <!-- 设备状态检测配置 -->
      <a-col :xs="24" :md="12">
        <a-card title="设备状态检测" :bordered="false">
          <template #extra>
            <ClockCircleOutlined />
          </template>

          <div class="device-check-section">
            <p class="description">
              配置设备在线状态检测的时间间隔和超时时间。
              较短的间隔可以更快发现设备离线，但会增加网络流量。
            </p>

            <a-form layout="vertical">
              <!-- 检测间隔 -->
              <a-form-item label="检测间隔（秒）">
                <a-input-number
                  v-model:value="deviceCheckInterval"
                  :min="5"
                  :max="600"
                  :step="5"
                  style="width: 100%;"
                  aria-label="device-check-interval-input"
                />
                <div class="hint-text">
                  范围：5-600 秒，默认 20 秒
                </div>
              </a-form-item>

              <!-- 超时时间 -->
              <a-form-item label="超时时间（秒）">
                <a-input-number
                  v-model:value="deviceCheckTimeout"
                  :min="3"
                  :max="30"
                  :step="1"
                  style="width: 100%;"
                  aria-label="device-check-timeout-input"
                />
                <div class="hint-text">
                  范围：3-30 秒，默认 5 秒。超时后设备将被标记为离线
                </div>
              </a-form-item>
            </a-form>

            <div class="status-info">
              <a-alert
                type="info"
                show-icon
                message="设备状态检测配置"
              >
                <template #description>
                  <div>当前配置：每 {{ deviceCheckInterval }} 秒检测一次，超时时间为 {{ deviceCheckTimeout }} 秒</div>
                </template>
              </a-alert>
            </div>
          </div>
        </a-card>
      </a-col>

      <!-- 操作按钮 -->
      <a-col :span="24">
        <!-- 内联提示 -->
        <div v-if="inlineMessage" class="inline-message" :class="`inline-message-${inlineMessageType}`">
          {{ inlineMessage }}
        </div>

        <div class="action-buttons">
          <a-button
            type="primary"
            :loading="isSaving"
            :disabled="!hasChanges"
            @click="handleSave"
            aria-label="save-settings-button"
          >
            <template #icon>
              <SaveOutlined />
            </template>
            保存设置
          </a-button>
          <a-button
            v-if="hasChanges"
            @click="handleCancel"
          >
            取消
          </a-button>
          <a-button @click="goToCenter">
            返回发现中心
          </a-button>
        </div>
      </a-col>
    </a-row>
  </div>
</template>

<style scoped>
.settings-container {
  padding: 16px;
  max-width: 1200px;
  margin: 0 auto;
}

.avatar-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

.avatar-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.avatar-hint {
  font-size: 12px;
  color: #999;
  margin-top: 8px;
}

.network-acceleration-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.network-acceleration-section .description {
  color: #666;
  line-height: 1.6;
  margin: 0;
}

.network-logging-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.network-logging-section .description {
  color: #666;
  line-height: 1.6;
  margin: 0;
}

.device-check-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.device-check-section .description {
  color: #666;
  line-height: 1.6;
  margin: 0;
}

.device-check-section .hint-text {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

.status-info {
  margin-top: 8px;
}

.action-buttons {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding: 16px 0;
}

@media (max-width: 768px) {
  .avatar-section {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .action-buttons {
    flex-direction: column;
  }

  .action-buttons button {
    width: 100%;
  }
}

/* 内联提示样式 */
.inline-message {
  margin-bottom: 16px;
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
