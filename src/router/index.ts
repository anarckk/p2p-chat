import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';

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
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
