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
        │   └── MainLayout.vue - 主布局（顶部导航菜单：/test 为隐藏路由，不在菜单中显示）
        ├── views/
        │   ├── TestView.vue - 测试页面（原 App.vue 内容迁移）
        │   ├── CenterView.vue - 去中心化发现中心（查询/添加设备、展示在线设备、被动发现自动刷新监听、设备持久化、在线/离线状态显示）
        │   └── WeChatView.vue - 聊天应用（新增聊天、消息状态展示、多种消息类型、移动端支持）
        ├── stores/
        │   ├── userStore.ts - 用户信息 store（用户名、头像、peerId 持久化、myPeerId 计算属性）
        │   ├── chatStore.ts - 聊天 store（消息状态管理、重试机制、去重、localStorage 持久化）
        │   └── deviceStore.ts - 设备持久化 store（设备列表 localStorage 持久化、3天未在线自动删除、10分钟定时心跳检查）
        ├── composables/
        │   └── usePeerManager.ts - Peer 管理逻辑（三段式通信、送达确认、发现中心、消息重试、被动发现自动刷新、在线检查协议处理、deviceStore 集成）
        ├── types/
        │   └── index.ts - TypeScript 类型定义（消息类型、协议类型、三段式通信协议、在线检查协议、OnlineDevice 扩展 isOnline/firstDiscovered）
        └── util/
            └── PeerHttpUtil.ts - PeerJS 工具类（三段式通信协议、去中心化发现中心、在线检查协议 checkOnline/respondOnlineCheck）
    ├── e2e/
        ├── center.spec.ts - 发现中心 E2E 测试（多浏览器 session 测试、被动发现测试）
        ├── device-persistence.spec.ts - 设备持久化 E2E 测试（localStorage 持久化、页面切换保持、3天过期删除、在线/离线状态、定时器跨页运行）
        ├── wechat.spec.ts - 聊天功能 E2E 测试
        ├── navigation.spec.ts - 导航测试
        └── vue.spec.ts - Vue 基础测试

---

# 编译测试要求

你禁止运行 npm run build-only ，必须运行 npm run build 并解决遇到的问题。