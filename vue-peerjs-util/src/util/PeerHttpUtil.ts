/**
 * PeerJS HTTP 封装库 - 三段式通信协议 + 去中心化发现中心
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

export type MessageHandler = (data: { from: string; data: any }) => void;
export type OpenHandler = (id: string) => void;
export type ErrorHandler = (error: any) => void;
export type ProtocolMessageHandler = (protocol: AnyProtocol, from: string) => void;

// 临时存储待发送的消息内容（用于三段式通信的第三段）
interface PendingMessageContent {
  content: MessageContent;
  type: MessageType;
}

export class PeerHttpUtil {
  private peer: any;
  private messageHandlers: MessageHandler[] = [];
  private openHandlers: OpenHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private protocolHandlers: Map<string, ProtocolMessageHandler[]> = new Map();

  // 存储待发送的消息内容（key: messageId, value: content + type）
  private pendingMessageContents: Map<string, PendingMessageContent> = new Map();

  // 存储已收到的消息ID（用于去重）
  private receivedMessageIds: Set<string> = new Set();

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
      conn.on('data', (data: any) => {
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
      case 'message_id':
        // 一段：收到消息ID，检查是否已处理
        this.handleMessageId(protocol as any, from);
        break;
      case 'request_content':
        // 二段：对端请求消息内容
        this.handleRequestContent(protocol as any, from);
        break;
      case 'message_content':
        // 三段：收到消息内容
        this.handleMessageContent(protocol as any, from);
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
        this.handleOnlineCheckQuery(from);
        break;
      case 'online_check_response':
        // 在线检查：响应在线状态
        this.handleOnlineCheckResponse(protocol as any, from);
        break;
    }
  }

  /**
   * 一段：处理消息ID
   */
  private handleMessageId(
    protocol: { messageId: string; msgType: MessageType; to: string },
    from: string,
  ) {
    const { messageId } = protocol;

    // 检查是否已处理过此消息
    if (this.receivedMessageIds.has(messageId)) {
      // 已处理过，直接发送送达确认
      this.sendDeliveryAck(from, messageId);
      return;
    }

    // 未处理过，向发送方请求消息内容
    this.sendProtocol(from, {
      type: 'request_content',
      from: this.getId()!,
      to: from,
      timestamp: Date.now(),
      messageId,
    });
  }

  /**
   * 二段：处理消息内容请求
   */
  private handleRequestContent(
    protocol: { messageId: string; from: string },
    _to: string,
  ) {
    const { messageId, from: requestFrom } = protocol;

    // 查找待发送的消息内容
    const pending = this.pendingMessageContents.get(messageId);
    if (pending) {
      // 发送消息内容给对端
      this.sendProtocol(requestFrom, {
        type: 'message_content',
        from: this.getId()!,
        to: requestFrom,
        timestamp: Date.now(),
        messageId,
        content: pending.content,
        msgType: pending.type,
      });
    } else {
      console.warn('[PeerHttp] Message content not found for:', messageId);
    }
  }

  /**
   * 三段：处理消息内容
   */
  private handleMessageContent(
    protocol: { messageId: string; content: MessageContent; msgType: MessageType; from: string },
    _from: string,
  ) {
    const { messageId, content, msgType, from: sender } = protocol;

    console.log('[PeerHttp] Received message content:', { messageId, sender, msgType });

    // 标记消息已处理
    this.receivedMessageIds.add(messageId);

    // 发送送达确认
    this.sendDeliveryAck(sender, messageId);

    // 触发消息处理器
    const chatMessage: ChatMessage = {
      id: messageId,
      from: sender,
      to: this.getId()!,
      content,
      timestamp: Date.now(),
      status: 'delivered',
      type: msgType,
      deliveredAt: Date.now(),
    };

    console.log('[PeerHttp] Triggering message handlers with chatMessage:', chatMessage);

    this.messageHandlers.forEach((handler) => {
      try {
        handler({ from: sender, data: chatMessage });
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

    // 清理已送达的消息内容
    this.pendingMessageContents.delete(messageId);

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
    // 将对端添加到已发现的设备列表
    this.discoveredDevices.set(from, {
      peerId: from,
      username: protocol.fromUsername,
      avatar: protocol.fromAvatar,
      lastHeartbeat: Date.now(),
      firstDiscovered: Date.now(),
      isOnline: true,
    });

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
   * 三段式发送消息
   * @param peerId - 目标节点的 ID
   * @param messageId - 消息唯一标识
   * @param content - 消息内容
   * @param type - 消息类型
   * @param isRetry - 是否为重试（重试时只发送消息ID，不重新存储内容）
   */
  send(
    peerId: string,
    messageId: string,
    content: MessageContent,
    type: MessageType = 'text',
    isRetry: boolean = false,
  ): Promise<{ peerId: string; messageId: string; sent: boolean; stage: 'id_sent' | 'content_requested' | 'delivered' }> {
    console.log('[PeerHttp] Starting three-stage send:', { peerId, messageId, type, isRetry });

    // 只有非重试时才存储消息内容
    if (!isRetry) {
      this.pendingMessageContents.set(messageId, { content, type });
      console.log('[PeerHttp] Stored message content for:', messageId);
    } else {
      console.log('[PeerHttp] Retry mode: resending messageId only (content already stored)');
    }

    // 一段：发送消息ID给对端
    return new Promise((resolve, reject) => {
      this.sendProtocol(peerId, {
        type: 'message_id',
        from: this.getId()!,
        to: peerId,
        timestamp: Date.now(),
        messageId,
        msgType: type,
      })
        .then(() => {
          console.log('[PeerHttp] Stage 1 complete: messageId sent');
          resolve({ peerId, messageId, sent: true, stage: 'id_sent' });
        })
        .catch((err) => {
          console.error('[PeerHttp] Stage 1 failed:', err);
          if (!isRetry) {
            this.pendingMessageContents.delete(messageId);
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
  private handleOnlineCheckQuery(from: string) {
    // 需要获取当前用户信息来响应，通过事件传递出去
    this.emitProtocol('online_check_query', { from } as any);
  }

  /**
   * 处理在线检查响应
   */
  private handleOnlineCheckResponse(
    protocol: { isOnline: boolean; username: string; avatar: string | null },
    from: string,
  ) {
    // 更新设备的在线状态和心跳时间
    const existing = this.discoveredDevices.get(from);
    if (existing) {
      existing.lastHeartbeat = Date.now();
      existing.isOnline = protocol.isOnline;
      existing.username = protocol.username;
      existing.avatar = protocol.avatar;
    }

    // 触发在线检查响应事件
    this.emitProtocol('online_check_response', {
      ...protocol,
      from,
    } as any);
  }

  /**
   * 在线检查：查询指定设备是否在线
   * @param peerId - 目标节点的 ID
   * @param username - 当前用户名（用于响应）
   * @param avatar - 当前头像（用于响应）
   */
  async checkOnline(
    peerId: string,
    username: string,
    avatar: string | null,
  ): Promise<{ isOnline: boolean; username: string; avatar: string | null } | null> {
    return new Promise((resolve) => {
      // 设置一次性处理器
      const handler = (protocol: AnyProtocol, from: string) => {
        if (protocol.type === 'online_check_response' && from === peerId) {
          const resp = protocol as any;
          resolve({
            isOnline: resp.isOnline,
            username: resp.username,
            avatar: resp.avatar,
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

      // 发送查询
      this.sendProtocol(peerId, {
        type: 'online_check_query',
        from: this.getId()!,
        to: peerId,
        timestamp: Date.now(),
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
   */
  async respondOnlineCheck(peerId: string, username: string, avatar: string | null) {
    try {
      await this.sendProtocol(peerId, {
        type: 'online_check_response',
        from: this.getId()!,
        to: peerId,
        timestamp: Date.now(),
        isOnline: true,
        username,
        avatar,
      });
    } catch (err) {
      console.error('[PeerHttp] Failed to send online check response:', err);
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
