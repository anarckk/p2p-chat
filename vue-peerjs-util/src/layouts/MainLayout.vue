<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  MessageOutlined,
  RadarChartOutlined,
} from '@ant-design/icons-vue';
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

async function handleUserSetup() {
  if (!usernameInput.value.trim()) {
    message.warning('请输入用户名');
    return;
  }

  isSubmitting.value = true;

  try {
    // 保存用户信息
    userStore.saveUserInfo({
      username: usernameInput.value.trim(),
      avatar: null,
      peerId: null,
    });

    // 初始化 Peer（会生成并保存 PeerId），等待连接完成
    await init();

    // 关闭弹窗
    isUserSetupModalVisible.value = false;
    usernameInput.value = '';

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
            @click="handleUserSetup"
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
