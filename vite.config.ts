import { fileURLToPath, URL } from 'node:url'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { defineConfig, Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'

/**
 * Vite 插件：修复 GitHub Pages 部署时 __vite__mapDeps 路径问题
 * 通过 closeBundle 钩子在构建完成后修改文件
 * 修复 __vite__mapDeps 数组和动态 import 语句中的相对路径
 */
function fixViteMapDepsPlugin(): Plugin {
  return {
    name: 'fix-vite-map-deps',
    closeBundle() {
      // 只在生产环境应用修复
      if (process.env.NODE_ENV !== 'production') {
        return;
      }

      const outDir = 'dist';
      const assetsDir = resolve(outDir, 'assets');

      try {
        // 读取 assets 目录中的所有 .js 文件
        const files = readdirSync(assetsDir);
        const jsFiles = files.filter((f: string) => f.endsWith('.js'));

        for (const fileName of jsFiles) {
          const filePath = resolve(assetsDir, fileName);
          let content = readFileSync(filePath, 'utf-8');

          // 修复 __vite__mapDeps 数组中的路径
          if (content.includes('__vite__mapDeps')) {
            console.log(`[fixViteMapDeps] Processing: ${fileName}`);

            // 修复 __vite__mapDeps 数组中的路径
            // 将 "assets/ 替换为 "/p2p-chat/assets/
            content = content.replace(/"assets\//g, '"/p2p-chat/assets/');

            // 修复动态 import 语句中的相对路径
            // 将 import("./File.js") 替换为 import("/p2p-chat/assets/File.js")
            content = content.replace(/import\("\.\/([^"]+\.js)"/g, 'import("/p2p-chat/assets/$1"');
            // 修复 from 语句中的相对路径
            content = content.replace(/from"\.\/([^"]+\.js)"/g, 'from"/p2p-chat/assets/$1"');

            const matchCount = (content.match(/"assets\//g) || []).length;
            console.log(`[fixViteMapDeps] Fixed ${matchCount} paths`);

            // 写入修复后的文件
            writeFileSync(filePath, content, 'utf-8');
            console.log(`[fixViteMapDeps] Updated: ${fileName}`);
          }
        }
      } catch (error) {
        console.error('[fixViteMapDeps] Error:', error);
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  return {
    plugins: [
      vue(),
      vueJsx(),
      fixViteMapDepsPlugin(),
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
