import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';

/**
 * 获取路由 base 路径
 * 生产环境（GitHub Pages）使用 /p2p-chat/，开发环境使用 /
 */
function getRouterBase(): string {
  return import.meta.env.PROD ? '/p2p-chat/' : '/';
}

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    redirect: '/wechat',
    children: [
      {
        path: 'test',
        name: 'Test',
        component: () => import('../views/TestView.vue'),
        meta: { title: '测试' },
      },
      {
        path: 'center',
        name: 'Center',
        component: () => import('../views/CenterView.vue'),
        meta: { title: '发现中心', requiresSetup: true },
      },
      {
        path: 'wechat',
        name: 'WeChat',
        component: () => import('../views/WeChatView.vue'),
        meta: { title: '聊天', requiresSetup: true },
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('../views/SettingsView.vue'),
        meta: { title: '设置', requiresSetup: true },
      },
      {
        path: 'network-log',
        name: 'NetworkLog',
        component: () => import('../views/NetworkLogView.vue'),
        meta: { title: '网络数据日志', requiresSetup: true },
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(getRouterBase()),
  routes,
});

export default router;
