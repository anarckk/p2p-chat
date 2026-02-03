<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '../stores/userStore';
import { usePeerManager } from '../composables/usePeerManager';
import { SaveOutlined, UserOutlined, ThunderboltOutlined, FileTextOutlined, ClockCircleOutlined, SafetyCertificateOutlined, CopyOutlined, ReloadOutlined, LinkOutlined, CameraOutlined } from '@ant-design/icons-vue';

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
const isSaving = ref(false);

// 内联提示状态
const inlineMessage = ref('');
const inlineMessageType = ref<'success' | 'error' | 'warning' | 'info'>('info');

// 加载用户信息的标志
const userInfoLoaded = ref(false);

// 数字签名相关
const isRegeneratingKeys = ref(false);
const privateKeyVisible = ref(false);

onMounted(async () => {
  // 确保从 localStorage 加载用户信息（异步）
  await userStore.loadUserInfo();

  // 确保密钥已初始化（如果用户信息已设置但密钥未初始化）
  if (userStore.userInfo.username && !userStore.isCryptoInitialized) {
    try {
      await userStore.initCryptoKeys();
      console.log('[SettingsView] Crypto keys initialized');
    } catch (error) {
      console.error('[SettingsView] Failed to initialize crypto keys:', error);
    }
  }

  // 初始化表单
  console.log('[SettingsView] userInfo.avatar:', userStore.userInfo.avatar);
  // 加载用户信息
  username.value = userStore.userInfo.username || '';
  originalUsername.value = username.value;
  avatarPreview.value = userStore.userInfo.avatar || null;
  console.log('[SettingsView] avatarPreview set to:', avatarPreview.value);

  console.log('[SettingsView] final avatarPreview:', avatarPreview.value, 'type:', typeof avatarPreview.value);

  // 加载网络加速开关状态
  const loadedNetworkAcceleration = userStore.loadNetworkAcceleration();
  console.log('[SettingsView] Loaded network acceleration from store:', loadedNetworkAcceleration);
  networkAcceleration.value = loadedNetworkAcceleration;
  originalNetworkAcceleration.value = networkAcceleration.value;
  console.log('[SettingsView] networkAcceleration.value set to:', networkAcceleration.value);

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

// 监听网络加速开关变化（调试用）
watch(networkAcceleration, (newValue, oldValue) => {
  console.log('[SettingsView] networkAcceleration changed:', { oldValue, newValue, original: originalNetworkAcceleration.value });
});

// 监听 hasChanges 变化（调试用）
watch(hasChanges, (newValue) => {
  console.log('[SettingsView] hasChanges changed:', { newValue });
});

// 处理文件选择
function handleFileChange(info: { file: File | { originFileObj?: File } }) {
  clearInlineMessage();

  const file = info.file;

  // 兼容两种情况：
  // 1. ant-design-vue 标准方式：file.originFileObj 存在
  // 2. 直接方式：file 本身就是 File 对象（在某些情况下会发生）
  const actualFile = 'originFileObj' in file ? file.originFileObj : file;

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

  // 检查是否有任何实质性变更（除了用户名）
  const hasNetworkAccelerationChange = networkAcceleration.value !== originalNetworkAcceleration.value;
  const hasNetworkLoggingChange = networkLogging.value !== originalNetworkLogging.value;
  const hasDeviceConfigChange = deviceCheckInterval.value !== originalDeviceCheckInterval.value ||
    deviceCheckTimeout.value !== originalDeviceCheckTimeout.value;
  const hasAvatarChange = avatarFile.value !== null || avatarRemoved.value;

  // 如果用户名为空，且没有其他实质性变更，则不允许保存
  if (!username.value.trim() && !hasNetworkAccelerationChange && !hasNetworkLoggingChange && !hasDeviceConfigChange && !hasAvatarChange) {
    showInlineMessage('用户名不能为空', 'warning');
    return;
  }

  // 如果用户名为空，且有其他变更，只保存其他变更，不保存用户名
  const shouldSaveUsername = username.value.trim() !== '';

  if (!shouldSaveUsername && (hasNetworkAccelerationChange || hasNetworkLoggingChange || hasDeviceConfigChange || hasAvatarChange)) {
    // 只保存网络相关设置，不保存用户名
    isSaving.value = true;

    try {
      // 保存网络加速开关
      if (hasNetworkAccelerationChange) {
        console.log('[Settings] Saving network acceleration:', networkAcceleration.value);
        userStore.setNetworkAcceleration(networkAcceleration.value);
        setNetworkAccelerationEnabled(networkAcceleration.value);
        console.log('[Settings] Network acceleration saved:', networkAcceleration.value);

        // 广播网络加速状态给所有在线设备
        await broadcastNetworkAccelerationStatus();

        showInlineMessage(networkAcceleration.value ? '已开启网络加速' : '已关闭网络加速', 'success');
      }

      // 保存网络数据日志记录开关
      if (hasNetworkLoggingChange) {
        userStore.setNetworkLogging(networkLogging.value);
        showInlineMessage(networkLogging.value ? '已开启网络数据日志记录' : '已关闭网络数据日志记录', 'success');
      }

      // 保存设备状态检测配置
      if (hasDeviceConfigChange) {
        if (deviceCheckInterval.value !== originalDeviceCheckInterval.value) {
          userStore.setDeviceCheckInterval(deviceCheckInterval.value);
          showInlineMessage('设备状态检测间隔已更新为 ' + deviceCheckInterval.value + ' 秒', 'success');
        }
        if (deviceCheckTimeout.value !== originalDeviceCheckTimeout.value) {
          userStore.setDeviceCheckTimeout(deviceCheckTimeout.value);
          showInlineMessage('设备状态检测超时已更新为 ' + deviceCheckTimeout.value + ' 秒', 'success');
        }
      }

      // 更新原始值
      originalNetworkAcceleration.value = networkAcceleration.value;
      originalNetworkLogging.value = networkLogging.value;
      originalDeviceCheckInterval.value = deviceCheckInterval.value;
      originalDeviceCheckTimeout.value = deviceCheckTimeout.value;

      showInlineMessage('设置已保存', 'success');
    } catch (error) {
      console.error('[Settings] Save error:', error);
      showInlineMessage('保存失败', 'error');
    } finally {
      isSaving.value = false;
    }
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
    console.log('[Settings] Network acceleration save check:', {
      current: networkAcceleration.value,
      original: originalNetworkAcceleration.value,
      shouldSave: networkAcceleration.value !== originalNetworkAcceleration.value
    });
    if (networkAcceleration.value !== originalNetworkAcceleration.value) {
      userStore.setNetworkAcceleration(networkAcceleration.value);
      setNetworkAccelerationEnabled(networkAcceleration.value);
      console.log('[Settings] Network acceleration saved:', networkAcceleration.value);

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

/**
 * 截断密钥显示
 */
function truncateKey(key: string): string {
  if (key.length < 40) return key;
  return `${key.substring(0, 20)}...${key.substring(key.length - 20)}`;
}

/**
 * 复制到剪贴板
 */
async function copyToClipboard(text: string, keyType: string): Promise<void> {
  clearInlineMessage();

  try {
    await navigator.clipboard.writeText(text);
    showInlineMessage(`${keyType}已复制到剪贴板`, 'success');
  } catch (error) {
    console.error('[Settings] Failed to copy to clipboard:', error);
    showInlineMessage('复制失败', 'error');
  }
}

/**
 * 重新生成密钥
 */
async function handleRegenerateKeys(): Promise<void> {
  clearInlineMessage();

  isRegeneratingKeys.value = true;

  try {
    await userStore.regenerateCryptoKeys();
    showInlineMessage('密钥已重新生成', 'success');
  } catch (error) {
    console.error('[Settings] Failed to regenerate keys:', error);
    showInlineMessage('密钥生成失败', 'error');
  } finally {
    isRegeneratingKeys.value = false;
  }
}

</script>

<template>
  <div class="settings-container">
    <!-- 页面标题 -->
    <div class="page-header">
      <h1 class="page-title">
        <SettingOutlined class="title-icon" />
        设置
      </h1>
      <p class="page-subtitle">管理您的账户和偏好设置</p>
    </div>

    <a-row :gutter="[20, 20]">
      <!-- 用户信息设置 -->
      <a-col :xs="24" :lg="12">
        <a-card class="settings-card" :bordered="false">
          <template #title>
            <UserOutlined />
            用户信息
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
                size="large"
              />
            </a-form-item>

            <!-- 头像 -->
            <a-form-item label="头像">
              <div class="avatar-section">
                <a-avatar
                  :size="88"
                  :src="avatarPreview"
                  class="avatar-preview"
                >
                  {{ username.charAt(0).toUpperCase() || 'U' }}
                </a-avatar>

                <div class="avatar-actions">
                  <a-upload
                    :before-upload="() => false"
                    @change="handleFileChange"
                    :show-upload-list="false"
                    accept="image/*"
                  >
                    <a-button>
                      <template #icon><CameraOutlined /></template>
                      选择图片
                    </a-button>
                  </a-upload>
                  <a-button
                    v-if="avatarPreview"
                    danger
                    @click="removeAvatar"
                    aria-label="remove-avatar-button"
                  >
                    移除
                  </a-button>
                </div>
              </div>
              <div class="hint-text">
                支持 JPG、PNG 格式，文件大小不超过 2MB
              </div>
            </a-form-item>
          </a-form>
        </a-card>
      </a-col>

      <!-- 网络加速设置 -->
      <a-col :xs="24" :lg="12">
        <a-card class="settings-card" :bordered="false">
          <template #title>
            <ThunderboltOutlined />
            网络加速
          </template>
          <div class="setting-section">
            <p class="description">
              开启网络加速后，您的设备可以帮助其他设备转发消息。同时，当您与某些设备直连失败时，也可以通过其他开启网络加速的设备中转消息。
            </p>

            <div class="switch-row">
              <span class="switch-label">网络加速</span>
              <a-switch
                v-model:checked="networkAcceleration"
                checked-children="开启"
                un-checked-children="关闭"
                size="default"
                aria-label="network-acceleration-switch"
              />
            </div>

            <div class="status-alert">
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
      <a-col :xs="24" :lg="12">
        <a-card class="settings-card" :bordered="false">
          <template #title>
            <FileTextOutlined />
            网络数据日志
          </template>
          <div class="setting-section">
            <p class="description">
              开启网络数据日志记录后，所有的 PeerJS 请求和响应数据都会被记录到本地 IndexedDB 中。这对于调试网络问题和分析通信数据非常有用。
            </p>

            <div class="switch-row">
              <span class="switch-label">日志记录</span>
              <a-switch
                v-model:checked="networkLogging"
                checked-children="开启"
                un-checked-children="关闭"
                size="default"
                aria-label="network-logging-switch"
              />
            </div>

            <div class="status-alert">
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
                  网络通信数据不会被记录。开启后可在"网络日志"页面查看记录的数据。
                </template>
              </a-alert>
            </div>
          </div>
        </a-card>
      </a-col>

      <!-- 设备状态检测配置 -->
      <a-col :xs="24" :lg="12">
        <a-card class="settings-card" :bordered="false">
          <template #title>
            <ClockCircleOutlined />
            设备状态检测
          </template>
          <div class="setting-section">
            <p class="description">
              配置设备在线状态检测的时间间隔和超时时间。较短的间隔可以更快发现设备离线，但会增加网络流量。
            </p>

            <a-form layout="vertical">
              <a-row :gutter="16">
                <a-col :span="12">
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
                      范围：5-600 秒
                    </div>
                  </a-form-item>
                </a-col>
                <a-col :span="12">
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
                      范围：3-30 秒
                    </div>
                  </a-form-item>
                </a-col>
              </a-row>
            </a-form>

            <div class="status-alert">
              <a-alert
                type="info"
                show-icon
                message="设备状态检测配置"
              >
                <template #description>
                  当前配置：每 {{ deviceCheckInterval }} 秒检测一次，超时时间为 {{ deviceCheckTimeout }} 秒
                </template>
              </a-alert>
            </div>
          </div>
        </a-card>
      </a-col>

      <!-- 数字签名 -->
      <a-col :xs="24" :lg="12">
        <a-card class="settings-card" :bordered="false">
          <template #title>
            <SafetyCertificateOutlined />
            数字签名
          </template>
          <div class="setting-section">
            <p class="description">
              数字签名用于验证您的身份。公钥可以与他人共享，用于验证您的消息签名。私钥请妥善保管，切勿泄露。
            </p>

            <div v-if="!userStore.isCryptoInitialized" class="crypto-warning">
              <a-alert
                type="warning"
                show-icon
                message="密钥未初始化"
                description="数字签名密钥对尚未初始化，请保存用户信息后刷新页面。"
              />
            </div>

            <div v-else class="crypto-section">
              <div class="key-display-item">
                <div class="key-label">我的公钥</div>
                <div class="key-value">
                  <code class="key-code">{{ truncateKey(userStore.myPublicKey || '') }}</code>
                  <a-button
                    type="text"
                    size="small"
                    @click="copyToClipboard(userStore.myPublicKey || '', '公钥')"
                    aria-label="copy-public-key-button"
                  >
                    <CopyOutlined />
                  </a-button>
                </div>
              </div>

              <a-collapse ghost class="private-key-collapse">
                <a-collapse-panel key="privateKey" header="查看私钥（请勿泄露）">
                  <div class="key-display-item">
                    <div class="key-value">
                      <code class="key-code">{{ truncateKey(userStore.myPrivateKey || '') }}</code>
                      <a-button
                        type="text"
                        size="small"
                        @click="copyToClipboard(userStore.myPrivateKey || '', '私钥')"
                        aria-label="copy-private-key-button"
                      >
                        <CopyOutlined />
                      </a-button>
                    </div>
                  </div>
                </a-collapse-panel>
              </a-collapse>

              <div class="key-actions">
                <a-popconfirm
                  title="重新生成密钥后，旧的密钥将失效。其他设备需要重新获取您的公钥。确定要继续吗？"
                  ok-text="确定"
                  cancel-text="取消"
                  @confirm="handleRegenerateKeys"
                >
                  <a-button
                    type="primary"
                    danger
                    :loading="isRegeneratingKeys"
                    aria-label="regenerate-keys-button"
                  >
                    <template #icon>
                      <ReloadOutlined />
                    </template>
                    重新生成密钥
                  </a-button>
                </a-popconfirm>
                <a-button
                  type="link"
                  @click="router.push('/center')"
                  aria-label="go-to-center-for-device-keys"
                >
                  <template #icon>
                    <LinkOutlined />
                  </template>
                  在发现中心查看设备公钥
                </a-button>
              </div>
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
            size="large"
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
            size="large"
          >
            取消
          </a-button>
          <a-button @click="goToCenter" size="large">
            返回发现中心
          </a-button>
        </div>
      </a-col>
    </a-row>
  </div>
</template>

<style scoped>
.settings-container {
  padding: 24px;
  max-width: 1400px;
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

/* 设置卡片 */
.settings-card {
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  height: 100%;
}

.setting-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.description {
  color: #595959;
  line-height: 1.6;
  margin: 0;
}

/* 开关行 */
.switch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
}

.switch-label {
  font-size: 15px;
  color: #262626;
}

/* 状态提示 */
.status-alert {
  margin-top: 8px;
}

/* 头像部分 */
.avatar-section {
  display: flex;
  align-items: center;
  gap: 20px;
}

.avatar-preview {
  flex-shrink: 0;
}

.avatar-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hint-text {
  font-size: 12px;
  color: #8c8c8c;
  margin-top: 8px;
}

/* 密钥部分 */
.crypto-warning {
  margin-top: 8px;
}

.crypto-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.key-display-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.key-label {
  font-size: 14px;
  font-weight: 500;
  color: #262626;
}

.key-value {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  padding: 10px 12px;
}

.key-code {
  flex: 1;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  color: #262626;
  word-break: break-all;
  margin: 0;
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

.key-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* 操作按钮 */
.action-buttons {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding: 24px 0;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

/* 内联提示 */
.inline-message {
  margin-bottom: 16px;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 14px;
  text-align: center;
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

/* 响应式 */
@media (max-width: 768px) {
  .settings-container {
    padding: 16px;
  }

  .page-title {
    font-size: 24px;
  }

  .avatar-section {
    flex-direction: column;
    text-align: center;
  }

  .action-buttons {
    flex-direction: column;
  }

  .action-buttons button {
    width: 100%;
  }

  .key-value {
    flex-direction: column;
    align-items: flex-start;
  }

  .key-code {
    white-space: normal;
  }
}
</style>
