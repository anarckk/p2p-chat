/**
 * PeerJS HTTP 封装库 - Request-Response 协议 + 去中心化发现中心
 *
 * 从五段式协议迁移到 Request-Response (RR) 协议架构：
 * - 发送请求并等待响应（支持超时）
 * - 注册请求处理器
 * - 处理接收到的请求和响应
 * - 连接管理（发送 request 后等待 response，收到后关闭 conn）
 */
import Peer from 'peerjs';
import type {
  AnyProtocol,
  ChatMessage,
  MessageType,
  MessageContent,
  OnlineDevice,
  DiscoveryResponseProtocol,
} from '../types';
import type {
  AnyRRRequest,
  AnyRRResponse,
  ChatMessageRequest,
  ChatMessageResponse,
  OnlineCheckRequest,
  OnlineCheckResponse,
  DiscoveryNotificationRequest,
  DiscoveryNotificationResponse,
  DeviceListRequest,
  DeviceListResponse,
  UserInfoRequest,
  UserInfoResponse,
  CallRequest,
  CallResponse,
} from '../types';
import { commLog } from './logger';
import { getPeerServerConfig } from '../config/peer';
import { RequestResponseManager } from './RequestResponseManager';

// ==================== 类型定义 ====================

export type MessageHandler = (data: { from: string; data: any }) => void;
export type OpenHandler = (id: string) => void;
export type ErrorHandler = (error: any) => void;
export type ProtocolMessageHandler = (protocol: AnyProtocol, from: string) => void;
export type DisconnectedHandler = () => void;
export type CloseHandler = () => void;

// 每个聊天的消息存储（简化版，仅保留消息列表）
interface ChatVersion {
  version: number;
  messages: ChatMessage[];
}

// 用户信息获取器（需要外部注入）
export interface UserInfoProvider {
  getUsername: () => string;
  getAvatar: () => string | null;
  getVersion: () => number;
}

// ==================== PeerHttpUtil ====================

export class PeerHttpUtil {
  private peer: any;
  private messageHandlers: MessageHandler[] = [];
  private openHandlers: OpenHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private disconnectedHandlers: DisconnectedHandler[] = [];
  private closeHandlers: CloseHandler[] = [];
  private protocolHandlers: Map<string, ProtocolMessageHandler[]> = new Map();

  // Request-Response 管理器
  private rrManager: RequestResponseManager;

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

  // 用户信息提供器（外部注入）
  private userInfoProvider?: UserInfoProvider;

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

    // 初始化 Request-Response 管理器
    this.rrManager = new RequestResponseManager(this.peer, this.getId.bind(this) as () => string);

    // 注册 Request-Response 处理器
    this.registerRRHandlers();

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
          const protocolType = data.type as string;

          if (protocolType.endsWith('_request')) {
            // 请求 - 处理并发送响应
            this.rrManager.handleRequest(data, conn.peer, conn);
            // 延迟关闭连接
            setTimeout(() => {
              try {
                conn.close();
              } catch (e) {
                // 忽略
              }
            }, 50);
          } else if (protocolType.endsWith('_response')) {
            // 响应
            this.handleProtocolMessage(data, conn.peer);
          } else {
            // 其他协议消息
            this.handleProtocolMessage(data, conn.peer);
          }
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

    console.log('[PeerHttp] Initialized with Request-Response protocol');
  }

  /**
   * 注册 Request-Response 处理器
   */
  private registerRRHandlers(): void {
    // 在线检查处理器
    this.rrManager.registerHandler('online_check_request', async (req, from) => {
      commLog.heartbeat.check({ to: from });
      return {
        isOnline: true,
        username: this.getCurrentUsername(),
        avatar: this.getCurrentAvatar(),
        userInfoVersion: this.getCurrentVersion(),
      };
    });

    // 发现通知处理器
    this.rrManager.registerHandler('discovery_notification_request', async (req, from) => {
      const request = req as DiscoveryNotificationRequest;
      await this.handleDiscoveryNotification({
        fromUsername: request.fromUsername,
        fromAvatar: request.fromAvatar,
      }, from);
      return {};
    });

    // 设备列表请求处理器
    this.rrManager.registerHandler('device_list_request', async (req, from) => {
      commLog.deviceDiscovery.requestReceived({ from });
      const devices = Array.from(this.discoveredDevices.values());
      return {
        devices,
        isBootstrap: false,
        realPeerId: undefined,
      };
    });

    // 用户信息查询处理器
    this.rrManager.registerHandler('user_info_request', async (req, from) => {
      commLog.sync.respondInfo({ to: from });
      return {
        username: this.getCurrentUsername(),
        avatar: this.getCurrentAvatar(),
        version: this.getCurrentVersion(),
      };
    });

    // 聊天消息处理器
    this.rrManager.registerHandler('chat_message_request', async (req, from) => {
      const request = req as ChatMessageRequest;
      const message = request.message;
      commLog.message.received({ from, msgType: message.type, messageId: message.id });

      // 触发消息处理器
      this.messageHandlers.forEach((handler) => {
        try {
          handler({ from, data: message });
        } catch (err) {
          console.error('[PeerHttp] Handler error:', err);
        }
      });

      return {
        deliveredAt: Date.now(),
      };
    });

    // 通话请求处理器
    this.rrManager.registerHandler('call_request', async (req, from) => {
      const request = req as CallRequest;
      console.log('[PeerHttp] Received call request from:', from, 'type:', request.callType);
      commLog.info(`Incoming ${request.callType} call from ${from.substring(0, 8)}...`);

      // 触发通话事件（由外部处理接听/拒绝）
      this.emitCallProtocol('call_request', { ...request, from } as any);

      // 返回默认响应（实际响应由外部处理）
      return {
        accepted: false,
      };
    });

    // 通话响应处理器
    this.rrManager.registerHandler('call_response', async (req, from) => {
      const response = req as CallResponse;
      console.log('[PeerHttp] Received call response from:', from, 'accepted:', response.accepted);

      // 触发通话响应事件
      this.emitCallProtocol('call_response', { ...response, from } as any);

      return {};
    });

    console.log('[PeerHttp] Request-Response handlers registered');
  }

  /**
   * 设置用户信息提供器
   */
  setUserInfoProvider(provider: UserInfoProvider): void {
    this.userInfoProvider = provider;
    console.log('[PeerHttp] UserInfoProvider set');
  }

  /**
   * 获取当前用户名
   */
  private getCurrentUsername(): string {
    return this.userInfoProvider?.getUsername() || '';
  }

  /**
   * 获取当前头像
   */
  private getCurrentAvatar(): string | null {
    return this.userInfoProvider?.getAvatar() ?? null;
  }

  /**
   * 获取当前版本号
   */
  private getCurrentVersion(): number {
    return this.userInfoProvider?.getVersion() ?? 0;
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

    const protocolType = type as string;

    // 检查是否是 Request-Response 响应
    if (protocolType.endsWith('_response')) {
      console.log('[PeerHttp] Received response:', protocolType, 'from:', from);
      this.rrManager.handleResponse(protocol);
      return;
    }

    // 处理其他协议类型（保持现有逻辑）
    switch (type) {
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
  private async handleDiscoveryNotification(
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
   * 注册协议处理器
   */
  onProtocol(type: AnyProtocol['type'] | 'call_request' | 'call_response', handler: ProtocolMessageHandler) {
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
   * 触发通话协议处理器（支持 call_request 和 call_response）
   */
  private emitCallProtocol(type: string, protocol: any) {
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

  // ==================== Request-Response 公共方法 ====================

  /**
   * 在线检查：新的 request-response 实现
   */
  async checkOnline(
    peerId: string,
    _username: string,
    _avatar: string | null,
    userInfoVersion: number,
    timeoutMs: number = 5000,
  ): Promise<{ isOnline: boolean; username: string; avatar: string | null; userInfoVersion: number } | null> {
    try {
      return await this.rrManager.sendRequest<OnlineCheckResponse>(
        peerId,
        'online_check_request',
        {},
        timeoutMs
      );
    } catch (error) {
      console.error('[PeerHttp] Online check failed:', error);
      return null;
    }
  }

  /**
   * 发送聊天消息：新的 request-response 实现
   */
  async sendMessage(
    peerId: string,
    message: ChatMessage,
    timeoutMs: number = 10000,
  ): Promise<boolean> {
    try {
      const response = await this.rrManager.sendRequest<ChatMessageResponse>(
        peerId,
        'chat_message_request',
        { message },
        timeoutMs
      );
      return true;
    } catch (error) {
      console.error('[PeerHttp] Send message failed:', error);
      return false;
    }
  }

  /**
   * 请求设备列表
   */
  async requestDeviceList(peerId: string): Promise<OnlineDevice[]> {
    try {
      const response = await this.rrManager.sendRequest<DeviceListResponse>(
        peerId,
        'device_list_request',
        {},
        10000
      );
      return response?.devices || [];
    } catch (error) {
      console.error('[PeerHttp] Request device list failed:', error);
      return [];
    }
  }

  /**
   * 请求用户信息
   */
  async requestUserInfo(peerId: string): Promise<{ username: string; avatar: string | null; version: number } | null> {
    try {
      const response = await this.rrManager.sendRequest<UserInfoResponse>(
        peerId,
        'user_info_request',
        {},
        5000
      );
      return response || null;
    } catch (error) {
      console.error('[PeerHttp] Request user info failed:', error);
      return null;
    }
  }

  /**
   * 发送发现通知
   */
  async sendDiscoveryNotification(peerId: string, username: string, avatar: string | null, profileVersion: number): Promise<void> {
    try {
      await this.rrManager.sendRequest<DiscoveryNotificationResponse>(
        peerId,
        'discovery_notification_request',
        {
          fromUsername: username,
          fromAvatar: avatar,
          profileVersion,
          publicKey: '', // TODO: 添加数字签名支持
        },
        10000
      );
    } catch (error) {
      console.error('[PeerHttp] Send discovery notification failed:', error);
    }
  }

  // ==================== 兼容性方法（保留现有接口）====================

  /**
   * 发现中心：询问指定节点已发现的设备（兼容方法）
   */
  async queryDiscoveredDevices(peerId: string): Promise<OnlineDevice[]> {
    return this.requestDeviceList(peerId);
  }

  /**
   * 发现中心：发送发现响应（包含用户信息）（兼容方法）
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
   * 发现中心：查询对端用户名（兼容方法）
   */
  async queryUsername(peerId: string): Promise<{ username: string; avatar: string | null } | null> {
    const userInfo = await this.requestUserInfo(peerId);
    if (userInfo) {
      return { username: userInfo.username, avatar: userInfo.avatar };
    }
    return null;
  }

  /**
   * 发现中心：响应用户名查询（兼容方法）
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
   * 在线检查：响应在线检查查询（兼容方法）
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
   * 响应用户信息查询（兼容方法）
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
   * 查询用户完整信息（兼容方法）
   */
  async queryUserInfo(peerId: string): Promise<{ username: string; avatar: string | null; version: number } | null> {
    return this.requestUserInfo(peerId);
  }

  // ==================== 发现中心公共方法 ====================

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
   * 监听消息事件
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
   * 设置在线检查器
   */
  setOnlineChecker(checker: (peerId: string) => boolean): void {
    this.rrManager.setOnlineChecker(checker);
  }

  /**
   * 获取 RequestResponseManager
   */
  getRRManager(): RequestResponseManager {
    if (!this.rrManager) {
      throw new Error('RRManager not initialized');
    }
    return this.rrManager;
  }

  /**
   * 销毁连接
   */
  destroy(): void {
    // 销毁 RequestResponseManager
    if (this.rrManager) {
      this.rrManager.destroy();
      this.rrManager = null as any;
    }

    if (this.peer) {
      this.peer.destroy();
    }
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
    console.log('[PeerHttp] handleDeviceListRequest: returning ' + devices.length + ' devices to ' + from);
    devices.forEach((device) => {
      console.log('[PeerHttp]   - ' + device.peerId + ' (' + device.username + ')');
    });

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

      // 如果响应中明确指定了 isBootstrap，则使用响应中的值
      // 否则，如果该设备之前被标记为启动者，但响应中没有确认，则清除标记
      const updatedDevice: OnlineDevice = {
        ...device,
        firstDiscovered: existing?.firstDiscovered || device.firstDiscovered || Date.now(),
        // 如果响应中明确指定了 isBootstrap，使用响应中的值
        // 否则，如果设备之前不是启动者，或响应中未指定，则设为 false
        isBootstrap: 'isBootstrap' in device ? device.isBootstrap : false,
        // 同样处理 realPeerId
        realPeerId: 'realPeerId' in device ? device.realPeerId : undefined,
      };

      this.discoveredDevices.set(device.peerId, updatedDevice);
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
