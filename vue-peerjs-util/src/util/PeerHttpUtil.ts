/**
 * PeerJS HTTP 封装库 - 版本号消息同步协议 + 去中心化发现中心
 * 对外仅暴露 send() 和 on('message')
 */
import Peer from 'peerjs';
import type {
  AnyProtocol,
  ChatMessage,
  MessageType,
  MessageContent,
  OnlineDevice,
  DeliveryAckProtocol,
  DiscoveryResponseProtocol,
} from '../types';
import { commLog } from './logger';

export type MessageHandler = (data: { from: string; data: any }) => void;
export type OpenHandler = (id: string) => void;
export type ErrorHandler = (error: any) => void;
export type ProtocolMessageHandler = (protocol: AnyProtocol, from: string) => void;

// 每个聊天记录的版本号和消息存储
interface ChatVersion {
  version: number;
  messages: ChatMessage[];
}

export class PeerHttpUtil {
  private peer: any;
  private messageHandlers: MessageHandler[] = [];
  private openHandlers: OpenHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private protocolHandlers: Map<string, ProtocolMessageHandler[]> = new Map();

  // 存储每个聊天的版本号和消息（key: peerId, value: version + messages）
  private chatVersions: Map<string, ChatVersion> = new Map();

  // 发现中心：存储已发现的设备
  private discoveredDevices: Map<string, OnlineDevice> = new Map();

  /**
   * 构造函数
   * @param peerId - 当前节点的 ID，如果不提供则自动生成
   * @param options - PeerJS 配置选项
   */
  constructor(peerId: string | null = null, options: any = {}) {
    const peerOptions = { debug: 1, ...options };
    this.peer = peerId ? new Peer(peerId, peerOptions) : new Peer(peerOptions);

    // 监听连接打开事件
    this.peer.on('open', (id: string) => {
      console.log('[PeerHttp] Peer connection opened:', id);
      commLog.connection.connected({ peerId: id });
      this.openHandlers.forEach((handler) => {
        try {
          handler(id);
        } catch (err) {
          console.error('[PeerHttp] Open handler error:', err);
        }
      });
    });

    // 监听错误事件
    this.peer.on('error', (error: any) => {
      console.error('[PeerHttp] Peer error:', error);
      this.errorHandlers.forEach((handler) => {
        try {
          handler(error);
        } catch (err) {
          console.error('[PeerHttp] Error handler error:', err);
        }
      });
    });

    this.peer.on('connection', (conn: any) => {
      console.log('[PeerHttp] Received connection from:', conn.peer);
      conn.on('data', (data: any) => {
        console.log('[PeerHttp] Received data from:', conn.peer, 'type:', data?.type);
        // 检查是否是协议消息
        if (data && typeof data === 'object' && data.type) {
          this.handleProtocolMessage(data, conn.peer);
        } else {
          // 普通消息
          this.messageHandlers.forEach((handler) => {
            try {
              handler({ from: conn.peer, data });
            } catch (err) {
              console.error('[PeerHttp] Handler error:', err);
            }
          });
        }
        // 延迟关闭连接，确保数据已处理完成
        setTimeout(() => {
          try {
            conn.close();
          } catch (e) {
            // 忽略关闭错误
          }
        }, 50);
      });
    });
  }

  /**
   * 处理协议消息
   */
  private handleProtocolMessage(protocol: AnyProtocol, from: string) {
    const { type } = protocol;

    switch (type) {
      case 'version_notify':
        // 接收到版本号通知，对端有新消息
        this.handleVersionNotify(protocol as any, from);
        break;
      case 'version_request':
        // 对端请求指定版本的消息
        this.handleVersionRequest(protocol as any, from);
        break;
      case 'version_response':
        // 接收到消息内容
        this.handleVersionResponse(protocol as any, from);
        break;
      case 'delivery_ack':
        // 送达确认
        this.handleDeliveryAck(protocol as any);
        break;
      case 'discovery_query':
        // 发现中心：询问在线设备
        this.handleDiscoveryQuery(from);
        break;
      case 'discovery_response':
        // 发现中心：响应在线设备列表
        this.handleDiscoveryResponse(protocol as any);
        break;
      case 'discovery_notification':
        // 发现中心：收到发现通知
        this.handleDiscoveryNotification(protocol as any, from);
        break;
      case 'username_query':
        // 查询用户名
        this.handleUsernameQuery(from);
        break;
      case 'username_response':
        // 响应用户名查询
        this.handleUsernameResponse(protocol as any, from);
        break;
      case 'online_check_query':
        // 在线检查：询问是否在线
        this.handleOnlineCheckQuery(protocol as any, from);
        break;
      case 'online_check_response':
        // 在线检查：响应在线状态
        this.handleOnlineCheckResponse(protocol as any, from);
        break;
      case 'user_info_query':
        // 查询用户完整信息
        this.handleUserInfoQuery(from);
        break;
      case 'user_info_response':
        // 响应用户完整信息
        this.handleUserInfoResponse(protocol as any, from);
        break;
    }
  }

  /**
   * 获取或创建聊天版本记录
   */
  private getOrCreateChatVersion(peerId: string): ChatVersion {
    if (!this.chatVersions.has(peerId)) {
      this.chatVersions.set(peerId, { version: 0, messages: [] });
    }
    return this.chatVersions.get(peerId)!;
  }

  /**
   * 处理版本号通知：对端有新消息
   */
  private handleVersionNotify(protocol: { version: number; msgType: MessageType }, from: string) {
    const { version } = protocol;
    const myChat = this.getOrCreateChatVersion(from);

    console.log('[PeerHttp] Received version notify: from=' + from + ', theirVersion=' + version + ', myVersion=' + myChat.version);

    // 如果对端版本更新，请求消息内容
    if (version > myChat.version) {
      this.sendProtocol(from, {
        type: 'version_request',
        from: this.getId()!,
        to: from,
        timestamp: Date.now(),
        version,
      });
    }
  }

  /**
   * 处理版本请求：对端请求指定版本的消息
   */
  private handleVersionRequest(protocol: { version: number }, from: string) {
    const { version } = protocol;
    const myChat = this.getOrCreateChatVersion(from);

    console.log('[PeerHttp] Received version request: from=' + from + ', requestedVersion=' + version + ', myVersion=' + myChat.version);

    // 查找对应版本的消息（版本号从 1 开始，对应数组索引 version - 1）
    const message = myChat.messages[version - 1];

    if (message) {
      // 发送消息内容给对端
      this.sendProtocol(from, {
        type: 'version_response',
        from: this.getId()!,
        to: from,
        timestamp: Date.now(),
        version,
        message,
      });
    } else {
      console.warn('[PeerHttp] Message not found for version:', version);
    }
  }

  /**
   * 处理版本响应：接收到消息内容
   */
  private handleVersionResponse(protocol: { version: number; message: ChatMessage }, from: string) {
    const { version, message } = protocol;
    const myChat = this.getOrCreateChatVersion(from);

    console.log('[PeerHttp] Received version response: from=' + from + ', version=' + version);

    // 检查版本是否已处理
    if (version <= myChat.version) {
      console.log('[PeerHttp] Version already processed, ignoring');
      return;
    }

    // 更新版本号并存储消息
    myChat.version = version;
    myChat.messages.push(message);

    commLog.message.received({ from, msgType: message.type, messageId: message.id });

    // 发送送达确认
    this.sendDeliveryAck(from, message.id);

    // 触发消息处理器
    console.log('[PeerHttp] Triggering message handlers: messageId=' + message.id);

    this.messageHandlers.forEach((handler) => {
      try {
        handler({ from, data: message });
      } catch (err) {
        console.error('[PeerHttp] Handler error:', err);
      }
    });
  }

  /**
   * 处理送达确认
   */
  private handleDeliveryAck(protocol: DeliveryAckProtocol) {
    const { messageId } = protocol;

    // 触发送达确认事件
    this.emitProtocol('delivery_ack', protocol);
  }

  /**
   * 处理发现中心查询
   */
  private handleDiscoveryQuery(from: string) {
    // 响应我已发现的设备列表
    const devices = Array.from(this.discoveredDevices.values());

    this.sendProtocol(from, {
      type: 'discovery_response',
      from: this.getId()!,
      to: from,
      timestamp: Date.now(),
      devices,
    });
  }

  /**
   * 处理发现中心响应
   */
  private handleDiscoveryResponse(protocol: DiscoveryResponseProtocol) {
    const { devices } = protocol;

    // 合并到已发现的设备列表
    devices.forEach((device) => {
      this.discoveredDevices.set(device.peerId, device);
    });

    // 触发发现中心事件
    this.emitProtocol('discovery_response', protocol);
  }

  /**
   * 处理发现通知：对端通知我它发现了我
   */
  private handleDiscoveryNotification(
    protocol: { fromUsername: string; fromAvatar: string | null },
    from: string,
  ) {
    console.log('[PeerHttp] handleDiscoveryNotification called:', { from, username: protocol.fromUsername });
    commLog.discovery.notified({ from, username: protocol.fromUsername });

    // 将对端添加到已发现的设备列表（保留原有的 firstDiscovered）
    const existing = this.discoveredDevices.get(from);
    this.discoveredDevices.set(from, {
      peerId: from,
      username: protocol.fromUsername,
      avatar: protocol.fromAvatar,
      lastHeartbeat: Date.now(),
      firstDiscovered: existing?.firstDiscovered || Date.now(),
      isOnline: true,
    });

    console.log('[PeerHttp] Device added to discoveredDevices:', { from, username: protocol.fromUsername });

    // 触发发现通知事件
    this.emitProtocol('discovery_notification', { ...protocol, from } as any);
  }

  /**
   * 处理用户名查询请求
   */
  private handleUsernameQuery(from: string) {
    // 需要获取当前用户信息，这里通过事件传递出去，让外部处理
    this.emitProtocol('username_query', { from } as any);
  }

  /**
   * 处理用户名查询响应
   */
  private handleUsernameResponse(
    protocol: { username: string; avatar: string | null },
    from: string,
  ) {
    // 更新已发现的设备信息
    const existing = this.discoveredDevices.get(from);
    if (existing) {
      existing.username = protocol.username;
      existing.avatar = protocol.avatar;
      existing.lastHeartbeat = Date.now();
    }

    // 触发用户名响应事件
    this.emitProtocol('username_response', { ...protocol, from } as any);
  }

  /**
   * 注册协议处理器
   */
  onProtocol(type: AnyProtocol['type'], handler: ProtocolMessageHandler) {
    if (!this.protocolHandlers.has(type)) {
      this.protocolHandlers.set(type, []);
    }
    this.protocolHandlers.get(type)!.push(handler);
  }

  /**
   * 触发协议处理器
   */
  private emitProtocol(type: AnyProtocol['type'], protocol: AnyProtocol) {
    const handlers = this.protocolHandlers.get(type) || [];
    handlers.forEach((handler) => {
      try {
        handler(protocol, protocol.from);
      } catch (err) {
        console.error('[PeerHttp] Protocol handler error:', err);
      }
    });
  }

  /**
   * 发送协议消息
   */
  private sendProtocol(peerId: string, protocol: AnyProtocol): Promise<void> {
    console.log('[PeerHttp] Sending protocol:', { peerId, protocolType: protocol.type });

    return new Promise((resolve, reject) => {
      const conn = this.peer.connect(peerId);
      const timeout = setTimeout(() => {
        console.error('[PeerHttp] Connection timeout for:', peerId);
        conn.close();
        reject(new Error('Connection timeout'));
      }, 10000);

      conn.on('open', () => {
        console.log('[PeerHttp] Connection opened to:', peerId);
        try {
          conn.send(protocol);
          console.log('[PeerHttp] Protocol sent successfully');
          // 等待一小段时间确保数据发送完成
          setTimeout(() => {
            clearTimeout(timeout);
            conn.close();
            resolve();
          }, 100);
        } catch (err) {
          console.error('[PeerHttp] Error sending protocol:', err);
          clearTimeout(timeout);
          conn.close();
          reject(err);
        }
      });
      conn.on('error', (err: any) => {
        console.error('[PeerHttp] Connection error:', err);
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * 发送送达确认
   */
  private sendDeliveryAck(peerId: string, messageId: string) {
    this.sendProtocol(peerId, {
      type: 'delivery_ack',
      from: this.getId()!,
      to: peerId,
      timestamp: Date.now(),
      messageId,
    }).catch((err) => {
      console.error('[PeerHttp] Failed to send delivery ack:', err);
    });
  }

  /**
   * 发送消息（版本号机制）
   * @param peerId - 目标节点的 ID
   * @param messageId - 消息唯一标识
   * @param content - 消息内容
   * @param type - 消息类型
   * @param isRetry - 是否为重试（重试时重新发送版本号通知）
   */
  send(
    peerId: string,
    messageId: string,
    content: MessageContent,
    type: MessageType = 'text',
    isRetry: boolean = false,
  ): Promise<{ peerId: string; messageId: string; sent: boolean; stage: 'notified' | 'requested' | 'delivered' }> {
    console.log('[PeerHttp] Starting version-based send: peerId=' + peerId + ', messageId=' + messageId + ', type=' + type + ', isRetry=' + isRetry);

    // 获取或创建聊天版本记录
    const myChat = this.getOrCreateChatVersion(peerId);

    // 只有非重试时才增加版本号并存储消息
    if (!isRetry) {
      myChat.version++;
      const chatMessage: ChatMessage = {
        id: messageId,
        from: this.getId()!,
        to: peerId,
        content,
        timestamp: Date.now(),
        status: 'sent',
        type,
      };
      myChat.messages.push(chatMessage);
      console.log('[PeerHttp] Stored message with version: ' + myChat.version);
    } else {
      console.log('[PeerHttp] Retry mode: resending version notify');
    }

    // 发送版本号通知给对端
    return new Promise((resolve, reject) => {
      this.sendProtocol(peerId, {
        type: 'version_notify',
        from: this.getId()!,
        to: peerId,
        timestamp: Date.now(),
        version: myChat.version,
        msgType: type,
      })
        .then(() => {
          console.log('[PeerHttp] Version notify sent: version=' + myChat.version);
          resolve({ peerId, messageId, sent: true, stage: 'notified' });
        })
        .catch((err) => {
          console.error('[PeerHttp] Version notify failed:', err);
          if (!isRetry) {
            // 回退版本号
            myChat.version--;
            myChat.messages.pop();
          }
          reject(err);
        });
    });
  }

  /**
   * 发现中心：询问指定节点已发现的设备
   * @param peerId - 目标节点的 ID
   */
  async queryDiscoveredDevices(peerId: string): Promise<OnlineDevice[]> {
    return new Promise((resolve, reject) => {
      // 设置一次性处理器
      const handler = (protocol: AnyProtocol) => {
        if (protocol.type === 'discovery_response') {
          const resp = protocol as any;
          resolve(resp.devices || []);

          // 清理处理器
          const handlers = this.protocolHandlers.get('discovery_response') || [];
          const index = handlers.indexOf(handler);
          if (index > -1) {
            handlers.splice(index, 1);
          }
        }
      };

      this.onProtocol('discovery_response', handler as any);

      // 发送查询
      this.sendProtocol(peerId, {
        type: 'discovery_query',
        from: this.getId()!,
        to: peerId,
        timestamp: Date.now(),
      }).catch(reject);

      // 超时处理
      setTimeout(() => {
        const handlers = this.protocolHandlers.get('discovery_response') || [];
        const index = handlers.indexOf(handler as any);
        if (index > -1) {
          handlers.splice(index, 1);
        }
        resolve([]);
      }, 5000);
    });
  }

  /**
   * 发现中心：添加已发现的设备
   */
  addDiscoveredDevice(device: OnlineDevice) {
    this.discoveredDevices.set(device.peerId, device);
  }

  /**
   * 发现中心：获取已发现的设备列表
   */
  getDiscoveredDevices(): OnlineDevice[] {
    return Array.from(this.discoveredDevices.values());
  }

  /**
   * 发现中心：更新设备心跳
   */
  updateDeviceHeartbeat(peerId: string) {
    const device = this.discoveredDevices.get(peerId);
    if (device) {
      device.lastHeartbeat = Date.now();
    }
  }

  /**
   * 发现中心：发送发现通知给对端
   */
  async sendDiscoveryNotification(peerId: string, username: string, avatar: string | null) {
    try {
      await this.sendProtocol(peerId, {
        type: 'discovery_notification',
        from: this.getId()!,
        to: peerId,
        timestamp: Date.now(),
        fromUsername: username,
        fromAvatar: avatar,
      });
    } catch (err) {
      console.error('[PeerHttp] Failed to send discovery notification:', err);
    }
  }

  /**
   * 发现中心：查询对端用户名
   */
  async queryUsername(peerId: string): Promise<{ username: string; avatar: string | null } | null> {
    return new Promise((resolve) => {
      // 设置一次性处理器
      const handler = (protocol: AnyProtocol, from: string) => {
        if (protocol.type === 'username_response' && from === peerId) {
          const resp = protocol as any;
          resolve({ username: resp.username, avatar: resp.avatar });

          // 清理处理器
          const handlers = this.protocolHandlers.get('username_response') || [];
          const index = handlers.indexOf(handler as any);
          if (index > -1) {
            handlers.splice(index, 1);
          }
        }
      };

      this.onProtocol('username_response', handler as any);

      // 发送查询
      this.sendProtocol(peerId, {
        type: 'username_query',
        from: this.getId()!,
        to: peerId,
        timestamp: Date.now(),
      }).catch(() => resolve(null));

      // 超时处理
      setTimeout(() => {
        const handlers = this.protocolHandlers.get('username_response') || [];
        const index = handlers.indexOf(handler as any);
        if (index > -1) {
          handlers.splice(index, 1);
        }
        resolve(null);
      }, 5000);
    });
  }

  /**
   * 发现中心：响应用户名查询
   */
  async respondUsernameQuery(peerId: string, username: string, avatar: string | null) {
    try {
      await this.sendProtocol(peerId, {
        type: 'username_response',
        from: this.getId()!,
        to: peerId,
        timestamp: Date.now(),
        username,
        avatar,
      });
    } catch (err) {
      console.error('[PeerHttp] Failed to send username response:', err);
    }
  }

  /**
   * 处理在线检查查询
   */
  private handleOnlineCheckQuery(protocol: { userInfoVersion: number }, from: string) {
    commLog.heartbeat.check({ to: from, version: protocol.userInfoVersion });
    // 需要获取当前用户信息来响应，通过事件传递出去
    // 同时携带对方的版本号，用于检查是否需要更新对方信息
    this.emitProtocol('online_check_query', { from, userInfoVersion: protocol.userInfoVersion } as any);
  }

  /**
   * 处理在线检查响应
   */
  private handleOnlineCheckResponse(
    protocol: { isOnline: boolean; username: string; avatar: string | null; userInfoVersion: number },
    from: string,
  ) {
    if (protocol.isOnline) {
      commLog.heartbeat.online({ from });
    } else {
      commLog.heartbeat.offline({ peerId: from });
    }

    // 更新设备的在线状态和心跳时间
    const existing = this.discoveredDevices.get(from);
    if (existing) {
      existing.lastHeartbeat = Date.now();
      existing.isOnline = protocol.isOnline;
      existing.username = protocol.username;
      existing.avatar = protocol.avatar;
      existing.userInfoVersion = protocol.userInfoVersion;
    }

    // 触发在线检查响应事件
    this.emitProtocol('online_check_response', {
      ...protocol,
      from,
    } as any);
  }

  /**
   * 处理用户信息查询
   */
  private handleUserInfoQuery(from: string) {
    commLog.sync.respondInfo({ to: from });
    this.emitProtocol('user_info_query', { from } as any);
  }

  /**
   * 处理用户信息响应
   */
  private handleUserInfoResponse(
    protocol: { username: string; avatar: string | null; version: number },
    from: string,
  ) {
    // 更新已发现的设备信息
    const existing = this.discoveredDevices.get(from);

    if (existing) {
      existing.username = protocol.username;
      existing.avatar = protocol.avatar;
      existing.userInfoVersion = protocol.version;
    }

    commLog.sync.updateInfo({
      peerId: from,
      username: protocol.username,
      version: protocol.version,
    });

    // 触发用户信息响应事件
    this.emitProtocol('user_info_response', {
      ...protocol,
      from,
    } as any);
  }

  /**
   * 在线检查：查询指定设备是否在线
   * @param peerId - 目标节点的 ID
   * @param _username - 当前用户名（用于响应，已废弃，保留参数兼容性）
   * @param _avatar - 当前头像（用于响应，已废弃，保留参数兼容性）
   * @param userInfoVersion - 当前用户信息版本号
   */
  async checkOnline(
    peerId: string,
    _username: string,
    _avatar: string | null,
    userInfoVersion: number,
  ): Promise<{ isOnline: boolean; username: string; avatar: string | null; userInfoVersion: number } | null> {
    return new Promise((resolve) => {
      // 设置一次性处理器
      const handler = (protocol: AnyProtocol, from: string) => {
        if (protocol.type === 'online_check_response' && from === peerId) {
          const resp = protocol as any;
          resolve({
            isOnline: resp.isOnline,
            username: resp.username,
            avatar: resp.avatar,
            userInfoVersion: resp.userInfoVersion,
          });

          // 清理处理器
          const handlers = this.protocolHandlers.get('online_check_response') || [];
          const index = handlers.indexOf(handler as any);
          if (index > -1) {
            handlers.splice(index, 1);
          }
        }
      };

      this.onProtocol('online_check_response', handler as any);

      // 发送查询（携带我的版本号）
      this.sendProtocol(peerId, {
        type: 'online_check_query',
        from: this.getId()!,
        to: peerId,
        timestamp: Date.now(),
        userInfoVersion,
      }).catch(() => resolve(null));

      // 超时处理
      setTimeout(() => {
        const handlers = this.protocolHandlers.get('online_check_response') || [];
        const index = handlers.indexOf(handler as any);
        if (index > -1) {
          handlers.splice(index, 1);
        }
        resolve(null);
      }, 5000);
    });
  }

  /**
   * 在线检查：响应在线检查查询
   * @param peerId - 查询者的节点 ID
   * @param username - 当前用户名
   * @param avatar - 当前头像
   * @param userInfoVersion - 当前用户信息版本号
   */
  async respondOnlineCheck(peerId: string, username: string, avatar: string | null, userInfoVersion: number) {
    try {
      await this.sendProtocol(peerId, {
        type: 'online_check_response',
        from: this.getId()!,
        to: peerId,
        timestamp: Date.now(),
        isOnline: true,
        username,
        avatar,
        userInfoVersion,
      });
    } catch (err) {
      console.error('[PeerHttp] Failed to send online check response:', err);
    }
  }

  /**
   * 查询用户完整信息
   * @param peerId - 目标节点的 ID
   */
  async queryUserInfo(peerId: string): Promise<{ username: string; avatar: string | null; version: number } | null> {
    return new Promise((resolve) => {
      const handler = (protocol: AnyProtocol, from: string) => {
        if (protocol.type === 'user_info_response' && from === peerId) {
          const resp = protocol as any;
          resolve({
            username: resp.username,
            avatar: resp.avatar,
            version: resp.version,
          });

          // 清理处理器
          const handlers = this.protocolHandlers.get('user_info_response') || [];
          const index = handlers.indexOf(handler as any);
          if (index > -1) {
            handlers.splice(index, 1);
          }
        }
      };

      this.onProtocol('user_info_response', handler as any);

      // 发送查询
      this.sendProtocol(peerId, {
        type: 'user_info_query',
        from: this.getId()!,
        to: peerId,
        timestamp: Date.now(),
      }).catch(() => resolve(null));

      // 超时处理
      setTimeout(() => {
        const handlers = this.protocolHandlers.get('user_info_response') || [];
        const index = handlers.indexOf(handler as any);
        if (index > -1) {
          handlers.splice(index, 1);
        }
        resolve(null);
      }, 5000);
    });
  }

  /**
   * 响应用户信息查询
   * @param peerId - 查询者的节点 ID
   * @param username - 当前用户名
   * @param avatar - 当前头像
   * @param version - 当前用户信息版本号
   */
  async respondUserInfo(peerId: string, username: string, avatar: string | null, version: number) {
    try {
      await this.sendProtocol(peerId, {
        type: 'user_info_response',
        from: this.getId()!,
        to: peerId,
        timestamp: Date.now(),
        username,
        avatar,
        version,
      });
    } catch (err) {
      console.error('[PeerHttp] Failed to send user info response:', err);
    }
  }

  /**
   * 监听消息事件
   * @param event - 支持 'message' | 'open' | 'error'
   * @param handler - 消息处理函数
   */
  on(event: 'message', handler: MessageHandler): void;
  on(event: 'open', handler: OpenHandler): void;
  on(event: 'error', handler: ErrorHandler): void;
  on(event: string, handler: any): void {
    if (event === 'message') {
      this.messageHandlers.push(handler);
    } else if (event === 'open') {
      this.openHandlers.push(handler);
    } else if (event === 'error') {
      this.errorHandlers.push(handler);
    }
  }

  /**
   * 获取当前节点的 ID
   */
  getId(): string | null {
    return this.peer.id;
  }

  /**
   * 销毁连接
   */
  destroy(): void {
    if (this.peer) {
      this.peer.destroy();
    }
  }
}
