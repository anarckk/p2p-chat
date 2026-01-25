# 记忆

sx-peerjs-http-util/
└── vue-peerjs-util/
    ├── index.html - HTML 入口
    ├── package.json - 项目配置（已安装 ant-design-vue@^4.2.6、vue-router@^4.6.4、pinia@^3.0.4）
    ├── vite.config.ts - Vite 构建配置（端口 36626）
    ├── .prettierrc.json - 代码格式配置（semi: true, singleQuote: true）
    └── src/
        ├── main.ts - Vue 入口（已全局注册 ant-design-vue、vue-router、pinia）
        ├── App.vue - 根组件
        ├── router/
        │   ├── index.ts - 路由配置（/test、/center、/wechat）
        │   └── RouterView.vue - 路由视图组件
        ├── layouts/
        │   └── MainLayout.vue - 主布局（顶部导航菜单）
        ├── views/
        │   ├── TestView.vue - 测试页面（原 App.vue 内容迁移）
        │   ├── CenterView.vue - 发现中心页面（显示在线设备、连接发现中心）
        │   └── WeChatView.vue - 聊天应用页面（两栏布局、用户设置、移动端支持）
        ├── stores/
        │   ├── userStore.ts - 用户信息 store（用户名、头像、peerId、localStorage 持久化）
        │   └── chatStore.ts - 聊天 store（联系人、消息、离线消息队列、localStorage 持久化）
        ├── composables/
        │   └── usePeerManager.ts - Peer 管理逻辑（初始化、消息处理、离线消息重发、被动连接）
        ├── types/
        │   └── index.ts - TypeScript 类型定义
        └── util/
            └── PeerHttpUtil.ts - PeerJS HTTP 工具类（第 20-21 行：根据 peerId 是否存在选择不同的 Peer 构造方式）
