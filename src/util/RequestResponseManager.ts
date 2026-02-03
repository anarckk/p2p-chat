/**
 * Request-Response 通信管理器
 *
 * 替代五段式协议，提供简单可靠的请求-响应通信机制
 *
 * 核心特性：
 * - 发送请求并等待响应（支持超时）
 * - 注册请求处理器
 * - 处理接收到的请求
 * - 处理接收到的响应
 * - 连接管理（发送 request 后等待 response，收到后关闭 conn）
 *
 * @module util/RequestResponseManager
 */

import { commLog } from './logger';
import { signMessage, verifyMessageSignature, isSignatureSupported } from './cryptoUtils';

// ==================== 类型定义 ====================

/**
 * 基础请求协议（支持数字签名）
 */
export interface BaseRequestProtocol {
  type: string;           // 协议类型
  requestId: string;      // 请求唯一ID (UUID)
  from: string;           // 发送者 PeerId
  to: string;             // 接收者 PeerId
  timestamp: number;      // 时间戳
  signature?: string;     // 数字签名（可选）
}

/**
 * 基础响应协议（支持数字签名）
 */
export interface BaseResponseProtocol {
  type: string;           // 协议类型
  requestId: string;      // 对应的请求ID
  from: string;           // 响应者 PeerId
  to: string;             // 原始发送者 PeerId
  timestamp: number;      // 时间戳
  success: boolean;       // 是否成功
  error?: string;         // 错误信息
  signature?: string;     // 数字签名（可选）
}

/**
 * 请求处理器类型
 */
export type RequestHandler<T = any, R = any> = (request: T, from: string) => Promise<R>;

/**
 * 待处理请求状态
 */
interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  conn: any;
  peerId: string;
  requestType: string;
}

/**
 * 在线状态检查器类型
 */
export type OnlineChecker = (peerId: string) => boolean;

// ==================== 配置 ====================

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
  timeout: 7000,          // 默认超时时间 7 秒（从 5 秒增加，给系统更多恢复时间）
  connectionTimeout: 12000, // 连接建立超时时间 12 秒（从 10 秒增加）
};

// ==================== RequestResponseManager ====================

/**
 * Request-Response 通信管理器
 *
 * 提供简单可靠的请求-响应通信机制
 */
export class RequestResponseManager {
  private peer: any;
  private getMyPeerId: () => string;
  private handlers: Map<string, RequestHandler> = new Map();
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private onlineChecker?: OnlineChecker;
  private config: typeof DEFAULT_CONFIG;
  private activeConnections: Map<string, Date> = new Map();
  private connectionQueues: Map<string, Array<() => void>> = new Map();
  private connectingState: Map<string, boolean> = new Map(); // 跟踪正在连接的设备

  /**
   * 构造函数
   * @param peer - PeerJS 实例
   * @param getMyPeerId - 获取当前 PeerId 的函数
   * @param config - 配置选项
   */
  constructor(
    peer: any,
    getMyPeerId: () => string,
    config?: Partial<typeof DEFAULT_CONFIG>
  ) {
    this.peer = peer;
    this.getMyPeerId = getMyPeerId;
    this.config = { ...DEFAULT_CONFIG, ...config };
    console.log('[RequestResponseManager] Initialized with config:', JSON.stringify(this.config));
  }

  /**
   * 设置在线状态检查器
   * @param checker - 在线状态检查函数
   */
  setOnlineChecker(checker: OnlineChecker): void {
    this.onlineChecker = checker;
    console.log('[RequestResponseManager] Online checker registered');
  }

  /**
   * 注册请求处理器
   * @param type - 请求类型
   * @param handler - 处理器函数
   */
  registerHandler<T = any, R = any>(type: string, handler: RequestHandler<T, R>): void {
    this.handlers.set(type, handler);
    console.log('[RequestResponseManager] Handler registered for type:', type);
  }

  /**
   * 注销请求处理器
   * @param type - 请求类型
   */
  unregisterHandler(type: string): void {
    this.handlers.delete(type);
    console.log('[RequestResponseManager] Handler unregistered for type:', type);
  }

  /**
   * 等待连接可用
   * @param peerId - 目标 PeerId
   * @param timeout - 超时时间（毫秒）
   * @returns Promise<void>
   */
  async waitForConnectionAvailable(peerId: string, timeout: number = 1000): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkInterval = setInterval(() => {
        // 检查是否超时
        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(new Error(`Connection to ${peerId.substring(0, 8)}... not available after ${timeout}ms`));
          return;
        }

        // 检查连接是否仍然活跃
        if (!this.activeConnections.has(peerId)) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 50);
    });
  }

  /**
   * 发送请求并等待响应
   * @param peerId - 目标 PeerId
   * @param type - 请求类型
   * @param payload - 请求载荷
   * @param timeout - 超时时间（毫秒）
   * @returns Promise<T> 响应数据
   */
  async sendRequest<T = any>(
    peerId: string,
    type: string,
    payload: any,
    timeout?: number
  ): Promise<T> {
    const actualTimeout = timeout ?? this.config.timeout;
    const requestId = crypto.randomUUID();
    const myPeerId = this.getMyPeerId();

    // 检查是否已有活跃连接或正在连接，如果有则将请求加入队列
    if (this.activeConnections.has(peerId) || this.connectingState.has(peerId)) {
      const reason = this.activeConnections.has(peerId) ? 'active' : 'connecting';
      console.warn('[RequestResponseManager] Connection to ' + peerId.substring(0, 8) + '... already ' + reason + ', queuing request...');

      return new Promise<T>((resolve, reject) => {
        // 获取或创建队列
        let queue = this.connectionQueues.get(peerId);
        if (!queue) {
          queue = [];
          this.connectionQueues.set(peerId, queue);
        }

        // 将请求加入队列
        queue.push(() => {
          this.executeRequest<T>(peerId, type, payload, actualTimeout, requestId, resolve, reject);
        });

        console.log('[RequestResponseManager] Request queued for:', peerId.substring(0, 8) + '...', 'queue size:', queue.length);
      });
    }

    // 添加随机延迟（0-500ms），防止两个设备同时发起连接（增加范围以提高稳定性）
    const jitterDelay = Math.floor(Math.random() * 500);

    // 标记为正在连接
    this.connectingState.set(peerId, true);

    // 没有活跃连接，直接执行请求
    // 注意：connectingState 将在连接成功/失败时由事件处理程序清除
    // 使用随机延迟来打破竞态条件
    await new Promise(resolve => setTimeout(resolve, jitterDelay));

    return this.executeRequest<T>(peerId, type, payload, actualTimeout, requestId, undefined, undefined);
  }

  /**
   * 执行请求（内部方法）
   * @param peerId - 目标 PeerId
   * @param type - 请求类型
   * @param payload - 请求载荷
   * @param timeout - 超时时间（毫秒）
   * @param requestId - 请求ID
   * @param resolve - Promise resolve（可选，用于队列）
   * @param reject - Promise reject（可选，用于队列）
   * @returns Promise<T> 响应数据
   */
  private executeRequest<T = any>(
    peerId: string,
    type: string,
    payload: any,
    timeout: number,
    requestId: string,
    resolve?: (value: T) => void,
    reject?: (error: Error) => void
  ): Promise<T> {
    const myPeerId = this.getMyPeerId();

    // 如果没有提供 resolve/reject（非队列调用），创建新的 Promise
    if (!resolve || !reject) {
      return new Promise<T>((res, rej) => {
        this._executeRequestInternal<T>(peerId, type, payload, timeout, requestId, myPeerId, res, rej);
      });
    }

    // 队列调用，直接执行内部方法
    this._executeRequestInternal<T>(peerId, type, payload, timeout, requestId, myPeerId, resolve, reject);
    return Promise.resolve(undefined as any); // 队列调用已经在内部处理，返回一个已完成的 Promise
  }

  /**
   * 执行请求的内部实现
   */
  private _executeRequestInternal<T = any>(
    peerId: string,
    type: string,
    payload: any,
    timeout: number,
    requestId: string,
    myPeerId: string,
    resolve: (value: T) => void,
    reject: (error: Error) => void
  ): void {
    let conn: any;

    // 创建连接超时
    const connectionTimeout = setTimeout(() => {
      console.error('[RequestResponseManager] Connection timeout:', peerId.substring(0, 8) + '...');
      this.cleanupRequest(requestId);
      this.cleanupActiveConnection(peerId);
      reject(new Error(`Connection timeout to ${peerId.substring(0, 8)}...`));
    }, this.config.connectionTimeout);

    try {
      conn = this.peer.connect(peerId);

      conn.on('error', (err: any) => {
        console.error('[RequestResponseManager] Connection error:', err);
        clearTimeout(connectionTimeout);
        this.cleanupRequest(requestId);
        this.cleanupActiveConnection(peerId);
        reject(new Error(`Connection error: ${String(err)}`));
      });

      conn.on('open', async () => {
        clearTimeout(connectionTimeout);
        console.log('[RequestResponseManager] Connection opened to:', peerId.substring(0, 8) + '...');

        // 连接已建立，标记为活跃并清除正在连接状态
        this.activeConnections.set(peerId, new Date());
        this.connectingState.delete(peerId);

        // 创建请求协议
        const request: BaseRequestProtocol = {
          type,
          requestId,
          from: myPeerId,
          to: peerId,
          timestamp: Date.now(),
          ...payload
        };

        // 如果协议支持签名，添加签名
        if (isSignatureSupported(type)) {
          try {
            request.signature = await signMessage(request);
            console.log('[RequestResponseManager] Request signed:', type);
          } catch (error) {
            console.error('[RequestResponseManager] Failed to sign request:', error);
            // 签名失败不阻止发送，继续发送未签名的请求（向后兼容）
          }
        }

        // 发送请求
        try {
          conn.send(request);
          console.log('[RequestResponseManager] Request sent:', requestId.substring(0, 8));
          commLog.info(`Request sent: ${type}`, { to: peerId.substring(0, 8) + '...', requestId: requestId.substring(0, 8) });
        } catch (err) {
          console.error('[RequestResponseManager] Failed to send request:', err);
          this.cleanupRequest(requestId);
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }

        // 设置响应超时
        const responseTimeout = setTimeout(() => {
          console.warn('[RequestResponseManager] Request timeout:', requestId.substring(0, 8));
          this.cleanupRequest(requestId);
          reject(new Error(`Request timeout after ${timeout}ms`));
        }, timeout);

        // 存储待处理请求
        this.pendingRequests.set(requestId, {
          resolve,
          reject,
          timeout: responseTimeout,
          conn,
          peerId,
          requestType: type
        });
      });
    } catch (err) {
      clearTimeout(connectionTimeout);
      console.error('[RequestResponseManager] Failed to create connection:', err);
      this.cleanupActiveConnection(peerId);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * 处理接收到的请求
   * @param request - 请求协议
   * @param from - 发送者 PeerId
   * @param conn - 连接对象
   */
  async handleRequest(request: any, from: string, conn: any): Promise<void> {
    const { type, requestId } = request;

    console.log('[RequestResponseManager] Received request:', {
      type,
      requestId: requestId?.substring(0, 8),
      from: from.substring(0, 8) + '...'
    });

    commLog.info(`Request received: ${type}`, { from: from.substring(0, 8) + '...', requestId: requestId?.substring(0, 8) });

    // 验证签名
    if (isSignatureSupported(type)) {
      const signatureValid = await verifyMessageSignature(request, from);
      if (signatureValid === false) {
        console.error('[RequestResponseManager] Signature verification failed, rejecting request:', {
          type,
          from: from.substring(0, 8) + '...',
        });
        // 发送错误响应
        this.sendResponse(conn, request, from, false, 'Signature verification failed');
        return;
      }
      // 如果 signatureValid === null，表示跳过验证（向后兼容）
    }

    const handler = this.handlers.get(type);

    if (!handler) {
      console.warn('[RequestResponseManager] No handler for request type:', type);
      // 发送错误响应
      this.sendResponse(conn, request, from, false, 'No handler for request type');
      return;
    }

    try {
      // 执行处理器
      const result = await handler(request, from);

      // 发送成功响应
      this.sendResponse(conn, request, from, true, undefined, result);

      console.log('[RequestResponseManager] Request handled successfully:', requestId.substring(0, 8));
    } catch (err: any) {
      console.error('[RequestResponseManager] Handler error:', err);
      // 发送错误响应
      this.sendResponse(conn, request, from, false, String(err));
    }
  }

  /**
   * 处理接收到的响应
   * @param response - 响应协议
   */
  async handleResponse(response: any): Promise<void> {
    const { requestId, success, error, type } = response;

    console.log('[RequestResponseManager] Received response:', {
      requestId: requestId?.substring(0, 8),
      success,
      error
    });

    commLog.info(`Response received: ${response.type}`, { requestId: requestId?.substring(0, 8), success });

    const pending = this.pendingRequests.get(requestId);

    if (!pending) {
      console.warn('[RequestResponseManager] No pending request for response:', requestId?.substring(0, 8));
      return;
    }

    // 验证签名
    if (isSignatureSupported(type)) {
      const signatureValid = await verifyMessageSignature(response, pending.peerId);
      if (signatureValid === false) {
        console.error('[RequestResponseManager] Signature verification failed for response:', {
          type,
          from: pending.peerId.substring(0, 8) + '...',
        });
        // 签名验证失败，拒绝响应
        this.cleanupRequest(requestId);
        this.cleanupActiveConnection(pending.peerId);
        pending.reject(new Error('Signature verification failed for response'));
        return;
      }
      // 如果 signatureValid === null，表示跳过验证（向后兼容）
    }

    // 清理请求
    this.cleanupRequest(requestId);

    // 清理活跃连接（响应处理完毕，可以处理下一个队列请求）
    this.cleanupActiveConnection(pending.peerId);

    // 处理响应
    if (success) {
      pending.resolve(response);
    } else {
      pending.reject(new Error(error || 'Request failed'));
    }
  }

  /**
   * 发送响应
   * @param conn - 连接对象
   * @param originalRequest - 原始请求
   * @param to - 原始发送者 PeerId
   * @param success - 是否成功
   * @param error - 错误信息
   * @param data - 响应数据
   */
  private async sendResponse(
    conn: any,
    originalRequest: any,
    to: string,
    success: boolean,
    error?: string,
    data?: any
  ): Promise<void> {
    const myPeerId = this.getMyPeerId();
    const responseType = originalRequest.type + '_response';

    const response: BaseResponseProtocol = {
      type: responseType,
      requestId: originalRequest.requestId,
      from: myPeerId,
      to: to,
      timestamp: Date.now(),
      success,
      error,
      ...data
    };

    // 如果协议支持签名，添加签名
    if (isSignatureSupported(responseType)) {
      try {
        response.signature = await signMessage(response);
        console.log('[RequestResponseManager] Response signed:', responseType);
      } catch (signError) {
        console.error('[RequestResponseManager] Failed to sign response:', signError);
        // 签名失败不阻止发送，继续发送未签名的响应（向后兼容）
      }
    }

    try {
      conn.send(response);
      console.log('[RequestResponseManager] Response sent:', response.requestId?.substring(0, 8), 'success:', success);
      commLog.info(`Response sent: ${responseType}`, { to: to.substring(0, 8) + '...', success });

      // 延迟关闭连接，确保数据已发送
      setTimeout(() => {
        try {
          conn.close();
          console.log('[RequestResponseManager] Connection closed after response');
        } catch (e) {
          // 忽略关闭错误
        }
      }, 50);
    } catch (err) {
      console.error('[RequestResponseManager] Failed to send response:', err);
    }
  }

  /**
   * 清理请求
   * @param requestId - 请求ID
   */
  private cleanupRequest(requestId: string): void {
    const pending = this.pendingRequests.get(requestId);

    if (pending) {
      // 清除超时定时器
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }

      // 关闭连接
      if (pending.conn) {
        try {
          pending.conn.close();
          console.log('[RequestResponseManager] Connection closed');
        } catch (e) {
          // 忽略关闭错误
        }
      }

      // 删除待处理请求
      this.pendingRequests.delete(requestId);
    }
  }

  /**
   * 清理活跃连接并处理队列
   * @param peerId - PeerId
   */
  private cleanupActiveConnection(peerId: string): void {
    // 移除活跃连接标记和正在连接状态
    this.activeConnections.delete(peerId);
    this.connectingState.delete(peerId);

    // 处理队列中的下一个请求
    const queue = this.connectionQueues.get(peerId);
    if (queue && queue.length > 0) {
      const nextRequest = queue.shift();
      if (nextRequest) {
        console.log('[RequestResponseManager] Processing next queued request for:', peerId.substring(0, 8) + '...');
        // 延迟执行下一个请求，确保连接完全关闭（增加延迟以提高稳定性）
        setTimeout(() => {
          try {
            nextRequest();
          } catch (e) {
            console.error('[RequestResponseManager] Error processing queued request:', e);
          }
        }, 200); // 从 100ms 增加到 200ms
      }

      // 如果队列为空，删除队列
      if (queue.length === 0) {
        this.connectionQueues.delete(peerId);
      }
    }
  }

  /**
   * 检查是否是指定的请求类型
   * @param protocol - 协议对象
   * @param type - 请求类型
   */
  isRequestType(protocol: any, type: string): boolean {
    return protocol?.type === type;
  }

  /**
   * 检查是否是指定的响应类型
   * @param protocol - 协议对象
   * @param type - 原始请求类型
   */
  isResponseType(protocol: any, type: string): boolean {
    return protocol?.type === type + '_response';
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    console.log('[RequestResponseManager] Destroying...');

    // 清理所有待处理请求
    for (const [requestId, pending] of this.pendingRequests.entries()) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      if (pending.conn) {
        try {
          pending.conn.close();
        } catch (e) {
          // 忽略关闭错误
        }
      }
      pending.reject(new Error('RequestResponseManager destroyed'));
    }

    this.pendingRequests.clear();
    this.handlers.clear();
    this.activeConnections.clear();
    this.connectionQueues.clear();

    console.log('[RequestResponseManager] Destroyed');
  }
}
