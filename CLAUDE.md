# 业务需求

## 项目概述

一个基于 PeerJS 的去中心化 P2P 聊天应用，支持设备间自动发现和点对点通信。

## 核心功能模块

### 1. 去中心化发现中心
- **节点对等**：每个节点都承担发现中心的职责，无需中心化服务器
- **设备查询**：节点可以向其他节点查询其持有的朋友列表
- **设备响应**：节点响应其他节点的查询，分享自己发现的设备
- **在线设备展示**：展示所有当前在线的设备

### 2. P2P 聊天应用
- **新增聊天**：支持主动输入对端设备的 PeerId 创建聊天
- **聊天列表**：显示所有聊过的设备（包括已下线的）
- **消息发送**：第一时间即可向对端发送消息
- **消息状态**：展示消息发送状态（未送达/已送达）
- **送达确认**：对端收到消息后向发送方反馈送达状态

### 3. 消息机制
- **消息类型**：支持文本、图片、文件、视频
- **三段式通信**：
  1. 发送方发送消息唯一标识给对端
  2. 对端检查消息 ID，如果不存在则向发送方请求消息内容
  3. 发送方返回消息内容给对端
- **消息去重**：通过消息唯一标识防止重复接收
- **自动重试**：未送达的消息会无限次自动重试，除非用户删除聊天

### 4. 通信协议
- **连接方式**：每次发送消息时建立新的连接，不复用连接
- **连接关闭**：对端接收消息后关闭连接
- **基础工具**：`PeerHttpUtil.ts` 提供类 HTTP 的通信工具

### 5. 用户管理
- **用户设置**：首次进入时要求用户输入用户名和上传头像
- **设备标识**：显示用户名、头像和 PeerId（UUID）
- **PeerId 持久化**：PeerId 存储到 LocalStorage，保持不变

### 6. 被动连接
- **自动添加**：如果对端设备主动发起通信，自动出现在聊天列表中

### 7. 移动端支持
- **响应式设计**：聊天应用支持移动端访问

## 技术栈

- **前端框架**：Vue 3 + TypeScript
- **UI 组件**：Ant Design Vue
- **路由**：Vue Router（路由：/test 隐藏、/center 发现中心、/wechat 聊天）
- **状态管理**：Pinia
- **构建工具**：Vite
- **P2P 通信**：PeerJS

## 开发规范

- 代码格式：`.prettierrc.json`（semi: true, singleQuote: true）
- 服务端口：36626
- 后端服务：Python WebSocket 服务器（端口 13883）用于辅助发现

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
        │   ├── CenterView.vue - 去中心化发现中心（查询/添加设备、展示在线设备）
        │   └── WeChatView.vue - 聊天应用（新增聊天、消息状态展示、多种消息类型、移动端支持）
        ├── stores/
        │   ├── userStore.ts - 用户信息 store（用户名、头像、peerId 持久化、myPeerId 计算属性）
        │   └── chatStore.ts - 聊天 store（消息状态管理、重试机制、去重、localStorage 持久化）
        ├── composables/
        │   └── usePeerManager.ts - Peer 管理逻辑（三段式通信、送达确认、发现中心、消息重试）
        ├── types/
        │   └── index.ts - TypeScript 类型定义（消息类型、协议类型、三段式通信协议）
        └── util/
            └── PeerHttpUtil.ts - PeerJS 工具类（三段式通信协议、去中心化发现中心）

---

# 编译测试要求

你禁止运行 npm run build-only ，必须运行 npm run build 并解决遇到的问题。