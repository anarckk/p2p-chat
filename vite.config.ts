import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'

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

/**
 * Vite 插件：修复 __vite__mapDeps 中的路径解析问题
 * 将相对路径 "assets/xxx.js" 修正为 "./assets/xxx.js"
 * 确保浏览器正确解析动态导入模块的路径
 */
function fixViteMapDepsPaths() {
  return {
    name: 'fix-vite-map-deps-paths',
    renderChunk(code: string) {
      // 只在生产环境处理
      if (process.env.NODE_ENV !== 'production') {
        return null;
      }
      // 修复 __vite__mapDeps 数组中的路径，添加 "./" 前缀
      // Vite 生成的格式: __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/xxx.js",...])))
      return code.replace(
        /__vite__mapDeps=\(i,m=__vite__mapDeps,d=\(m\.f\|\|\(m\.f=\[([^\]]+)\]\)\)\)/,
        (match, pathsArray) => {
          // 在每个路径字符串前添加 "./"
          const fixedPaths = pathsArray.replace(/"([^"]+)"/g, (_match: string, path: string) => {
            // 如果路径不是以 "./" 或 "/" 开头，添加 "./"
            if (!path.startsWith('./') && !path.startsWith('/')) {
              return `"./${path}"`;
            }
            return `"${path}"`;
          });
          return `__vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=[${fixedPaths}])))`;
        }
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
      injectBaseTag(),
      fixViteMapDepsPaths(),
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
