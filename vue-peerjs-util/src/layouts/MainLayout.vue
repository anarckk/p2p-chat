<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  MessageOutlined,
  RadarChartOutlined,
  ExperimentOutlined,
} from '@ant-design/icons-vue';

const router = useRouter();
const route = useRoute();

const selectedKeys = ref([route.name as string]);

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
    key: 'Test',
    label: '测试',
    icon: ExperimentOutlined,
  },
];
</script>

<template>
  <a-layout class="main-layout">
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
