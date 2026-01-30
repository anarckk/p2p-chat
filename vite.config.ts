import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'

/**
 * Vite 插件：在生产构建时自动注入 <base> 标签
 * 用于修复 GitHub Pages 部署时动态导入模块路径解析问题
 */
function injectBaseTag() {
  return {
    name: 'inject-base-tag',
    transformIndexHtml(html: string) {
      // 通过 process.env.NODE_ENV 判断是否为生产环境
      if (process.env.NODE_ENV === 'production') {
        // 在 <head> 中插入 <base href="/p2p-chat/">
        return html.replace(
          /<head>/i,
          '<head>\n    <base href="/p2p-chat/">'
        );
      }
      return html;
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  return {
    plugins: [
      vue(),
      vueJsx(),
      injectBaseTag(),
      // vueDevTools(),
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
