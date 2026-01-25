# 记忆

sx-peerjs-http-util/
└── vue-peerjs-util/
    ├── index.html - HTML 入口
    ├── package.json - 项目配置（已安装 ant-design-vue@^4.2.6）
    ├── vite.config.ts - Vite 构建配置（端口 36626）
    ├── .prettierrc.json - 代码格式配置（semi: true, singleQuote: true）
    └── src/
        ├── main.ts - Vue 入口（已全局注册 ant-design-vue）
        ├── App.vue - 主组件（使用 ant-design-vue 组件重构：a-card、a-descriptions、a-form、a-input、a-textarea、a-button、a-list、a-tag）
        └── util/
            └── PeerHttpUtil.ts - PeerJS HTTP 工具类（第 20-21 行：根据 peerId 是否存在选择不同的 Peer 构造方式）
