import { fileURLToPath, URL } from 'node:url'

import { defineConfig, Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'

/**
 * Vite 插件：修复 GitHub Pages 部署时 __vite__mapDeps 路径问题
 * 通过注入运行时修复脚本来解决相对路径解析问题
 */
function fixViteMapDepsPlugin(): Plugin {
  return {
    name: 'fix-vite-map-deps',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        // 只在生产环境应用修复
        if (process.env.NODE_ENV !== 'production') {
          return html;
        }

        // 查找主入口 JS 文件名（通过查找 <script type="module"> 标签）
        const scriptMatch = html.match(/<script type="module" crossorigin src="\/p2p-chat\/assets\/([^"]+\.js)">/);
        if (!scriptMatch) {
          return html;
        }

        const mainScriptName = scriptMatch[1];

        // 注入修复脚本：替换 __vite__mapDeps 中的路径后动态执行主脚本
        const fixScript = `
    <script>
      // 修复 __vite__mapDeps 并动态加载主脚本
      (function() {
        fetch('/p2p-chat/assets/${mainScriptName}')
          .then(r => r.text())
          .then(code => {
            // 修复 __vite__mapDeps 中的路径
            code = code.replace(/"assets\\//g, '"./assets/');
            // 执行修复后的代码
            const script = document.createElement('script');
            script.type = 'module';
            script.crossOrigin = 'anonymous';
            script.textContent = code;
            document.head.appendChild(script);
          })
          .catch(e => console.error('Failed to load main script:', e));
      })();
    </script>
`;

        // 移除原始的 script 标签
        const fixedHtml = html.replace(/<script type="module" crossorigin src="\/p2p-chat\/assets\/[^"]+\.js"><\/script>\n/, fixScript);

        return fixedHtml;
      },
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
