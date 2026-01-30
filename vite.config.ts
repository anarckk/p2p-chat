import { fileURLToPath, URL } from 'node:url'

import { defineConfig, Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'

/**
 * Vite 插件：在生产构建时注入修复脚本
 * 通过 fetch 获取主脚本，修复 __vite__mapDeps 路径后执行
 */
function injectFixScript(): Plugin {
  return {
    name: 'inject-fix-script',
    transformIndexHtml(html: string) {
      if (process.env.NODE_ENV !== 'production') {
        return html;
      }
      // 移除原来的主脚本标签，我们会动态加载
      html = html.replace(
        /<script type="module" crossorigin src="\/p2p-chat\/assets\/index-tfmkhWZT\.js"><\/script>/,
        ''
      );
      // 注入修复脚本和 base 标签
      const fixScript = `
    <base href="/p2p-chat/">
    <script>
      // 修复 __vite__mapDeps 并动态加载主脚本
      (function() {
        fetch('/p2p-chat/assets/index-tfmkhWZT.js')
          .then(r => r.text())
          .then(code => {
            // 修复 __vite__mapDeps 中的路径
            code = code.replace(/"assets\//g, '"./assets/');
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
