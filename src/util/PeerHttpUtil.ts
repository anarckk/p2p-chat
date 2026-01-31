/**
 * PeerJS HTTP 封装库 - 五段式消息传递协议 + 去中心化发现中心
 * 五段式协议：
 * 第一段：version_notify（发送方持续重发，每5秒）
 * 第二段：version_request（接收方被动响应）
 * 第三段：version_response（发送方只发一次）
 * 第四段：delivery_ack（接收方被动响应）
 * 第五段：标记已送达（发送方本地操作）
 *
 * 通用五段式协议：
 * 支持多种业务场景：聊天消息、头像传输、用户名传输、设备列表传输
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
  SendingMessageState,
  ReceivingMessageState,
} from '../types';
import { commLog } from './logger';
import { getPeerServerConfig } from '../config/peer';
import {
  FiveStageProtocol,
  BusinessType,
  type FiveStageMessage,
  DEFAULT_FIVE_STAGE_CONFIG,
} from './FiveStageProtocol';

// 五段式协议配置
const FIVE_STAGE_CONFIG = {
  notifyInterval: 5000,        // 第一段重发间隔：5秒
  notifyMaxRetries: 120,       // 第一段最大重试次数：120次（10分钟）
  requestTimeout: 10000,       // 第二段超时：10秒
  responseTimeout: 15000,      // 第三段超时：15秒
  ackTimeout: 5000,            // 第四段超时：5秒
};

export type MessageHandler = (data: { from: string; data: any }) => void;
export type OpenHandler = (id: string) => void;
export type ErrorHandler = (error: any) => void;
export type ProtocolMessageHandler = (protocol: AnyProtocol, from: string) => void;
export type DisconnectedHandler = () => void;
export type CloseHandler = () => void;

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
  private disconnectedHandlers: DisconnectedHandler[] = [];
  private closeHandlers: CloseHandler[] = [];
  private protocolHandlers: Map<string, ProtocolMessageHandler[]> = new Map();

  // 存储每个聊天的版本号和消息（key: peerId, value: version + messages）
  private chatVersions: Map<string, ChatVersion> = new Map();

  // 发现中心：存储已发现的设备
  private discoveredDevices: Map<string, OnlineDevice> = new Map();

  // 网络加速：是否开启网络加速
  private networkAccelerationEnabled: boolean = false;

  // 网络加速：存储待处理的中转请求（用于匹配响应）
  private pendingRelayRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = new Map();

  // 网络加速：存储其他设备的网络加速状态
  private networkAccelerationStatus: Map<string, boolean> = new Map();

  // 网络数据日志记录
  private networkLogEnabled: boolean = false;
  private networkLogger?: (log: {
    timestamp: number;
    direction: 'outgoing' | 'incoming';
    peerId: string;
    protocol: string;
    stage?: string;
    data: unknown;
    dataSize: number;
    status: 'success' | 'error' | 'pending';
    error?: string;
  }) => void;

  // ==================== 通用五段式协议 ====================

  // 通用五段式协议实例
  private fiveStageProtocol: FiveStageProtocol | null = null;

  // ==================== 五段式协议状态管理（聊天消息专用） ====================

  // 发送方状态（key: messageId）
  private sendingStates: Map<string, SendingMessageState> = new Map();

  // 接收方状态（key: peerId_version）
  private receivingStates: Map<string, ReceivingMessageState> = new Map();

  /**
   * 构造函数
   * @param peerId - 当前节点的 ID，如果不提供则自动生成
   * @param options - PeerJS 配置选项
   */
  constructor(peerId: string | null = null, options: any = {}) {
    const peerOptions = { ...getPeerServerConfig(), ...options };
    // 打印当前 peer server 地址
    const serverHost = peerOptions.host || 'PeerJS Cloud (default)';
    const serverPort = peerOptions.port;
    const serverPath = peerOptions.path;
    const serverUrl = serverPort ? `${serverHost}:${serverPort}${serverPath}` : `${serverHost}${serverPath}`;
    console.log('[PeerHttp] Connecting to Peer Server:', serverUrl);
    console.log('[PeerHttp] Peer Server Config:', JSON.stringify({ host: serverHost, port: serverPort, path: serverPath }));
    this.peer = peerId ? new Peer(peerId, peerOptions) : new Peer(peerOptions);

    // 初始化通用五段式协议
    this.fiveStageProtocol = new FiveStageProtocol({
      sendProtocol: (peerId: string, message: FiveStageMessage) => {
        // 将 FiveStageMessage 转换为 AnyProtocol 发送
        return this.sendProtocol(peerId, message as any);
      },
      getMyPeerId: this.getId.bind(this) as () => string,
    });

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

    // 监听断开连接事件
    this.peer.on('disconnected', () => {
      console.warn('[PeerHttp] Peer connection disconnected, will attempt to reconnect...');
      commLog.connection.disconnected();
      this.disconnectedHandlers.forEach((handler) => {
        try {
          handler();
        } catch (err) {
          console.error('[PeerHttp] Disconnected handler error:', err);
        }
      });
    });

    // 监听连接关闭事件
    this.peer.on('close', () => {
      console.warn('[PeerHttp] Peer connection closed');
      commLog.connection.closed();
      this.closeHandlers.forEach((handler) => {
        try {
          handler();
        } catch (err) {
          console.error('[PeerHttp] Close handler error:', err);
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
   * 设置网络数据日志记录器
   */
  setNetworkLogger(
    enabled: boolean,
    logger?: (log: {
      timestamp: number;
      direction: 'outgoing' | 'incoming';
      peerId: string;
      protocol: string;
      stage?: string;
      data: unknown;
      dataSize: number;
      status: 'success' | 'error' | 'pending';
      error?: string;
    }) => void,
  ): void {
    this.networkLogEnabled = enabled;
    this.networkLogger = logger;
  }

  /**
   * 记录网络日志
   */
  private logNetwork(log: {
    direction: 'outgoing' | 'incoming';
    peerId: string;
    protocol: string;
    stage?: string;
    data: unknown;
    status: 'success' | 'error' | 'pending';
    error?: string;
  }): void {
    if (this.networkLogEnabled && this.networkLogger) {
      const dataStr = JSON.stringify(log.data);
      this.networkLogger({
        timestamp: Date.now(),
        direction: log.direction,
        peerId: log.peerId,
        protocol: log.protocol,
        stage: log.stage,
        data: log.data,
        dataSize: new Blob([dataStr]).size,
        status: log.status,
        error: log.error,
      });
    }
  }

  /**
   * 处理协议消息
   */
  private handleProtocolMessage(protocol: AnyProtocol, from: string) {
    const { type } = protocol;

    // 记录接收日志
    this.logNetwork({
      direction: 'incoming',
      peerId: from,
      protocol: type,
      data: protocol,
      status: 'success',
    });

    // 检查是否是通用五段式协议消息
    const protocolType = type as string;
    if (protocolType === 'five_stage_notify' ||
        protocolType === 'five_stage_request' ||
        protocolType === 'five_stage_response' ||
        protocolType === 'five_stage_ack') {
      // 通用五段式协议消息
      if (this.fiveStageProtocol) {
        this.fiveStageProtocol.handleMessage(protocol as unknown as FiveStageMessage, from);
      }
      return;
    }

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
      case 'user_info_update' as any:
        // 用户信息更新通知
        this.handleUserInfoUpdate(protocol as any, from);
        break;
      case 'relay_message':
        // 网络加速：请求中转消息
        this.handleRelayMessage(protocol as any, from);
        break;
      case 'relay_response':
        // 网络加速：中转响应
        this.handleRelayResponse(protocol as any, from);
        break;
      case 'network_acceleration_status':
        // 网络加速：状态同步
        this.handleNetworkAccelerationStatus(protocol as any, from);
        break;
      case 'device_list_request':
        // 设备互相发现：请求设备列表
        this.handleDeviceListRequest(from);
        break;
      case 'device_list_response':
        // 设备互相发现：响应设备列表
        this.handleDeviceListResponse(protocol as any);
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
   * 第一段接收：处理版本号通知
   * 接收方判断是否需要更新，需要则发送第二段请求
   */
  private handleVersionNotify(protocol: { messageId: string; version: number; msgType: MessageType; retryCount: number }, from: string) {
    const { messageId, version, msgType, retryCount } = protocol;
    const myChat = this.getOrCreateChatVersion(from);

    console.log('[PeerHttp] [Stage 1] Received notify #' + retryCount + ': from=' + from + ', theirV=' + version + ', myV=' + myChat.version + ', msgId=' + messageId);

    // 检查是否需要更新
    if (version <= myChat.version) {
      // 不需要更新，可能是重复通知或已送达的旧消息
      console.log('[PeerHttp] [Stage 1] Version not newer, ignoring');
      // 如果有最后一条消息，发送ACK确认已收到
      const lastMsg = myChat.messages[myChat.messages.length - 1];
      if (lastMsg) {
        console.log('[PeerHttp] [Stage 1] Sending ACK for last message: ' + lastMsg.id);
        this.sendDeliveryAck(from, lastMsg.id, version);
      }
      return;
    }

    // 检查是否已发送过请求（避免重复请求）
    const stateKey = `${from}_${version}`;
    const existingState = this.receivingStates.get(stateKey);

    if (existingState) {
      // 已发送过请求，等待响应
      console.log('[PeerHttp] [Stage 1] Already requested v=' + version + ', waiting for response');
      return;
    }

    // 创建接收方状态
    const state: ReceivingMessageState = {
      version,
      peerId: from,
      stage: 'requested',
      notifiedAt: Date.now(),
      requestedAt: Date.now(),
    };
    this.receivingStates.set(stateKey, state);

    // 发送第二段：版本请求
    console.log('[PeerHttp] [Stage 1] Sending request for version=' + version);
    this.sendVersionRequest(from, messageId, version);
  }

  /**
   * 第二段接收：处理版本请求
   * 发送方收到请求后，发送第三段消息体（只发一次）
   */
  private handleVersionRequest(protocol: { messageId: string; version: number }, from: string) {
    const { messageId, version } = protocol;

    // 查找发送方状态
    const state = this.sendingStates.get(messageId);

    if (!state) {
      console.warn('[PeerHttp] [Stage 2] Request for unknown message: ' + messageId);
      return;
    }

    console.log('[PeerHttp] [Stage 2] Received request for msgId=' + messageId + ', v=' + version);

    // 更新状态
    state.stage = 'requested';
    state.requestedAt = Date.now();

    // 查找消息
    const myChat = this.getOrCreateChatVersion(from);
    const message = myChat.messages[version - 1];

    if (message) {
      // 发送第三段：消息响应（只发一次）
      console.log('[PeerHttp] [Stage 2] Sending response for msgId=' + messageId);
      this.sendVersionResponse(from, state, message);
    } else {
      console.error('[PeerHttp] [Stage 2] Message not found for version: ' + version);
    }
  }

  /**
   * 第三段接收：处理版本响应
   * 接收方收到消息体后，发送第四段ACK确认
   */
  private handleVersionResponse(protocol: { version: number; message: ChatMessage; responseTime: number }, from: string) {
    const { version, message, responseTime } = protocol;
    const myChat = this.getOrCreateChatVersion(from);
    const stateKey = `${from}_${version}`;
    const state = this.receivingStates.get(stateKey);

    console.log('[PeerHttp] [Stage 3] Received response: from=' + from + ', v=' + version + ', msgId=' + message.id);

    // 检查版本是否已处理
    if (version <= myChat.version) {
      console.log('[PeerHttp] [Stage 3] Version already processed, ignoring');
      return;
    }

    // 更新接收方状态
    if (state) {
      state.stage = 'received';
      state.receivedAt = Date.now();
    }

    // 更新版本号并存储消息
    myChat.version = version;
    myChat.messages.push(message);

    commLog.message.received({ from, msgType: message.type, messageId: message.id });

    // 发送第四段：送达确认
    console.log('[PeerHttp] [Stage 3] Sending ACK for msgId=' + message.id);
    this.sendDeliveryAck(from, message.id, version);

    // 清理接收方状态
    if (state) {
      state.stage = 'acked';
      state.ackedAt = Date.now();
      this.receivingStates.delete(stateKey);
    }

    // 触发消息处理器
    console.log('[PeerHttp] [Stage 3] Triggering message handlers: msgId=' + message.id);
    this.messageHandlers.forEach((handler) => {
      try {
        handler({ from, data: message });
      } catch (err) {
        console.error('[PeerHttp] Handler error:', err);
      }
    });
  }

  /**
   * 第四段接收：处理送达确认
   * 发送方收到ACK后，执行第五段：标记消息已送达
   */
  private handleDeliveryAck(protocol: { messageId: string; version: number; ackTime: number }) {
    const { messageId, version, ackTime } = protocol;

    // 查找发送方状态
    const state = this.sendingStates.get(messageId);

    if (!state) {
      console.warn('[PeerHttp] [Stage 4] ACK for unknown message: ' + messageId);
      return;
    }

    console.log('[PeerHttp] [Stage 4] Received ACK for msgId=' + messageId + ', v=' + version);

    // 第五段：标记消息已送达
    state.stage = 'acked';
    state.ackedAt = Date.now();

    // 清理定时器
    if (state.notifyTimer) {
      clearInterval(state.notifyTimer);
    }

    // 删除状态
    this.sendingStates.delete(messageId);

    console.log('[PeerHttp] [Stage 5] Message delivered: msgId=' + messageId);

    // 触发送达确认事件
    this.emitProtocol('delivery_ack', { type: 'delivery_ack', from: state.peerId, to: this.getId()!, timestamp: ackTime, messageId, version } as any);
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

    // 如果有设备列表，合并到已发现的设备列表
    if (devices) {
      devices.forEach((device) => {
        this.discoveredDevices.set(device.peerId, device);
      });
    }

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
    this.emitProtocol('username_query', { type: 'username_query', from } as any);
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

    // 记录发送日志
    this.logNetwork({
      direction: 'outgoing',
      peerId: peerId,
      protocol: protocol.type,
      data: protocol,
      status: 'pending',
    });

    return new Promise((resolve, reject) => {
      try {
        const conn = this.peer.connect(peerId);
        const timeout = setTimeout(() => {
          console.error('[PeerHttp] Connection timeout for:', peerId);

          // 更新发送日志状态为错误
          this.logNetwork({
            direction: 'outgoing',
            peerId: peerId,
            protocol: protocol.type,
            data: protocol,
            status: 'error',
            error: 'Connection timeout',
          });

          conn.close();
          reject(new Error('Connection timeout'));
        }, 20000); // 增加到 20 秒，给予更多时间建立连接

        conn.on('open', () => {
          console.log('[PeerHttp] Connection opened to:', peerId);
          try {
            conn.send(protocol);
            console.log('[PeerHttp] Protocol sent successfully');

            // 更新发送日志状态为成功
            this.logNetwork({
              direction: 'outgoing',
              peerId: peerId,
              protocol: protocol.type,
              data: protocol,
              status: 'success',
            });

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

            // 更新发送日志状态为错误
            this.logNetwork({
              direction: 'outgoing',
              peerId: peerId,
              protocol: protocol.type,
              data: protocol,
              status: 'error',
              error: String(err),
            });

            reject(err);
          }
        });
        conn.on('error', (err: any) => {
          console.error('[PeerHttp] Connection error:', err);
          clearTimeout(timeout);

          // 更新发送日志状态为错误
          this.logNetwork({
            direction: 'outgoing',
            peerId: peerId,
            protocol: protocol.type,
            data: protocol,
            status: 'error',
            error: String(err),
          });

          reject(err);
        });
      } catch (error: any) {
        console.error('[PeerHttp] Error creating connection:', error);
        reject(error);
      }
    });
  }

  // ==================== 五段式协议辅助方法 ====================

  /**
   * 第一段发送：发送版本通知（持续重发）
   * @param peerId - 目标节点的 ID
   * @param state - 发送方状态
   */
  private sendVersionNotify(peerId: string, state: SendingMessageState) {
    state.notifyCount++;
    console.log('[PeerHttp] [Stage 1] Sending notify #' + state.notifyCount + ': msgId=' + state.messageId + ', v=' + state.version);

    this.sendProtocol(peerId, {
      type: 'version_notify',
      from: this.getId()!,
      to: peerId,
      timestamp: Date.now(),
      messageId: state.messageId,
      version: state.version,
      msgType: 'text',
      retryCount: state.notifyCount,
    } as any).catch((err) => {
      console.error('[PeerHttp] [Stage 1] Notify failed:', err);
      // 失败不影响重发，定时器会继续
    });
  }

  /**
   * 第二段发送：发送版本请求（接收方被动响应）
   * @param peerId - 目标节点的 ID
   * @param messageId - 消息唯一标识
   * @param version - 请求的版本号
   */
  private sendVersionRequest(peerId: string, messageId: string, version: number) {
    console.log('[PeerHttp] [Stage 2] Sending request: msgId=' + messageId + ', v=' + version);

    this.sendProtocol(peerId, {
      type: 'version_request',
      from: this.getId()!,
      to: peerId,
      timestamp: Date.now(),
      messageId,
      version,
    } as any).catch((err) => {
      console.error('[PeerHttp] [Stage 2] Request failed:', err);
      // 失败后等待下一个notify重试
    });
  }

  /**
   * 第三段发送：发送消息响应（发送方只发一次）
   * @param peerId - 目标节点的 ID
   * @param state - 发送方状态
   * @param message - 消息对象
   */
  private sendVersionResponse(peerId: string, state: SendingMessageState, message: ChatMessage) {
    state.stage = 'delivering';
    state.respondCount++;
    state.deliveredAt = Date.now();

    console.log('[PeerHttp] [Stage 3] Sending response #' + state.respondCount + ': msgId=' + state.messageId);

    this.sendProtocol(peerId, {
      type: 'version_response',
      from: this.getId()!,
      to: peerId,
      timestamp: Date.now(),
      version: state.version,
      message,
      responseTime: Date.now(),
    } as any).catch((err) => {
      console.error('[PeerHttp] [Stage 3] Response failed:', err);
      // 不重发，等对端重发请求
    });
  }

  /**
   * 第四段发送：发送送达确认（接收方被动响应）
   * @param peerId - 目标节点的 ID
   * @param messageId - 消息唯一标识
   * @param version - 版本号
   */
  private sendDeliveryAck(peerId: string, messageId: string, version: number) {
    console.log('[PeerHttp] [Stage 4] Sending ACK: msgId=' + messageId + ', v=' + version);

    this.sendProtocol(peerId, {
      type: 'delivery_ack',
      from: this.getId()!,
      to: peerId,
      timestamp: Date.now(),
      messageId,
      version,
      ackTime: Date.now(),
    } as any).catch((err) => {
      console.error('[PeerHttp] [Stage 4] ACK failed:', err);
      // 失败后等待对端重发notify，然后重发ACK
    });
  }

  /**
   * 发送消息（五段式协议）
   * 第一段：持续重发版本通知（每5秒）
   * 后续段：被动响应
   * @param peerId - 目标节点的 ID
   * @param messageId - 消息唯一标识
   * @param content - 消息内容
   * @param type - 消息类型
   */
  send(
    peerId: string,
    messageId: string,
    content: MessageContent,
    type: MessageType = 'text',
  ): Promise<{ peerId: string; messageId: string; sent: boolean; stage: 'notifying' }> {
    console.log('[PeerHttp] [Five-Stage] Starting send: peerId=' + peerId + ', msgId=' + messageId + ', type=' + type);

    // 获取或创建聊天版本记录
    const myChat = this.getOrCreateChatVersion(peerId);
    myChat.version++;

    // 创建消息对象
    const chatMessage: ChatMessage = {
      id: messageId,
      from: this.getId()!,
      to: peerId,
      content,
      timestamp: Date.now(),
      status: 'sending',
      type,
    };
    myChat.messages.push(chatMessage);
    console.log('[PeerHttp] [Five-Stage] Stored message with version: ' + myChat.version);

    // 创建发送方状态
    const state: SendingMessageState = {
      messageId,
      version: myChat.version,
      peerId,
      stage: 'notifying',
      notifyCount: 0,
      respondCount: 0,
      notifiedAt: Date.now(),
    };
    this.sendingStates.set(messageId, state);

    // 立即发送第一次通知
    this.sendVersionNotify(peerId, state);

    // 启动定时重发（每5秒重发第一段）
    state.notifyTimer = setInterval(() => {
      const currentState = this.sendingStates.get(messageId);
      if (currentState && currentState.stage === 'notifying') {
        currentState.notifyCount++;
        if (currentState.notifyCount <= FIVE_STAGE_CONFIG.notifyMaxRetries) {
          console.log('[PeerHttp] [Five-Stage] Retrying notify #' + currentState.notifyCount + ' for msgId=' + messageId);
          this.sendVersionNotify(peerId, currentState);
        } else {
          // 超过最大重试次数，停止重发
          console.warn('[PeerHttp] [Five-Stage] Max retries reached for msgId=' + messageId);
          clearInterval(currentState.notifyTimer!);
        }
      } else {
        // 已进入后续阶段，停止重发
        const timer = this.sendingStates.get(messageId)?.notifyTimer;
        if (timer) {
          clearInterval(timer);
        }
      }
    }, FIVE_STAGE_CONFIG.notifyInterval);

    return Promise.resolve({ peerId, messageId, sent: true, stage: 'notifying' });
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
  async sendDiscoveryNotification(peerId: string, username: string, avatar: string | null, profileVersion: number) {
    try {
      await this.sendProtocol(peerId, {
        type: 'discovery_notification',
        from: this.getId()!,
        to: peerId,
        timestamp: Date.now(),
        fromUsername: username,
        fromAvatar: avatar,
        profileVersion,
      });
    } catch (err) {
      console.error('[PeerHttp] Failed to send discovery notification:', err);
    }
  }

  /**
   * 发现中心：发送发现响应（包含用户信息）
   */
  async sendDiscoveryResponse(peerId: string, username: string, avatar: string | null) {
    try {
      await this.sendProtocol(peerId, {
        type: 'discovery_response',
        from: this.getId()!,
        to: peerId,
        timestamp: Date.now(),
        username,
        avatar,
      });
    } catch (err) {
      console.error('[PeerHttp] Failed to send discovery response:', err);
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
    this.emitProtocol('online_check_query', {
      from,
      userInfoVersion: protocol.userInfoVersion,
      type: 'online_check_query'
    } as any);
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
   * 处理用户信息更新通知（主动推送）
   */
  private handleUserInfoUpdate(
    protocol: { username: string; avatar: string | null; version: number },
    from: string,
  ) {
    console.log('[PeerHttp] Received user info update from:', from, 'username:', protocol.username, 'version:', protocol.version);

    // 更新已发现的设备信息
    const existing = this.discoveredDevices.get(from);

    if (existing) {
      // 只在版本号更新时才更新（避免回退）
      if (!existing.userInfoVersion || protocol.version > existing.userInfoVersion) {
        existing.username = protocol.username;
        existing.avatar = protocol.avatar;
        existing.userInfoVersion = protocol.version;
        existing.lastHeartbeat = Date.now();

        console.log('[PeerHttp] Updated user info from:', from, 'new username:', protocol.username);

        commLog.sync.updateInfo({
          peerId: from,
          username: protocol.username,
          version: protocol.version,
        });
      } else {
        console.log('[PeerHttp] Ignoring outdated user info update from:', from, 'their version:', protocol.version, 'our version:', existing.userInfoVersion);
      }
    } else {
      // 如果设备不存在，添加到已发现列表
      this.discoveredDevices.set(from, {
        peerId: from,
        username: protocol.username,
        avatar: protocol.avatar,
        userInfoVersion: protocol.version,
        lastHeartbeat: Date.now(),
        firstDiscovered: Date.now(),
        isOnline: true,
      });

      console.log('[PeerHttp] Added new device from user info update:', from);
    }

    // 触发用户信息更新事件
    this.emitProtocol('user_info_update' as any, {
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
   * @param event - 支持 'message' | 'open' | 'error' | 'disconnected' | 'close'
   * @param handler - 消息处理函数
   */
  on(event: 'message', handler: MessageHandler): void;
  on(event: 'open', handler: OpenHandler): void;
  on(event: 'error', handler: ErrorHandler): void;
  on(event: 'disconnected', handler: DisconnectedHandler): void;
  on(event: 'close', handler: CloseHandler): void;
  on(event: string, handler: any): void {
    if (event === 'message') {
      this.messageHandlers.push(handler);
    } else if (event === 'open') {
      this.openHandlers.push(handler);
    } else if (event === 'error') {
      this.errorHandlers.push(handler);
    } else if (event === 'disconnected') {
      this.disconnectedHandlers.push(handler);
    } else if (event === 'close') {
      this.closeHandlers.push(handler);
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
    // 销毁通用五段式协议
    if (this.fiveStageProtocol) {
      this.fiveStageProtocol.destroy();
      this.fiveStageProtocol = null;
    }

    if (this.peer) {
      this.peer.destroy();
    }
  }

  // ==================== 通用五段式协议公共方法 ====================

  /**
   * 获取通用五段式协议实例
   */
  getFiveStageProtocol(): FiveStageProtocol | null {
    return this.fiveStageProtocol;
  }

  /**
   * 注册通用五段式协议处理器
   * @param businessType - 业务类型
   * @param handler - 处理器对象
   */
  registerFiveStageHandler(businessType: BusinessType, handler: import('./FiveStageProtocol').FiveStageHandler): void {
    if (this.fiveStageProtocol) {
      this.fiveStageProtocol.registerHandler(businessType, handler);
    }
  }

  /**
   * 注销通用五段式协议处理器
   * @param businessType - 业务类型
   */
  unregisterFiveStageHandler(businessType: BusinessType): void {
    if (this.fiveStageProtocol) {
      this.fiveStageProtocol.unregisterHandler(businessType);
    }
  }

  /**
   * 使用通用五段式协议发送数据
   * @param peerId - 目标PeerId
   * @param businessType - 业务类型
   * @param dataIdGenerator - 数据ID生成器
   * @param data - 要发送的数据
   */
  async sendWithFiveStage<T>(
    peerId: string,
    businessType: BusinessType,
    dataIdGenerator: import('./FiveStageProtocol').DataIdGenerator<T>,
    data: T,
  ): Promise<{ dataId: string; version: number; sent: boolean; stage: 'notifying' } | null> {
    if (!this.fiveStageProtocol) {
      console.error('[PeerHttp] FiveStageProtocol not initialized');
      return null;
    }

    return await this.fiveStageProtocol.send(peerId, businessType, dataIdGenerator, data);
  }

  // ==================== 网络加速协议 ====================

  /**
   * 处理中转消息请求
   */
  private handleRelayMessage(protocol: {
    originalFrom: string;
    targetPeerId: string;
    payload: AnyProtocol;
    sequenceId: string;
  }, from: string) {
    commLog.networkAcceleration.relayRequest({ from, target: protocol.targetPeerId, sequenceId: protocol.sequenceId });

    // 检查是否开启网络加速
    if (!this.networkAccelerationEnabled) {
      // 拒绝中转
      this.sendProtocol(from, {
        type: 'relay_response',
        from: this.getId()!,
        to: from,
        timestamp: Date.now(),
        originalFrom: protocol.originalFrom,
        targetPeerId: protocol.targetPeerId,
        payload: null,
        success: false,
        errorMessage: 'Network acceleration is disabled',
        sequenceId: protocol.sequenceId,
      });
      return;
    }

    // 检查目标是否是本设备
    if (protocol.targetPeerId === this.getId()!) {
      // 消息是给本设备的，直接处理
      this.handleProtocolMessage(protocol.payload, protocol.originalFrom);
    } else {
      // 转发给目标设备
      this.sendProtocol(protocol.targetPeerId, protocol.payload)
        .then(() => {
          // 转发成功，返回响应
          this.sendProtocol(from, {
            type: 'relay_response',
            from: this.getId()!,
            to: from,
            timestamp: Date.now(),
            originalFrom: protocol.originalFrom,
            targetPeerId: protocol.targetPeerId,
            payload: null,
            success: true,
            sequenceId: protocol.sequenceId,
          });
        })
        .catch((err) => {
          // 转发失败，返回错误响应
          this.sendProtocol(from, {
            type: 'relay_response',
            from: this.getId()!,
            to: from,
            timestamp: Date.now(),
            originalFrom: protocol.originalFrom,
            targetPeerId: protocol.targetPeerId,
            payload: null,
            success: false,
            errorMessage: String(err),
            sequenceId: protocol.sequenceId,
          });
        });
    }
  }

  /**
   * 处理中转响应
   */
  private handleRelayResponse(protocol: {
    originalFrom: string;
    targetPeerId: string;
    payload: AnyProtocol | null;
    success: boolean;
    errorMessage?: string;
    sequenceId: string;
  }, from: string) {
    commLog.networkAcceleration.relayResponse({ from, sequenceId: protocol.sequenceId, success: protocol.success });

    // 查找并解决对应的 Promise
    const pending = this.pendingRelayRequests.get(protocol.sequenceId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRelayRequests.delete(protocol.sequenceId);

      if (protocol.success) {
        pending.resolve(protocol.payload);
      } else {
        pending.reject(new Error(protocol.errorMessage || 'Relay failed'));
      }
    }
  }

  /**
   * 处理网络加速状态同步
   */
  private handleNetworkAccelerationStatus(protocol: { enabled: boolean }, from: string) {
    console.log('[PeerHttp] Network acceleration status from ' + from + ': ' + protocol.enabled);
    // 存储对方的网络加速状态
    this.networkAccelerationStatus.set(from, protocol.enabled);

    // 触发事件，让外部知道状态更新
    this.emitProtocol('network_acceleration_status', {
      ...protocol,
      from,
    } as any);
  }

  /**
   * 设置网络加速开关状态
   */
  setNetworkAccelerationEnabled(enabled: boolean): void {
    this.networkAccelerationEnabled = enabled;
    console.log('[PeerHttp] Network acceleration ' + (enabled ? 'enabled' : 'disabled'));
  }

  /**
   * 获取网络加速开关状态
   */
  getNetworkAccelerationEnabled(): boolean {
    return this.networkAccelerationEnabled;
  }

  /**
   * 获取设备的网络加速状态
   */
  getDeviceNetworkAccelerationStatus(peerId: string): boolean | undefined {
    return this.networkAccelerationStatus.get(peerId);
  }

  /**
   * 发送网络加速状态给指定设备
   */
  async sendNetworkAccelerationStatus(peerId: string): Promise<void> {
    await this.sendProtocol(peerId, {
      type: 'network_acceleration_status',
      from: this.getId()!,
      to: peerId,
      timestamp: Date.now(),
      enabled: this.networkAccelerationEnabled,
    });
  }

  /**
   * 发送用户信息更新通知
   * @param peerId - 接收方的 PeerId
   * @param username - 用户名
   * @param avatar - 头像（base64）
   * @param version - 个人信息版本号
   */
  async sendUserInfoUpdate(peerId: string, username: string, avatar: string | null, version: number): Promise<void> {
    await this.sendProtocol(peerId, {
      type: 'user_info_update' as any,
      from: this.getId()!,
      to: peerId,
      timestamp: Date.now(),
      username,
      avatar,
      version,
    } as any);
  }

  /**
   * 通过中转设备发送消息
   * @param relayPeerId - 中转设备的 PeerId
   * @param targetPeerId - 目标设备的 PeerId
   * @param protocol - 要发送的协议消息
   */
  async sendViaRelay(
    relayPeerId: string,
    targetPeerId: string,
    protocol: AnyProtocol,
  ): Promise<AnyProtocol | null> {
    const sequenceId = this.getId()! + '-' + Date.now() + '-' + Math.random().toString(36).substring(7);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRelayRequests.delete(sequenceId);
        reject(new Error('Relay timeout'));
      }, 15000);

      this.pendingRelayRequests.set(sequenceId, { resolve, reject, timeout });

      // 发送中转请求
      this.sendProtocol(relayPeerId, {
        type: 'relay_message',
        from: this.getId()!,
        to: relayPeerId,
        timestamp: Date.now(),
        originalFrom: this.getId()!,
        targetPeerId,
        payload: protocol,
        sequenceId,
      }).catch((err) => {
        clearTimeout(timeout);
        this.pendingRelayRequests.delete(sequenceId);
        reject(err);
      });
    });
  }

  /**
   * 获取所有开启网络加速的设备
   */
  getNetworkAccelerationEnabledDevices(): string[] {
    return Array.from(this.networkAccelerationStatus.entries())
      .filter(([_, enabled]) => enabled)
      .map(([peerId, _]) => peerId);
  }

  // ==================== 设备互相发现协议 ====================

  /**
   * 处理设备列表请求
   */
  private handleDeviceListRequest(from: string) {
    commLog.deviceDiscovery.requestReceived({ from });
    // 响应我已发现的设备列表
    const devices = Array.from(this.discoveredDevices.values());

    this.sendProtocol(from, {
      type: 'device_list_response',
      from: this.getId()!,
      to: from,
      timestamp: Date.now(),
      devices,
    });
  }

  /**
   * 处理设备列表响应
   */
  private handleDeviceListResponse(protocol: any) {
    const { devices, isBootstrap, realPeerId } = protocol;
    commLog.deviceDiscovery.responseReceived({ deviceCount: devices.length });

    let newDeviceCount = 0;
    // 合并到已发现的设备列表
    devices.forEach((device: OnlineDevice) => {
      const existing = this.discoveredDevices.get(device.peerId);
      if (!existing) {
        newDeviceCount++;
      }
      this.discoveredDevices.set(device.peerId, {
        ...device,
        firstDiscovered: existing?.firstDiscovered || device.firstDiscovered || Date.now(),
      });
    });

    // 如果响应者是宇宙启动者，添加启动者设备（使用真实 PeerID）
    if (isBootstrap && realPeerId) {
      console.log('[PeerHttp] Bootstrap device has real PeerID:', realPeerId);
      const bootstrapDevice: OnlineDevice = {
        peerId: realPeerId, // 使用真实 PeerID 作为显示 ID
        username: '宇宙启动者',
        avatar: null,
        lastHeartbeat: Date.now(),
        firstDiscovered: Date.now(),
        isOnline: true,
        isBootstrap: true,
        realPeerId: protocol.from, // 记录固定 ID
      };
      this.discoveredDevices.set(realPeerId, bootstrapDevice);
      newDeviceCount++;
    }

    if (newDeviceCount > 0) {
      console.log('[PeerHttp] Discovered ' + newDeviceCount + ' new devices from peer list');
    }

    // 触发设备列表响应事件
    this.emitProtocol('device_list_response', protocol);
  }

  /**
   * 请求指定设备的在线设备列表
   * @param peerId - 目标设备的 PeerId
   */
  async requestDeviceList(peerId: string): Promise<OnlineDevice[]> {
    return new Promise((resolve) => {
      // 设置一次性处理器
      const handler = (protocol: AnyProtocol) => {
        if (protocol.type === 'device_list_response') {
          const resp = protocol as any;
          resolve(resp.devices || []);

          // 清理处理器
          const handlers = this.protocolHandlers.get('device_list_response') || [];
          const index = handlers.indexOf(handler);
          if (index > -1) {
            handlers.splice(index, 1);
          }
        }
      };

      this.onProtocol('device_list_response', handler as any);

      // 发送请求
      this.sendProtocol(peerId, {
        type: 'device_list_request',
        from: this.getId()!,
        to: peerId,
        timestamp: Date.now(),
      }).catch(() => resolve([]));

      // 超时处理
      setTimeout(() => {
        const handlers = this.protocolHandlers.get('device_list_response') || [];
        const index = handlers.indexOf(handler as any);
        if (index > -1) {
          handlers.splice(index, 1);
        }
        resolve([]);
      }, 10000);
    });
  }

  /**
   * 向所有已知设备请求设备列表
   */
  async requestAllDeviceLists(): Promise<void> {
    const devices = Array.from(this.discoveredDevices.keys());
    console.log('[PeerHttp] Requesting device lists from ' + devices.length + ' devices');

    const promises = devices.map((peerId) => this.requestDeviceList(peerId));
    await Promise.allSettled(promises);
  }

  /**
   * 响应设备列表请求
   */
  async sendDeviceListResponse(peerId: string, devices: OnlineDevice[]): Promise<void> {
    const protocol: any = {
      type: 'device_list_response',
      from: this.getId()!,
      to: peerId,
      timestamp: Date.now(),
      devices,
    };
    await this.sendProtocol(peerId, protocol);
  }
}
