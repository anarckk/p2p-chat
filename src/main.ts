import { createApp } from 'vue';
import { createPinia } from 'pinia';
import Antd from 'ant-design-vue';
import 'ant-design-vue/dist/reset.css';
import App from './App.vue';
import router from './router';

// E2E 测试模式标记：存储原始请求路径
if (typeof window !== 'undefined') {
  const pathname = window.location.pathname;
  const hash = window.location.hash;
  console.log('[main.ts] Page load: pathname =', pathname, ', hash =', hash);

  // 检查是否在 E2E 测试模式（通过标记或 URL 判断）
  const isE2ETestMode = localStorage.getItem('__E2E_TEST_MODE__') === 'true' || (pathname !== '/' && !hash);
  console.log('[main.ts] isE2ETestMode =', isE2ETestMode);

  if (isE2ETestMode) {
    // 如果路径不是根路径，标记 E2E 测试模式和目标路由
    if (pathname !== '/' && !hash) {
      console.log('[main.ts] E2E 测试模式：检测到非根路径访问', pathname);
      localStorage.setItem('__E2E_TEST_MODE__', 'true');
      localStorage.setItem('__E2E_TARGET_ROUTE__', pathname.substring(1)); // 去掉开头的 /
      console.log('[main.ts] E2E 测试模式：已设置标记，目标路由 =', pathname.substring(1));

      // 设置 hash 路由，避免页面刷新
      console.log('[main.ts] E2E 测试模式：设置 hash 为 #/', pathname);
      window.location.hash = '#/';
      console.log('[main.ts] E2E 测试模式：hash 已设置为', window.location.hash);
    }

    // 检查是否禁用自动设置用户信息（某些 E2E 测试需要测试弹窗行为）
    const disableAutoSetup = localStorage.getItem('__E2E_DISABLE_AUTO_SETUP__') === 'true';
    console.log('[main.ts] E2E 测试模式：disableAutoSetup =', disableAutoSetup);

    // 检查是否需要设置用户信息（E2E 测试需要自动设置默认用户）
    const hasUserInfo = localStorage.getItem('p2p_user_info_meta') || localStorage.getItem('p2p_user_info');
    console.log('[main.ts] E2E 测试模式：hasUserInfo =', !!hasUserInfo);
    if (!hasUserInfo && !disableAutoSetup) {
      // E2E 测试：自动设置默认用户信息，避免弹窗阻塞
      const defaultUserInfo = {
        username: 'E2E测试用户',
        avatar: null,
        peerId: null,
        version: 0,
      };
      localStorage.setItem('p2p_user_info', JSON.stringify(defaultUserInfo));
      localStorage.setItem('p2p_user_info_meta', JSON.stringify({
        username: defaultUserInfo.username,
        peerId: defaultUserInfo.peerId,
        version: defaultUserInfo.version,
      }));
      console.log('[main.ts] E2E 测试模式：已自动设置默认用户信息');
    } else if (disableAutoSetup) {
      console.log('[main.ts] E2E 测试模式：检测到禁用自动设置标记，跳过自动设置用户信息');
    } else {
      console.log('[main.ts] E2E 测试模式：用户信息已存在，跳过自动设置');
    }
  }
}

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(Antd);
app.mount('#app');

// 注册 Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[SW] Registered:', registration);

        // 检查更新
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // 有新版本可用
                console.log('[SW] New version available');
                // 可以在这里显示更新提示
              }
            });
          }
        });
      })
      .catch((error) => {
        console.error('[SW] Registration failed:', error);
      });

    // 监听控制器变化（新版本激活）
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}
