/**
 * 通用五段式通信协议
 *
 * 设计理念：
 * - 在复杂不稳定的网络中构建可靠可预测的系统
 * - 减少网络流量：只重发信号（第一段），不重发大数据
 * - 双方在线确保：发送方只发通知，消息体由对端反向请求
 *
 * 五段流程：
 * 第一段：version_notify（发送方持续重发消息ID通知，每5秒）
 * 第二段：version_request（接收方被动响应，请求消息体）
 * 第三段：version_response（发送方只发一次消息体）
 * 第四段：delivery_ack（接收方被动响应，确认送达）
 * 第五段：标记已送达（发送方本地操作）
 */

import { commLog } from './logger';

// ==================== 协议消息类型 ====================

/**
 * 协议消息类型枚举
 */
export enum FiveStageMessageType {
  NOTIFY = 'five_stage_notify',           // 第一段：版本号通知
  REQUEST = 'five_stage_request',          // 第二段：版本请求
  RESPONSE = 'five_stage_response',        // 第三段：版本响应
  ACK = 'five_stage_ack',                  // 第四段：送达确认
}

/**
 * 业务场景类型
 */
export enum BusinessType {
  CHAT_MESSAGE = 'chat_message',           // 聊天消息
  AVATAR = 'avatar',                       // 头像传输
  USERNAME = 'username',                   // 用户名传输
  DEVICE_LIST = 'device_list',             // 设备列表传输
}

// ==================== 基础接口 ====================

/**
 * 协议消息基础接口
 */
export interface BaseProtocolMessage {
  businessType: BusinessType;              // 业务类型
  dataType: string;                        // 数据类型标识（如 'avatar_v1', 'device_list_v2'）
  from: string;                            // 发送者 PeerId
  to: string;                              // 接收者 PeerId
  timestamp: number;                       // 时间戳
}

/**
 * 第一段：版本号通知
 */
export interface FiveStageNotifyMessage extends BaseProtocolMessage {
  type: FiveStageMessageType.NOTIFY;
  dataId: string;                          // 数据唯一标识
  version: number;                         // 版本号
  retryCount: number;                      // 重试次数
}

/**
 * 第二段：版本请求
 */
export interface FiveStageRequestMessage extends BaseProtocolMessage {
  type: FiveStageMessageType.REQUEST;
  dataId: string;                          // 数据唯一标识
  version: number;                         // 请求的版本号
}

/**
 * 第三段：版本响应
 */
export interface FiveStageResponseMessage<T = any> extends BaseProtocolMessage {
  type: FiveStageMessageType.RESPONSE;
  dataId: string;                          // 数据唯一标识
  version: number;                         // 版本号
  data: T;                                 // 实际数据
  responseTime: number;                    // 响应时间戳
}

/**
 * 第四段：送达确认
 */
export interface FiveStageAckMessage extends BaseProtocolMessage {
  type: FiveStageMessageType.ACK;
  dataId: string;                          // 数据唯一标识
  version: number;                         // 版本号
  ackTime: number;                         // 确认时间戳
}

/**
 * 联合类型：所有五段式协议消息
 */
export type FiveStageMessage<T = any> =
  | FiveStageNotifyMessage
  | FiveStageRequestMessage
  | FiveStageResponseMessage<T>
  | FiveStageAckMessage;

// ==================== 发送方状态管理 ====================

/**
 * 发送方状态
 */
export type SendingStage = 'notifying' | 'requested' | 'delivering' | 'acked';

/**
 * 发送方状态对象
 */
export interface SendingState {
  dataId: string;                          // 数据ID
  version: number;                         // 版本号
  peerId: string;                          // 目标PeerId
  businessType: BusinessType;              // 业务类型
  dataType: string;                        // 数据类型
  stage: SendingStage;                     // 当前阶段
  notifyCount: number;                     // 第一段重发次数
  notifiedAt: number;                      // 首次通知时间
  requestedAt?: number;                    // 请求收到时间
  deliveredAt?: number;                    // 消息体发送时间
  ackedAt?: number;                        // 确认收到时间
  data: any;                               // 实际数据（第三段发送用）
  notifyTimer?: ReturnType<typeof setInterval>; // 重发定时器
}

// ==================== 接收方状态管理 ====================

/**
 * 接收方状态
 */
export type ReceivingStage = 'pending' | 'requested' | 'received' | 'acked';

/**
 * 接收方状态对象
 */
export interface ReceivingState {
  dataId: string;                          // 数据ID
  version: number;                         // 版本号
  peerId: string;                          // 发送者PeerId
  businessType: BusinessType;              // 业务类型
  dataType: string;                        // 数据类型
  stage: ReceivingStage;                   // 当前阶段
  notifiedAt?: number;                     // 通知收到时间
  requestedAt?: number;                    // 请求发送时间
  receivedAt?: number;                     // 数据接收时间
  ackedAt?: number;                        // 确认发送时间
}

// ==================== 配置 ====================

/**
 * 五段式协议配置
 */
export interface FiveStageConfig {
  notifyInterval: number;                  // 第一段重发间隔（毫秒）
  notifyMaxRetries: number;                // 第一段最大重试次数
  requestTimeout: number;                  // 第二段超时（毫秒）
  responseTimeout: number;                 // 第三段超时（毫秒）
  ackTimeout: number;                      // 第四段超时（毫秒）
}

/**
 * 默认配置
 */
export const DEFAULT_FIVE_STAGE_CONFIG: FiveStageConfig = {
  notifyInterval: 5000,                    // 5秒重发间隔
  notifyMaxRetries: 120,                   // 最多重发120次（10分钟）
  requestTimeout: 10000,                   // 10秒超时
  responseTimeout: 15000,                  // 15秒超时
  ackTimeout: 5000,                        // 5秒超时
};

// ==================== 数据ID生成器 ====================

/**
 * 数据ID生成器接口
 */
export interface DataIdGenerator<T = any> {
  /**
   * 根据数据生成唯一标识
   * @param data - 数据
   * @param context - 上下文信息（如peerId）
   * @returns 数据的唯一标识
   */
  generate(data: T, context?: string): string;

  /**
   * 数据类型标识
   * 用于区分同一种业务类型下的不同数据格式
   */
  dataType: string;
}

/**
 * 头像ID生成器
 * 使用头像内容的hash作为ID
 */
export class AvatarDataIdGenerator implements DataIdGenerator<string | null> {
  dataType = 'avatar_v1';

  generate(avatar: string | null): string {
    if (!avatar) {
      return 'avatar_empty';
    }
    // 简单hash：取前10个字符和后10个字符的组合
    if (avatar.length <= 20) {
      return 'avatar_' + avatar;
    }
    const prefix = avatar.substring(0, 10);
    const suffix = avatar.substring(avatar.length - 10);
    return 'avatar_' + prefix + '_' + suffix;
  }
}

/**
 * 用户名ID生成器
 * 使用用户名本身作为ID
 */
export class UsernameDataIdGenerator implements DataIdGenerator<string> {
  dataType = 'username_v1';

  generate(username: string): string {
    return 'username_' + username;
  }
}

/**
 * 设备列表ID生成器
 * 使用设备列表的hash作为ID（用户局部唯一）
 */
export class DeviceListDataIdGenerator implements DataIdGenerator<string[]> {
  dataType = 'device_list_v1';

  generate(peerIds: string[]): string {
    // 对peerIds排序后拼接，生成稳定的hash
    const sorted = [...peerIds].sort();
    const combined = sorted.join(',');
    // 简单hash算法
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return 'device_list_' + Math.abs(hash).toString(36);
  }
}

/**
 * 聊天消息ID生成器
 * 使用消息自身的ID
 */
export class ChatMessageDataIdGenerator implements DataIdGenerator<{ id: string }> {
  dataType = 'chat_message_v1';

  generate(message: { id: string }): string {
    return message.id;
  }
}

// ==================== 通用五段式协议类 ====================

/**
 * 五段式协议处理器接口
 */
export interface FiveStageHandler<T = any> {
  /**
   * 处理接收到的数据
   * @param data - 接收到的数据
   * @param from - 发送者PeerId
   */
  onDataReceived?(data: T, from: string): void;

  /**
   * 处理送达确认
   * @param dataId - 数据ID
   * @param version - 版本号
   * @param to - 接收者PeerId
   */
  onDeliveryAck?(dataId: string, version: number, to: string): void;
}

/**
 * 五段式协议配置选项
 */
export interface FiveStageOptions {
  config?: Partial<FiveStageConfig>;       // 协议配置
  sendProtocol: (peerId: string, message: FiveStageMessage) => Promise<void>; // 发送协议消息的函数
  getMyPeerId: () => string;               // 获取自身PeerId的函数
}

/**
 * 通用五段式协议类
 */
export class FiveStageProtocol {
  private config: FiveStageConfig;
  private sendProtocol: (peerId: string, message: FiveStageMessage) => Promise<void>;
  private getMyPeerId: () => string;

  // 发送方状态（key: dataId）
  private sendingStates: Map<string, SendingState> = new Map();

  // 接收方状态（key: peerId_dataType_version）
  private receivingStates: Map<string, ReceivingState> = new Map();

  // 业务处理器（key: businessType）
  private handlers: Map<BusinessType, FiveStageHandler> = new Map();

  // 版本号管理（key: peerId_dataType）
  private versions: Map<string, number> = new Map();

  constructor(options: FiveStageOptions) {
    this.config = { ...DEFAULT_FIVE_STAGE_CONFIG, ...options.config };
    this.sendProtocol = options.sendProtocol;
    this.getMyPeerId = options.getMyPeerId;
  }

  /**
   * 注册业务处理器
   */
  registerHandler(businessType: BusinessType, handler: FiveStageHandler): void {
    this.handlers.set(businessType, handler);
  }

  /**
   * 注销业务处理器
   */
  unregisterHandler(businessType: BusinessType): void {
    this.handlers.delete(businessType);
  }

  /**
   * 获取或创建版本号记录
   */
  private getVersion(peerId: string, dataType: string): number {
    const key = `${peerId}_${dataType}`;
    if (!this.versions.has(key)) {
      this.versions.set(key, 0);
    }
    return this.versions.get(key)!;
  }

  /**
   * 增加版本号
   */
  private incrementVersion(peerId: string, dataType: string): number {
    const key = `${peerId}_${dataType}`;
    const current = this.versions.get(key) || 0;
    const newVersion = current + 1;
    this.versions.set(key, newVersion);
    return newVersion;
  }

  /**
   * 发送数据（五段式协议）
   * @param peerId - 目标PeerId
   * @param businessType - 业务类型
   * @param dataIdGenerator - 数据ID生成器
   * @param data - 要发送的数据
   * @returns 发送状态
   */
  async send<T>(
    peerId: string,
    businessType: BusinessType,
    dataIdGenerator: DataIdGenerator<T>,
    data: T,
  ): Promise<{ dataId: string; version: number; sent: boolean; stage: 'notifying' }> {
    const myPeerId = this.getMyPeerId();
    const dataType = dataIdGenerator.dataType;
    const dataId = dataIdGenerator.generate(data, peerId);
    const version = this.incrementVersion(peerId, dataType);

    console.log('[FiveStage] Sending data: businessType=' + businessType + ', dataId=' + dataId + ', version=' + version);

    // 创建发送方状态
    const state: SendingState = {
      dataId,
      version,
      peerId,
      businessType,
      dataType,
      stage: 'notifying',
      notifyCount: 0,
      notifiedAt: Date.now(),
      data,
    };
    this.sendingStates.set(dataId, state);

    // 立即发送第一次通知
    this.sendNotify(peerId, state);

    // 启动定时重发
    state.notifyTimer = setInterval(() => {
      const currentState = this.sendingStates.get(dataId);
      if (currentState && currentState.stage === 'notifying') {
        currentState.notifyCount++;
        if (currentState.notifyCount <= this.config.notifyMaxRetries) {
          console.log('[FiveStage] Retrying notify #' + currentState.notifyCount + ' for dataId=' + dataId);
          this.sendNotify(peerId, currentState);
        } else {
          console.warn('[FiveStage] Max retries reached for dataId=' + dataId);
          clearInterval(currentState.notifyTimer!);
        }
      } else {
        const timer = this.sendingStates.get(dataId)?.notifyTimer;
        if (timer) {
          clearInterval(timer);
        }
      }
    }, this.config.notifyInterval);

    return { dataId, version, sent: true, stage: 'notifying' };
  }

  /**
   * 第一段：发送版本通知
   */
  private sendNotify(peerId: string, state: SendingState): void {
    state.notifyCount++;
    console.log('[FiveStage] [Stage 1] Sending notify #' + state.notifyCount + ': dataId=' + state.dataId + ', v=' + state.version);

    const message: FiveStageNotifyMessage = {
      type: FiveStageMessageType.NOTIFY,
      businessType: state.businessType,
      dataType: state.dataType,
      from: this.getMyPeerId(),
      to: peerId,
      timestamp: Date.now(),
      dataId: state.dataId,
      version: state.version,
      retryCount: state.notifyCount,
    };

    this.sendProtocol(peerId, message).catch((err) => {
      console.error('[FiveStage] [Stage 1] Notify failed:', err);
    });
  }

  /**
   * 处理接收到的协议消息
   */
  handleMessage(message: FiveStageMessage, from: string): void {
    switch (message.type) {
      case FiveStageMessageType.NOTIFY:
        this.handleNotify(message as FiveStageNotifyMessage, from);
        break;
      case FiveStageMessageType.REQUEST:
        this.handleRequest(message as FiveStageRequestMessage, from);
        break;
      case FiveStageMessageType.RESPONSE:
        this.handleResponse(message as FiveStageResponseMessage, from);
        break;
      case FiveStageMessageType.ACK:
        this.handleAck(message as FiveStageAckMessage, from);
        break;
    }
  }

  /**
   * 第一段接收：处理版本通知
   */
  private handleNotify(message: FiveStageNotifyMessage, from: string): void {
    const { dataId, version, businessType, dataType, retryCount } = message;
    const myVersion = this.getVersion(from, dataType);

    console.log('[FiveStage] [Stage 1] Received notify #' + retryCount + ': from=' + from + ', theirV=' + version + ', myV=' + myVersion + ', dataId=' + dataId);

    // 检查是否需要更新
    if (version <= myVersion) {
      console.log('[FiveStage] [Stage 1] Version not newer, ignoring');
      return;
    }

    // 检查是否已发送过请求
    const stateKey = `${from}_${dataType}_${version}`;
    const existingState = this.receivingStates.get(stateKey);

    if (existingState) {
      console.log('[FiveStage] [Stage 1] Already requested v=' + version + ', waiting for response');
      return;
    }

    // 创建接收方状态
    const state: ReceivingState = {
      dataId,
      version,
      peerId: from,
      businessType,
      dataType,
      stage: 'requested',
      notifiedAt: Date.now(),
      requestedAt: Date.now(),
    };
    this.receivingStates.set(stateKey, state);

    // 发送第二段：版本请求
    console.log('[FiveStage] [Stage 1] Sending request for version=' + version);
    this.sendRequest(from, state);
  }

  /**
   * 第二段发送：发送版本请求
   */
  private sendRequest(peerId: string, state: ReceivingState): void {
    console.log('[FiveStage] [Stage 2] Sending request: dataId=' + state.dataId + ', v=' + state.version);

    const message: FiveStageRequestMessage = {
      type: FiveStageMessageType.REQUEST,
      businessType: state.businessType,
      dataType: state.dataType,
      from: this.getMyPeerId(),
      to: peerId,
      timestamp: Date.now(),
      dataId: state.dataId,
      version: state.version,
    };

    this.sendProtocol(peerId, message).catch((err) => {
      console.error('[FiveStage] [Stage 2] Request failed:', err);
    });
  }

  /**
   * 第二段接收：处理版本请求
   */
  private handleRequest(message: FiveStageRequestMessage, from: string): void {
    const { dataId, version } = message;

    // 查找发送方状态
    const state = this.sendingStates.get(dataId);

    if (!state) {
      console.warn('[FiveStage] [Stage 2] Request for unknown data: ' + dataId);
      return;
    }

    console.log('[FiveStage] [Stage 2] Received request for dataId=' + dataId + ', v=' + version);

    // 更新状态
    state.stage = 'requested';
    state.requestedAt = Date.now();

    // 发送第三段：消息响应
    console.log('[FiveStage] [Stage 2] Sending response for dataId=' + dataId);
    this.sendResponse(from, state);
  }

  /**
   * 第三段发送：发送消息响应
   */
  private sendResponse(peerId: string, state: SendingState): void {
    state.stage = 'delivering';
    state.deliveredAt = Date.now();

    console.log('[FiveStage] [Stage 3] Sending response: dataId=' + state.dataId);

    const message: FiveStageResponseMessage = {
      type: FiveStageMessageType.RESPONSE,
      businessType: state.businessType,
      dataType: state.dataType,
      from: this.getMyPeerId(),
      to: peerId,
      timestamp: Date.now(),
      dataId: state.dataId,
      version: state.version,
      data: state.data,
      responseTime: Date.now(),
    };

    this.sendProtocol(peerId, message).catch((err) => {
      console.error('[FiveStage] [Stage 3] Response failed:', err);
    });
  }

  /**
   * 第三段接收：处理版本响应
   */
  private handleResponse(message: FiveStageResponseMessage, from: string): void {
    const { dataId, version, data, dataType, businessType } = message;
    const stateKey = `${from}_${dataType}_${version}`;
    const state = this.receivingStates.get(stateKey);

    console.log('[FiveStage] [Stage 3] Received response: from=' + from + ', v=' + version + ', dataId=' + dataId);

    // 检查版本是否已处理
    const myVersion = this.getVersion(from, dataType);
    if (version <= myVersion) {
      console.log('[FiveStage] [Stage 3] Version already processed, ignoring');
      return;
    }

    // 更新接收方状态
    if (state) {
      state.stage = 'received';
      state.receivedAt = Date.now();
    }

    // 更新版本号
    const key = `${from}_${dataType}`;
    this.versions.set(key, version);

    // 触发业务处理器
    const handler = this.handlers.get(businessType);
    if (handler?.onDataReceived) {
      handler.onDataReceived(data, from);
    }

    // 发送第四段：送达确认
    console.log('[FiveStage] [Stage 3] Sending ACK for dataId=' + dataId);
    this.sendAck(from, dataId, version, dataType, businessType);

    // 清理接收方状态
    if (state) {
      state.stage = 'acked';
      state.ackedAt = Date.now();
      this.receivingStates.delete(stateKey);
    }
  }

  /**
   * 第四段发送：发送送达确认
   */
  private sendAck(peerId: string, dataId: string, version: number, dataType: string, businessType: BusinessType): void {
    console.log('[FiveStage] [Stage 4] Sending ACK: dataId=' + dataId + ', v=' + version);

    const message: FiveStageAckMessage = {
      type: FiveStageMessageType.ACK,
      businessType,
      dataType,
      from: this.getMyPeerId(),
      to: peerId,
      timestamp: Date.now(),
      dataId,
      version,
      ackTime: Date.now(),
    };

    this.sendProtocol(peerId, message).catch((err) => {
      console.error('[FiveStage] [Stage 4] ACK failed:', err);
    });
  }

  /**
   * 第四段接收：处理送达确认
   */
  private handleAck(message: FiveStageAckMessage, from: string): void {
    const { dataId, version, businessType } = message;

    // 查找发送方状态
    const state = this.sendingStates.get(dataId);

    if (!state) {
      console.warn('[FiveStage] [Stage 4] ACK for unknown data: ' + dataId);
      return;
    }

    console.log('[FiveStage] [Stage 4] Received ACK for dataId=' + dataId + ', v=' + version);

    // 第五段：标记已送达
    state.stage = 'acked';
    state.ackedAt = Date.now();

    // 清理定时器
    if (state.notifyTimer) {
      clearInterval(state.notifyTimer);
    }

    // 删除状态
    this.sendingStates.delete(dataId);

    console.log('[FiveStage] [Stage 5] Data delivered: dataId=' + dataId);

    // 触发业务处理器
    const handler = this.handlers.get(businessType);
    if (handler?.onDeliveryAck) {
      handler.onDeliveryAck(dataId, version, from);
    }
  }

  /**
   * 清理指定peerId的所有状态
   */
  cleanup(peerId: string): void {
    // 清理发送方状态
    for (const [dataId, state] of this.sendingStates.entries()) {
      if (state.peerId === peerId) {
        if (state.notifyTimer) {
          clearInterval(state.notifyTimer);
        }
        this.sendingStates.delete(dataId);
      }
    }

    // 清理接收方状态
    for (const [key, state] of this.receivingStates.entries()) {
      if (state.peerId === peerId) {
        this.receivingStates.delete(key);
      }
    }

    // 清理版本号
    for (const key of this.versions.keys()) {
      if (key.startsWith(peerId + '_')) {
        this.versions.delete(key);
      }
    }
  }

  /**
   * 销毁协议实例
   */
  destroy(): void {
    // 清理所有定时器
    for (const state of this.sendingStates.values()) {
      if (state.notifyTimer) {
        clearInterval(state.notifyTimer);
      }
    }

    // 清理所有状态
    this.sendingStates.clear();
    this.receivingStates.clear();
    this.versions.clear();
    this.handlers.clear();
  }
}
