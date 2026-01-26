<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  MessageOutlined,
  RadarChartOutlined,
  PlusOutlined,
  LoadingOutlined,
} from '@ant-design/icons-vue';
import type { UploadChangeParam, UploadProps } from 'ant-design-vue';
import { useUserStore } from '../stores/userStore';
import { usePeerManager } from '../composables/usePeerManager';
import { message } from 'ant-design-vue';

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
];

onMounted(async () => {
  // 加载用户信息
  const isSetup = userStore.loadUserInfo();

  if (!isSetup) {
    // 首次使用，显示设置弹窗
    isUserSetupModalVisible.value = true;
  } else {
    // 已设置，初始化 Peer，等待连接完成
    try {
      await init();
    } catch (error) {
      console.error('Peer init failed:', error);
      message.error('Peer 连接失败，请刷新页面重试');
    }
  }
});

/**
 * 将文件转换为 base64
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
    message.error('只能上传图片文件');
    return false;
  }

  const isLt2M = file.size / 1024 / 1024 < 2;
  if (!isLt2M) {
    message.error('图片大小不能超过 2MB');
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
    message.success('头像上传成功');
  } catch (error) {
    message.error('头像处理失败');
  }

  return false; // 阻止自动上传
};

/**
 * 移除头像
 */
const handleRemove = () => {
  avatarUrl.value = '';
  fileList.value = [];
};

async function handleUserSetup() {
  if (!usernameInput.value.trim()) {
    message.warning('请输入用户名');
    return;
  }

  isSubmitting.value = true;

  try {
    // 保存用户信息（包含头像）
    userStore.saveUserInfo({
      username: usernameInput.value.trim(),
      avatar: avatarUrl.value || null,
      peerId: null,
    });

    // 初始化 Peer（会生成并保存 PeerId），等待连接完成
    await init();

    // 关闭弹窗
    isUserSetupModalVisible.value = false;
    usernameInput.value = '';
    avatarUrl.value = '';
    fileList.value = [];

    message.success('设置完成');
  } catch (error) {
    console.error('User setup failed:', error);
    message.error('设置失败，请重试');
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
          </div>
        </a-form-item>
        <a-form-item label="用户名" required>
          <a-input
            v-model:value="usernameInput"
            placeholder="请输入用户名"
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
