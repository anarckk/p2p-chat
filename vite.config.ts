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
      // 在 <head> 后立即注入修复脚本和 base 标签，必须在主脚本之前
      const fixScript = `
    <base href="/p2p-chat/">
    <script>
      // 修复 __vite__mapDeps 中的路径解析问题（必须在主脚本加载前执行）
      (function() {
        const originalDeps = window.__vite__mapDeps;
        window.__vite__mapDeps = function(i, m, d) {
          const result = originalDeps ? originalDeps(i, m, d) : { f: [] };
          // 修复 result.f 中的路径
          if (result && result.f) {
            result.f = result.f.map(path => {
              if (typeof path === 'string' && path.startsWith('assets/')) {
                return './' + path;
              }
              return path;
            });
          }
          return result;
        };
        // 复制原始函数的其他属性（如果有的话）
        if (originalDeps) {
          Object.getOwnPropertyNames(originalDeps).forEach(key => {
            if (key !== 'length' && key !== 'name' && key !== 'prototype') {
              try {
                window.__vite__mapDeps[key] = originalDeps[key];
              } catch (e) {}
            }
          });
        }
      })();
    </script>
`;
      return html.replace(
        /<head>/i,
        '<head>' + fixScript
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
