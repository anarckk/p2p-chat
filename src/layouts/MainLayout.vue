<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  MessageOutlined,
  RadarChartOutlined,
  PlusOutlined,
  LoadingOutlined,
  SettingOutlined,
  FileTextOutlined,
} from '@ant-design/icons-vue';
import type { UploadChangeParam, UploadProps } from 'ant-design-vue';
import { useUserStore } from '../stores/userStore';
import { usePeerManager } from '../composables/usePeerManager';
import { fileToBase64 } from '../util/fileHelper';

const router = useRouter();
const route = useRoute();

const userStore = useUserStore();
const { init } = usePeerManager();

const selectedKeys = ref([route.name as string]);
const isUserSetupModalVisible = ref(false);
const usernameInput = ref('');
const isSubmitting = ref(false);

// 头像上传相关
const avatarUrl = ref<string>('');
const isUploading = ref(false);
const fileList = ref<any[]>([]);

// 内联提示状态
const inlineMessage = ref('');
const inlineMessageType = ref<'success' | 'error' | 'warning' | 'info'>('info');

// 当前头像URL（用于显示）
const currentAvatar = computed(() => {
  return avatarUrl.value || userStore.userInfo.avatar || '';
});

router.afterEach((to) => {
  selectedKeys.value = [to.name as string];
});

const menuItems = [
  {
    key: 'WeChat',
    label: '聊天',
    icon: MessageOutlined,
  },
  {
    key: 'Center',
    label: '发现中心',
    icon: RadarChartOutlined,
  },
  {
    key: 'Settings',
    label: '设置',
    icon: SettingOutlined,
  },
  {
    key: 'NetworkLog',
    label: '网络数据日志',
    icon: FileTextOutlined,
  },
];

onMounted(async () => {
  console.log('[MainLayout] onMounted: pathname =', window.location.pathname, ', hash =', window.location.hash);
  console.log('[MainLayout] localStorage E2E_TEST_MODE =', localStorage.getItem('__E2E_TEST_MODE__'));
  console.log('[MainLayout] localStorage E2E_TARGET_ROUTE =', localStorage.getItem('__E2E_TARGET_ROUTE__'));

  // E2E 测试模式检测：检查 localStorage 中的标记
  const e2eTestMode = localStorage.getItem('__E2E_TEST_MODE__');
  const targetRoute = localStorage.getItem('__E2E_TARGET_ROUTE__');

  if (e2eTestMode === 'true' && targetRoute) {
    console.log('[MainLayout] E2E 测试模式：检测到标记，目标路由 =', targetRoute);

    // 清除标记
    localStorage.removeItem('__E2E_TEST_MODE__');
    localStorage.removeItem('__E2E_TARGET_ROUTE__');

    // 加载用户信息（应已在 main.ts 中设置）
    const isSetup = await userStore.loadUserInfo();
    console.log('[MainLayout] E2E 测试模式：用户信息加载结果 isSetup =', isSetup);

    // 导航到目标路由（首字母大写）
    const routeName = targetRoute.charAt(0).toUpperCase() + targetRoute.slice(1);
    console.log('[MainLayout] E2E 测试模式：导航到', routeName);
    await router.replace({ name: routeName });

    // 等待路由导航完成
    await new Promise<void>((resolve) => {
      const unwatch = router.afterEach((to, from) => {
        console.log('[MainLayout] E2E 测试模式：路由导航完成', to.name);
        unwatch();
        resolve();
      });
      // 如果路由已经完成，立即 resolve
      if (router.currentRoute.value.name === routeName) {
        console.log('[MainLayout] E2E 测试模式：路由已经是', routeName);
        resolve();
      }
    });

    // 初始化 Peer
    try {
      await init();
      console.log('[MainLayout] E2E 测试模式：Peer 初始化完成，myPeerId =', userStore.myPeerId);
    } catch (error) {
      console.error('[MainLayout] E2E 测试模式：Peer init failed:', error);
    }

    console.log('[MainLayout] E2E 测试模式：导航完成');
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

/**
 * 处理头像上传变化
 */
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

/**
 * 头像上传前处理
 */
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

/**
 * 移除头像
 */
const handleRemove = () => {
  inlineMessage.value = '';
  avatarUrl.value = '';
  fileList.value = [];
};

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

async function handleUserSetup() {
  const trimmedUsername = usernameInput.value.trim();
  clearInlineMessage();

  if (!trimmedUsername) {
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
    userStore.saveUserInfo({
      username: trimmedUsername,
      avatar: avatarUrl.value || null,
    });

    // 关闭弹窗
    isUserSetupModalVisible.value = false;
    usernameInput.value = '';
    avatarUrl.value = '';
    fileList.value = [];

    showInlineMessage('设置完成', 'success');
  } catch (error) {
    console.error('User setup failed:', error);

    // 即使 Peer 连接失败，也允许继续使用（用户信息已保存）
    // 保存用户信息（包含头像）
    userStore.saveUserInfo({
      username: usernameInput.value.trim(),
      avatar: avatarUrl.value || null,
    });

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
</script>

<template>
  <a-layout class="main-layout">
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
            <!-- 内联提示 -->
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

    <a-layout-header class="header">
      <div class="logo">P2P 聊天</div>
      <a-menu
        v-model:selected-keys="selectedKeys"
        theme="dark"
        mode="horizontal"
        class="menu"
      >
        <a-menu-item
          v-for="item in menuItems"
          :key="item.key"
          @click="router.push({ name: item.key })"
        >
          <template #icon>
            <component :is="item.icon" />
          </template>
          {{ item.label }}
        </a-menu-item>
      </a-menu>
    </a-layout-header>
    <a-layout-content class="content">
      <router-view />
    </a-layout-content>
  </a-layout>
</template>

<style scoped>
.main-layout {
  min-height: 100vh;
}

.header {
  display: flex;
  align-items: center;
  padding: 0 24px;
  background: #001529;
}

.logo {
  font-size: 20px;
  font-weight: bold;
  color: #fff;
  margin-right: 48px;
}

.menu {
  flex: 1;
}

.content {
  padding: 0;
  background: #f0f2f5;
}

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

@media (max-width: 768px) {
  .logo {
    font-size: 16px;
    margin-right: 16px;
  }

  .header {
    padding: 0 12px;
  }

  .menu :deep(.ant-menu-item) {
    padding: 0 12px;
  }
}
</style>
