---
name: peerjs-docs
description: PeerJS 官方文档参考指南。当使用 PeerJS 进行 P2P 通信、编写 peer.connect/peer.call 代码、处理连接事件时使用。
---

# PeerJS 官方文档参考

PeerJS 简化了点对点数据、视频和音频通话的实现。

## 基础设置

### 创建 Peer 对象

```javascript
// 自动生成 ID
var peer = new Peer();

// 指定自定义 ID（必须以字母数字开头和结尾，中间可包含 - 和 _）
var peer = new Peer('my-custom-id');

// 带配置选项
var peer = new Peer({
  debug: 1,           // 0=无日志, 1=仅错误, 2=错误+警告, 3=全部
  config: {
    'iceServers': [
      { urls: 'stun:stun.l.google.com:19302' }
    ]
  }
});
```

### 监听连接建立

```javascript
peer.on('open', function(id) {
  console.log('My peer ID is: ' + id);
});
```

**重要**: 如果连接速度很重要，不需要等待 `open` 事件就可以开始连接其他 peers。

## 数据连接 (DataConnection)

### 发起连接

```javascript
var conn = peer.connect('dest-peer-id', {
  label: 'my-connection',      // 可选：连接标识
  metadata: { foo: 'bar' },    // 可选：元数据
  serialization: 'binary',     // binary | binary-utf8 | json | none
  reliable: false              // 是否可靠传输（大文件传输建议 true）
});

// 监听连接打开
conn.on('open', function() {
  // 连接已建立，可以发送数据
  conn.send({ type: 'greeting', content: 'Hello!' });
});

// 监听数据
conn.on('data', function(data) {
  console.log('Received', data);
});

// 监听关闭
conn.on('close', function() {
  console.log('Connection closed');
});

// 监听错误
conn.on('error', function(err) {
  console.error('Connection error:', err);
});
```

### 接收连接

```javascript
peer.on('connection', function(conn) {
  conn.on('open', function() {
    conn.on('data', function(data) {
      console.log('Received', data);
      // 回复消息
      conn.send({ type: 'response', content: 'Got it!' });
    });
  });
});
```

### 支持的数据类型

```javascript
// PeerJS 使用 BinaryPack 序列化，支持以下类型：
conn.send('string');
conn.send(123);
conn.send([1, 2, 3]);
conn.send({ key: 'value' });
conn.send(new Blob([1, 2, 3]));
conn.send(new ArrayBuffer(1024));
```

## 音视频通话 (MediaConnection)

### 发起通话

```javascript
// 获取本地媒体流
navigator.getUserMedia({ video: true, audio: true }, function(stream) {
  var call = peer.call('dest-peer-id', stream, {
    metadata: { callerName: 'Alice' }
  });

  call.on('stream', function(remoteStream) {
    // 显示远程视频
    var video = document.querySelector('video');
    video.srcObject = remoteStream;
  });

  call.on('close', function() {
    console.log('Call ended');
  });

  call.on('error', function(err) {
    console.error('Call error:', err);
  });
}, function(err) {
  console.error('Failed to get local stream', err);
});
```

### 接听通话

```javascript
navigator.getUserMedia({ video: true, audio: true }, function(stream) {
  peer.on('call', function(call) {
    // 接听通话，发送自己的流
    call.answer(stream);

    call.on('stream', function(remoteStream) {
      var video = document.querySelector('video');
      video.srcObject = remoteStream;
    });
  });
});
```

### 单向通话

```javascript
// 只接收不发送（不提供 stream）
peer.on('call', function(call) {
  call.answer(); // 不传 stream，只接收

  call.on('stream', function(remoteStream) {
    // 只能听到/看到对方，对方听不到/看不到你
  });
});
```

## Peer 生命周期

### 断开连接

```javascript
// 断开与服务器的连接，但保持 P2P 连接
peer.disconnect();
// peer.disconnected 变为 true
// 触发 'disconnected' 事件
```

### 重连

```javascript
// 尝试用旧 ID 重连（只能对 disconnected 的 peer）
peer.reconnect();
```

### 销毁

```javascript
// 关闭所有连接，销毁 peer
peer.destroy();
// peer.destroyed 变为 true
// 触发 'close' 事件
```

## 重要事件

### Peer 事件

| 事件 | 触发时机 | 参数 |
|------|----------|------|
| `open` | 连接到 PeerServer 成功 | `id` - 当前 peer 的 ID |
| `connection` | 收到数据连接 | `conn` - DataConnection 对象 |
| `call` | 收到音视频通话 | `call` - MediaConnection 对象 |
| `disconnected` | 与信令服务器断开 | 无 |
| `close` | peer 被销毁 | 无 |
| `error` | 发生错误 | `err` - 错误对象 |

### DataConnection 事件

| 事件 | 触发时机 | 参数 |
|------|----------|------|
| `open` | 连接建立完成 | 无 |
| `data` | 收到数据 | `data` - 接收的数据 |
| `close` | 连接关闭 | 无 |
| `error` | 发生错误 | `err` - 错误对象 |

### MediaConnection 事件

| 事件 | 触发时机 | 参数 |
|------|----------|------|
| `stream` | 收到远程流 | `stream` - MediaStream |
| `close` | 通话结束 | 无 |
| `error` | 发生错误 | `err` - 错误对象 |

## 常见错误类型

| 错误类型 | 是否致命 | 描述 |
|----------|----------|------|
| `browser-incompatible` | 是 | 浏览器不支持 WebRTC |
| `disconnected` | 否 | 已断开与服务器的连接，无法创建新连接 |
| `invalid-id` | 是 | Peer ID 包含非法字符 |
| `invalid-key` | 是 | API key 非法或不存在（仅云服务器） |
| `network` | 否 | 无法连接到信令服务器 |
| `peer-unavailable` | 否 | 要连接的 peer 不存在 |
| `ssl-unavailable` | 是 | 云服务器不支持 SSL |
| `server-error` | 是 | 无法访问服务器 |
| `socket-error` | 是 | 底层 socket 错误 |
| `socket-closed` | 是 | 底层 socket 意外关闭 |
| `unavailable-id` | 可能 | 指定的 ID 已被占用（如果已有 P2P 连接则非致命） |
| `webrtc` | 否 | 原生 WebRTC 错误 |

## 连接状态检查

```javascript
// 检查 peer 是否已连接到服务器
if (!peer.disconnected) {
  // 可以接受/创建新连接
}

// 检查数据连接是否打开
if (conn.open) {
  conn.send('Hello');
}

// 检查音视频通话是否激活
if (call.open) {
  // 通话已接通
}
```

## NAT 穿透说明

- **STUN**: 用于获取公网 IP 和端口（PeerJS 云服务默认提供）
- **TURN**: 用于对称 NAT 场景，需要代理连接
- 大多数用户直接可用，小部分对称 NAT 用户需要 TURN 服务器

## 最佳实践

1. **每次通信创建新连接**: WebRTC DataChannel 不复用，每次发送消息时建立 conn，接收后关闭连接
2. **监听 error 事件**: 始终处理可能的错误
3. **优雅关闭**: 使用 `conn.close()` 和 `peer.destroy()` 清理资源
4. **重连机制**: 利用 `peer.disconnect()`/`peer.reconnect()` 处理网络波动
5. **Peer ID 分享**: 应用层负责 Peer ID 的交换和存储

## 工具函数

```javascript
// 浏览器检测
util.browser; // 'firefox' | 'chrome' | 'safari' | 'edge' | 'Not a supported browser.'

// 功能支持检测
util.supports.data;       // 是否支持数据连接
util.supports.audioVideo; // 是否支持音视频
util.supports.binary;     // 是否支持二进制数据
util.supports.reliable;   // 是否支持可靠传输
```
