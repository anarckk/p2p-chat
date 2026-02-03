<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  MessageOutlined,
  RadarChartOutlined,
  SettingOutlined,
  FileTextOutlined,
  PhoneOutlined,
  MenuOutlined,
  PlusOutlined,
  UserOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons-vue';
import type { UploadChangeParam, UploadProps } from 'ant-design-vue';
import { useUserStore } from '../stores/userStore';
import { usePeerManager } from '../composables/usePeerManager';
import { useKeyExchangeStore } from '../stores/keyExchangeStore';
import { fileToBase64 } from '../util/fileHelper';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const { init } = usePeerManager();
const keyExchangeStore = useKeyExchangeStore();

// 移动端检测
const isMobile = ref(false);
const isMenuVisible = ref(false);

function checkMobile() {
  isMobile.value = window.innerWidth < 768;
}

onMounted(async () => {
  console.log('[ResponsiveLayout] onMounted: pathname =', window.location.pathname, ', hash =', window.location.hash);
  console.log('[ResponsiveLayout] localStorage E2E_TEST_MODE =', localStorage.getItem('__E2E_TEST_MODE__'));
  console.log('[ResponsiveLayout] localStorage E2E_TARGET_ROUTE =', localStorage.getItem('__E2E_TARGET_ROUTE__'));

  // 移动端检测
  checkMobile();
  window.addEventListener('resize', checkMobile);

  // E2E 测试模式检测：检查 localStorage 中的标记
  const e2eTestMode = localStorage.getItem('__E2E_TEST_MODE__');
  const targetRoute = localStorage.getItem('__E2E_TARGET_ROUTE__');

  if (e2eTestMode === 'true' && targetRoute) {
    console.log('[ResponsiveLayout] E2E 测试模式：检测到标记，目标路由 =', targetRoute);

    // 清除标记
    localStorage.removeItem('__E2E_TEST_MODE__');
    localStorage.removeItem('__E2E_TARGET_ROUTE__');

    // 加载用户信息（应已在 main.ts 中设置）
    const isSetup = await userStore.loadUserInfo();
    console.log('[ResponsiveLayout] E2E 测试模式：用户信息加载结果 isSetup =', isSetup);

    // 如果用户信息未设置，显示设置弹窗（与正常模式保持一致）
    if (!isSetup) {
      console.log('[ResponsiveLayout] E2E 测试模式：用户信息未设置，显示设置弹窗');
      isUserSetupModalVisible.value = true;
      return; // 等待用户完成设置后再继续
    }

    // 导航到目标路由（首字母大写）
    const routeName = targetRoute.charAt(0).toUpperCase() + targetRoute.slice(1);
    console.log('[ResponsiveLayout] E2E 测试模式：导航到', routeName);
    await router.replace({ name: routeName });

    // 等待路由导航完成
    await new Promise<void>((resolve) => {
      const unwatch = router.afterEach((to, from) => {
        console.log('[ResponsiveLayout] E2E 测试模式：路由导航完成', to.name);
        unwatch();
        resolve();
      });
      // 如果路由已经完成，立即 resolve
      if (router.currentRoute.value.name === routeName) {
        console.log('[ResponsiveLayout] E2E 测试模式：路由已经是', routeName);
        resolve();
      }
    });

    // 初始化 Peer
    try {
      await init();
      console.log('[ResponsiveLayout] E2E 测试模式：Peer 初始化完成，myPeerId =', userStore.myPeerId);
    } catch (error) {
      console.error('[ResponsiveLayout] E2E 测试模式：Peer init failed:', error);
    }

    console.log('[ResponsiveLayout] E2E 测试模式：导航完成');
    return;
  }

  // 正常模式：加载用户信息（需要等待异步完成）
  const isSetup = await userStore.loadUserInfo();

  if (!isSetup) {
    // 首次使用，显示设置弹窗
    isUserSetupModalVisible.value = true;
  } else {
    // 已设置，初始化 Peer，等待连接完成
    try {
      await init();
    } catch (error) {
      console.error('Peer init failed:', error);
    }
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);
});

// 菜单项配置
const menuItems = [
  {
    key: 'WeChat',
    label: '聊天',
    icon: MessageOutlined,
    route: '/wechat',
  },
  {
    key: 'Center',
    label: '发现中心',
    icon: RadarChartOutlined,
    route: '/center',
  },
  {
    key: 'Settings',
    label: '设置',
    icon: SettingOutlined,
    route: '/settings',
  },
  {
    key: 'NetworkLog',
    label: '网络日志',
    icon: FileTextOutlined,
    route: '/network-log',
    requiresLogging: true, // 需要开启网络日志记录
  },
];

// 根据设置过滤菜单项
const visibleMenuItems = computed(() => {
  return menuItems.filter((item) => {
    // 如果菜单项需要网络日志记录，检查设置是否开启
    if (item.requiresLogging) {
      return userStore.loadNetworkLogging();
    }
    return true;
  });
});

// 移动端底部菜单（前4个，不包括需要网络日志记录的）
const footerMenuItems = computed(() => {
  return visibleMenuItems.value.filter((item) => !item.requiresLogging).slice(0, 4);
});

function navigateTo(routePath: string) {
  router.push(routePath);
  isMenuVisible.value = false;
}

// 当前路由名称
const currentRoute = computed(() => route.name as string);

// 当前标题
const currentTitle = computed(() => {
  const item = visibleMenuItems.value.find(i => i.key === currentRoute.value);
  return item?.label || 'P2P Chat';
});

// 截断 PeerId 显示
function truncatePeerId(peerId: string | null): string {
  if (!peerId) return '未知';
  if (peerId.length < 16) return peerId;
  return `${peerId.substring(0, 8)}...${peerId.substring(peerId.length - 8)}`;
}

// 初始化弹窗状态
const isUserSetupModalVisible = ref(false);
const usernameInput = ref('');
const isSubmitting = ref(false);
const avatarUrl = ref('');
const fileList = ref<any[]>([]);

// 内联提示
const inlineMessage = ref('');
const inlineMessageType = ref<'success' | 'error' | 'warning' | 'info'>('info');

// 当前头像
const currentAvatar = computed(() => {
  return avatarUrl.value || userStore.userInfo.avatar || '';
});

function showInlineMessage(msg: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
  inlineMessage.value = msg;
  inlineMessageType.value = type;
}

function clearInlineMessage() {
  inlineMessage.value = '';
}

async function handleUserSetup() {
  console.error('=== [ResponsiveLayout] handleUserSetup START ===');
  console.error('[ResponsiveLayout] handleUserSetup: Function called, isSubmitting =', isSubmitting.value);
  console.error('[ResponsiveLayout] handleUserSetup: usernameInput.value =', usernameInput.value);
  const trimmedUsername = usernameInput.value.trim();
  console.error('[ResponsiveLayout] handleUserSetup: Username =', trimmedUsername);
  clearInlineMessage();

  if (!trimmedUsername) {
    console.error('[ResponsiveLayout] handleUserSetup: Username is empty, showing warning');
    showInlineMessage('用户名不能为空，请输入用户名', 'warning');
    return;
  }

  if (trimmedUsername.length < 2) {
    showInlineMessage('用户名至少需要2个字符', 'warning');
    return;
  }

  if (trimmedUsername.length > 20) {
    showInlineMessage('用户名不能超过20个字符', 'warning');
    return;
  }

  isSubmitting.value = true;

  try {
    // 先初始化 Peer（会生成并保存 PeerId），等待连接完成
    await init();

    // 保存用户信息（包含头像，但不覆盖 PeerId）
    await userStore.saveUserInfo({
      username: trimmedUsername,
      avatar: avatarUrl.value || null,
    });

    // 初始化密钥对
    await userStore.initCryptoKeys();

    // 关闭弹窗
    isUserSetupModalVisible.value = false;
    usernameInput.value = '';
    avatarUrl.value = '';
    fileList.value = [];

    showInlineMessage('设置完成', 'success');
    console.log('[ResponsiveLayout] handleUserSetup: Setup completed successfully');
  } catch (error) {
    console.error('[ResponsiveLayout] handleUserSetup: Error:', error);

    // 即使 Peer 连接失败，也允许继续使用（用户信息已保存）
    // 保存用户信息（包含头像）
    await userStore.saveUserInfo({
      username: usernameInput.value.trim(),
      avatar: avatarUrl.value || null,
    });

    // 尝试初始化密钥
    try {
      await userStore.initCryptoKeys();
    } catch (cryptoError) {
      console.error('Crypto init failed:', cryptoError);
    }

    // 关闭弹窗
    isUserSetupModalVisible.value = false;
    usernameInput.value = '';
    avatarUrl.value = '';
    fileList.value = [];

    showInlineMessage('Peer 连接失败，某些功能可能不可用', 'warning');
  } finally {
    isSubmitting.value = false;
  }
}

// 头像上传相关
const isUploading = ref(false);

const handleAvatarChange: UploadProps['onChange'] = async (info: UploadChangeParam) => {
  if (info.file.status === 'uploading') {
    isUploading.value = true;
    return;
  }

  if (info.file.status === 'done') {
    // 已在外部 beforeUpload 处理
    isUploading.value = false;
    return;
  }

  if (info.file.status === 'removed') {
    // 移除头像
    avatarUrl.value = '';
    fileList.value = [];
  }
};

const beforeUpload = async (file: File) => {
  const isImage = file.type.startsWith('image/');
  if (!isImage) {
    return false;
  }

  const isLt2M = file.size / 1024 / 1024 < 2;
  if (!isLt2M) {
    return false;
  }

  try {
    const base64 = await fileToBase64(file);
    avatarUrl.value = base64;
    fileList.value = [{
      uid: '1',
      name: file.name,
      status: 'done',
      url: base64,
    }];
  } catch (error) {
    console.error('Avatar processing error:', error);
  }

  return false; // 阻止自动上传
};

const handleRemove = () => {
  inlineMessage.value = '';
  avatarUrl.value = '';
  fileList.value = [];
};

// ==================== 公钥变更弹窗 ====================

/**
 * 用户选择不信任新公钥
 */
async function handleNotTrustKeyChange() {
  const dialog = keyExchangeStore.dialog;
  console.log('[ResponsiveLayout] User does not trust key change for:', dialog.peerId);

  // 标记设备为被攻击状态
  const { useDeviceStore } = await import('../stores/deviceStore');
  const deviceStore = useDeviceStore();
  const device = deviceStore.getDevice(dialog.peerId);

  if (device) {
    device.keyExchangeStatus = 'compromised';
    await deviceStore.addOrUpdateDevice(device);
    console.log('[ResponsiveLayout] Device marked as compromised:', dialog.peerId);
  }

  keyExchangeStore.handleNotTrust();
}

/**
 * 用户选择信任新公钥
 */
async function handleTrustKeyChange() {
  const dialog = keyExchangeStore.dialog;
  console.log('[ResponsiveLayout] User trusts key change for:', dialog.peerId);

  // 更新设备公钥和状态
  const { useDeviceStore } = await import('../stores/deviceStore');
  const deviceStore = useDeviceStore();
  const device = deviceStore.getDevice(dialog.peerId);

  if (device) {
    device.publicKey = dialog.newPublicKey;
    device.keyExchangeStatus = 'verified';
    await deviceStore.addOrUpdateDevice(device);
    console.log('[ResponsiveLayout] Device public key updated and marked as verified:', dialog.peerId);
  }

  keyExchangeStore.handleTrust();
}
</script>

<template>
  <a-layout class="responsive-layout">
    <!-- 用户设置弹窗 -->
    <a-modal
      v-model:open="isUserSetupModalVisible"
      title="设置用户信息"
      :footer="null"
      :closable="false"
      :mask-closable="false"
    >
      <a-form layout="vertical">
        <a-form-item label="头像">
          <div class="avatar-upload-container">
            <a-avatar :src="currentAvatar" :size="80">
              {{ usernameInput.charAt(0).toUpperCase() || 'U' }}
            </a-avatar>
            <a-upload
              :file-list="fileList"
              :before-upload="beforeUpload"
              @change="handleAvatarChange"
              :max-count="1"
              list-type="picture"
              accept="image/*"
              :disabled="isUploading || isSubmitting"
            >
              <a-button v-if="fileList.length === 0" :loading="isUploading" :disabled="isSubmitting" aria-label="upload-avatar">
                <template #icon>
                  <PlusOutlined />
                </template>
                上传头像
              </a-button>
            </a-upload>
            <a-typography-text type="secondary" style="font-size: 12px">
              支持 jpg、png 格式，不超过 2MB
            </a-typography-text>
            <div v-if="inlineMessage" class="inline-message" :class="`inline-message-${inlineMessageType}`">
              {{ inlineMessage }}
            </div>
          </div>
        </a-form-item>
        <a-form-item label="用户名" required>
          <a-input
            v-model:value="usernameInput"
            placeholder="请输入用户名（2-20个字符）"
            :maxlength="20"
            :disabled="isSubmitting"
            @keyup.enter="handleUserSetup"
          />
        </a-form-item>
        <a-form-item>
          <a-button
            type="primary"
            block
            :loading="isSubmitting"
            :disabled="isSubmitting"
            @click="handleUserSetup"
            aria-label="complete-user-setup"
          >
            完成
          </a-button>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 公钥变更警告弹窗 -->
    <a-modal
      v-model:open="keyExchangeStore.dialog.visible"
      title="安全警告"
      :closable="false"
      :mask-closable="false"
      width="600px"
      :footer="null"
    >
      <template #icon>
        <ExclamationCircleOutlined style="color: #faad14; font-size: 24px;" />
      </template>

      <a-space direction="vertical" :size="16" style="width: 100%;">
        <!-- 警告图标和说明 -->
        <a-alert
          type="warning"
          show-icon
          message="检测到公钥变更"
        >
          <template #description>
            <div>设备 <strong>{{ keyExchangeStore.dialog.username }}</strong> ({{ keyExchangeStore.truncateKey(keyExchangeStore.dialog.peerId) }}) 的公钥已发生变化。</div>
            <div style="margin-top: 8px;">这可能意味着：</div>
            <ul style="margin: 8px 0; padding-left: 20px;">
              <li>对方重新生成了密钥对（例如更换设备）</li>
              <li>存在中间人攻击，有人正在冒充对方</li>
            </ul>
            <div>请通过其他渠道确认对方身份后再决定是否信任。</div>
          </template>
        </a-alert>

        <!-- 公钥对比 -->
        <a-card size="small" title="公钥对比">
          <a-descriptions :column="1" size="small">
            <a-descriptions-item label="旧公钥">
              <a-typography-text code copyable :copy-text="keyExchangeStore.dialog.oldPublicKey">
                {{ keyExchangeStore.truncateKey(keyExchangeStore.dialog.oldPublicKey) }}
              </a-typography-text>
            </a-descriptions-item>
            <a-descriptions-item label="新公钥">
              <a-typography-text code copyable :copy-text="keyExchangeStore.dialog.newPublicKey">
                {{ keyExchangeStore.truncateKey(keyExchangeStore.dialog.newPublicKey) }}
              </a-typography-text>
            </a-descriptions-item>
          </a-descriptions>
        </a-card>

        <!-- 操作按钮 -->
        <a-space style="width: 100%; justify-content: flex-end;">
          <a-button
            @click="handleNotTrustKeyChange"
            aria-label="not-trust-key-change"
          >
            <template #icon>
              <WarningOutlined />
            </template>
            不信任（移除设备）
          </a-button>
          <a-button
            type="primary"
            danger
            @click="handleTrustKeyChange"
            aria-label="trust-key-change"
          >
            <template #icon>
              <ExclamationCircleOutlined />
            </template>
            信任（更新公钥）
          </a-button>
        </a-space>

        <!-- 待处理提示 -->
        <div v-if="keyExchangeStore.pendingChanges.size > 0" style="text-align: center; color: #8c8c8c; font-size: 12px;">
          还有 {{ keyExchangeStore.pendingChanges.size }} 个设备的公钥变更待处理
        </div>
      </a-space>
    </a-modal>

    <!-- PC 端：左侧菜单栏 -->
    <a-layout-sider
      v-if="!isMobile"
      width="240"
      class="pc-sider"
    >
      <div class="logo-section">
        <div class="logo">P2P 聊天</div>
      </div>

      <a-menu
        :selectedKeys="[currentRoute]"
        mode="inline"
        theme="dark"
        class="side-menu"
      >
        <a-menu-item
          v-for="item in visibleMenuItems"
          :key="item.key"
          @click="navigateTo(item.route)"
        >
          <template #icon>
            <component :is="item.icon" />
          </template>
          {{ item.label }}
        </a-menu-item>
      </a-menu>

      <!-- 用户信息卡片 -->
      <div class="user-card">
        <a-avatar :size="48" :src="userStore.userInfo.avatar">
          {{ userStore.userInfo.username?.charAt(0) }}
        </a-avatar>
        <div class="user-info">
          <div class="username">{{ userStore.userInfo.username }}</div>
          <div class="peer-id">{{ truncatePeerId(userStore.myPeerId) }}</div>
        </div>
      </div>
    </a-layout-sider>

    <!-- 移动端：顶部栏 + 抽屉菜单 -->
    <div v-else class="mobile-wrapper">
      <!-- 移动端顶部栏 -->
      <a-layout-header class="mobile-header">
        <div class="header-title">{{ currentTitle }}</div>
        <a-button
          type="text"
          @click="isMenuVisible = true"
          aria-label="open-menu"
        >
          <template #icon>
            <MenuOutlined />
          </template>
        </a-button>
      </a-layout-header>

      <!-- 移动端抽屉菜单 -->
      <a-drawer
        v-model:open="isMenuVisible"
        placement="left"
        :closable="false"
        class="mobile-drawer"
      >
        <div class="logo-section">
          <div class="logo">P2P 聊天</div>
        </div>

        <a-menu
          :selectedKeys="[currentRoute]"
          mode="inline"
          theme="dark"
        >
          <a-menu-item
            v-for="item in visibleMenuItems"
            :key="item.key"
            @click="navigateTo(item.route)"
          >
            <template #icon>
              <component :is="item.icon" />
            </template>
            {{ item.label }}
          </a-menu-item>
        </a-menu>

        <div class="user-card">
          <a-avatar :size="48" :src="userStore.userInfo.avatar">
            {{ userStore.userInfo.username?.charAt(0) }}
          </a-avatar>
          <div class="user-info">
            <div class="username">{{ userStore.userInfo.username }}</div>
            <div class="peer-id">{{ truncatePeerId(userStore.myPeerId) }}</div>
          </div>
        </div>
      </a-drawer>
    </div>

    <!-- 主内容区域 -->
    <a-layout-content class="main-content">
      <router-view />
    </a-layout-content>

    <!-- 移动端底部菜单 -->
    <a-layout-footer v-if="isMobile" class="mobile-footer">
      <a-row type="flex" justify="space-around">
        <a-col
          v-for="item in footerMenuItems"
          :key="item.key"
          :span="6"
          class="footer-item"
          :class="{ active: currentRoute === item.key }"
          @click="navigateTo(item.route)"
        >
          <component :is="item.icon" class="footer-icon" />
          <span class="footer-label">{{ item.label }}</span>
        </a-col>
      </a-row>
    </a-layout-footer>
  </a-layout>
</template>

<style scoped>
.responsive-layout {
  min-height: 100vh;
}

/* PC 端样式 */
.pc-sider {
  position: fixed;
  left: 0;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  z-index: 1000;
}

.logo-section {
  padding: 24px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.logo {
  font-size: 20px;
  font-weight: bold;
  color: #fff;
  text-align: center;
}

.side-menu {
  flex: 1;
  border-right: none;
}

.user-card {
  padding: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  gap: 12px;
  align-items: center;
}

.user-info {
  flex: 1;
  overflow: hidden;
}

.username {
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.peer-id {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.main-content {
  padding: 0;
  background: #f0f2f5;
  margin-left: 240px;
  min-height: 100vh;
  height: 100vh;
  overflow-y: auto;
}

/* 移动端样式 */
.mobile-wrapper {
  position: relative;
  min-height: 100vh;
}

.mobile-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  background: #001529;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  z-index: 999;
}

.header-title {
  font-size: 18px;
  font-weight: 500;
  color: #fff;
}

.mobile-drawer :deep(.ant-drawer-body) {
  padding: 0;
  background: #001529;
}

.mobile-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60px;
  background: #fff;
  border-top: 1px solid #f0f0f0;
  padding: 8px 0;
  z-index: 998;
}

.footer-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: rgba(0, 0, 0, 0.45);
  transition: color 0.3s;
}

.footer-item.active {
  color: #1890ff;
}

.footer-icon {
  font-size: 20px;
  margin-bottom: 4px;
}

.footer-label {
  font-size: 12px;
}

/* 移动端内容区域边距 */
@media (max-width: 767px) {
  .main-content {
    margin-left: 0;
    padding-top: 56px;
    padding-bottom: 60px;
  }
}

/* 用户设置弹窗样式 */
.avatar-upload-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.avatar-upload-container :deep(.ant-avatar) {
  flex-shrink: 0;
}

/* 内联提示样式 */
.inline-message {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: 4px;
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
</style>
