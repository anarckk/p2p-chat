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

  // 如果路径不是根路径，说明是 E2E 测试直接访问路径（如 /center）
  // 标记 E2E 测试模式，并自动设置默认用户信息
  if (pathname !== '/' && !hash) {
    console.log('[main.ts] E2E 测试模式：检测到非根路径访问', pathname);
    // 使用 localStorage 存储 E2E 测试标记（因为 window.location.replace 会清除 sessionStorage）
    localStorage.setItem('__E2E_TEST_MODE__', 'true');
    localStorage.setItem('__E2E_TARGET_ROUTE__', pathname.substring(1)); // 去掉开头的 /
    console.log('[main.ts] E2E 测试模式：已设置标记，目标路由 =', pathname.substring(1));

    // 检查是否需要设置用户信息（E2E 测试需要自动设置默认用户）
    const hasUserInfo = localStorage.getItem('p2p_user_info_meta') || localStorage.getItem('p2p_user_info');
    console.log('[main.ts] E2E 测试模式：hasUserInfo =', !!hasUserInfo);
    if (!hasUserInfo) {
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
    } else {
      console.log('[main.ts] E2E 测试模式：用户信息已存在，跳过自动设置');
    }
    // 设置 hash 路由，避免页面刷新
    console.log('[main.ts] E2E 测试模式：设置 hash 为 #/', pathname);
    window.location.hash = '#/';
    console.log('[main.ts] E2E 测试模式：hash 已设置为', window.location.hash);
  }
}

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(Antd);
app.mount('#app');
