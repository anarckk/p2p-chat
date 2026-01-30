import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'

/**
 * Vite 插件：在生产构建时注入修复脚本
 * 用于修复 GitHub Pages 部署时动态导入模块路径解析问题
 */
function injectFixScript() {
  return {
    name: 'inject-fix-script',
    transformIndexHtml(html: string) {
      // 通过 process.env.NODE_ENV 判断是否为生产环境
      if (process.env.NODE_ENV !== 'production') {
        return html;
      }
      // 在 </head> 前注入 base 标签和修复脚本
      const fixScript = `
    <base href="/p2p-chat/">
    <script>
      // 修复 __vite__mapDeps 中的路径解析问题
      // 使用拦截器在 __vite__mapDeps 被设置时自动修复路径
      (function() {
        const originalDeps = { f: [] };
        Object.defineProperty(window, '__vite__mapDeps', {
          configurable: true,
          get: function() { return originalDeps; },
          set: function(value) {
            if (value && value.f) {
              originalDeps.f = value.f.map(path => {
                if (typeof path === 'string' && path.startsWith('assets/')) {
                  return './' + path;
                }
                return path;
              });
            }
          }
        });
      })();
    </script>
`;
      return html.replace(
        /<\/head>/i,
        fixScript + '\n  </head>'
      );
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  return {
    plugins: [
      vue(),
      vueJsx(),
      injectFixScript(),
    ],
    base: mode === 'production' ? '/p2p-chat/' : '/',
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
    server: {
      host: '0.0.0.0',
      port: 36626,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            // Vue 核心库
            'vue-vendor': ['vue', 'vue-router', 'pinia'],
            // UI 组件库
            'antd': ['ant-design-vue', '@ant-design/icons-vue'],
            // PeerJS 通信库
            'peerjs': ['peerjs'],
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
  };
})
