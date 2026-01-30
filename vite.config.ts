import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueJsx(),
    // vueDevTools(),
  ],
  base: process.env.NODE_ENV === 'production' ? '/p2p-chat/' : '/',
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
})
