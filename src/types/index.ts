/**
 * 协议类型定义
 *
 * ## 协议架构变更说明
 *
 * 本项目已从"五段式通信协议"迁移到"Request-Response (RR) 协议"架构。
 *
 * ### 废弃协议 (保留以向后兼容)
 * - 五段式协议: version_notify, version_request, version_response, delivery_ack
 * - 相关类型: SendingStage, SendingMessageState, ReceivingStage, ReceivingMessageState
 *
 * ### 新协议架构 (Request-Response)
 * - 所有协议遵循 Request -> Response 模式
 * - 每个请求包含唯一 requestId 用于匹配响应
 * - 支持的协议类型: chat_message, online_check, discovery_notification, device_list, user_info, file_transfer, call
 *
 * ### 数字签名支持
 * - OnlineDevice 新增数字签名相关字段: publicKey, publicKeyVerified, keyExchangeStatus, lastSignature
 * - 用于验证设备身份和防止中间人攻击
 */

// ==================== 基础消息类型 ====================

// 消息类型
export type MessageType = 'text' | 'image' | 'file' | 'video' | 'system';

// 消息状态
export type MessageStatus = 'sending' | 'delivered' | 'failed';

// 文件消息内容
export interface FileContent {
  name: string;
  size: number;
  type: string;
  data: string; // base64 编码
}

// 图片消息内容
export interface ImageContent {
  name: string;
  size: number;
  width?: number;
  height?: number;
  data: string; // base64 编码
}

// 视频消息内容
export interface VideoContent {
  name: string;
  size: number;
  duration?: number;
  width?: number;
  height?: number;
  data: string; // base64 编码
}

// 聊天消息内容
export type MessageContent = string | FileContent | ImageContent | VideoContent;

export interface ChatMessage {
  id: string; // 消息唯一标识
  from: string; // 发送者 PeerId
  to: string; // 接收者 PeerId
  content: MessageContent;
  timestamp: number;
  status: MessageStatus;
  type: MessageType;
  deliveredAt?: number; // 送达时间
  messageStage?: 'notified' | 'requested' | 'delivered'; // 版本号协议阶段
}

export interface Contact {
  peerId: string;
  username: string;
  avatar: string | null;
  online: boolean;
  lastSeen: number;
  unreadCount: number;
  chatVersion: number; // 聊天版本号（用于消息同步）
}

// 待发送消息（包含重试信息）
export interface PendingMessage {
  id: string;
  to: string;
  content: MessageContent;
  timestamp: number;
  retryCount: number;
  type: MessageType;
  maxRetries?: number; // 最大重试次数，默认无限
}

// 用户信息
export interface UserInfo {
  username: string;
  avatar: string | null;
  peerId: string | null;
  version: number; // 用户信息版本号
}

// 在线设备信息（扩展数字签名支持）
export interface OnlineDevice {
  peerId: string;
  username: string;
  avatar: string | null;
  lastHeartbeat: number;
  isOnline?: boolean; // 设备当前是否在线
  firstDiscovered: number; // 首次发现时间
  userInfoVersion?: number; // 对方的用户信息版本号
  networkAccelerationEnabled?: boolean; // 是否开启网络加速
  isBootstrap?: boolean; // 是否是宇宙启动者
  realPeerId?: string; // 宇宙启动者的真实 PeerID（如果该设备是宇宙启动者）
  // 数字签名相关字段
  publicKey?: string; // 设备公钥（用于验证身份）
  publicKeyVerified?: boolean; // 公钥是否已验证
  keyExchangeStatus?: 'none' | 'pending' | 'exchanged' | 'verified' | 'compromised'; // 密钥交换状态
  lastSignature?: string; // 最后一次通信的数字签名
}

// ==================== 废弃协议类型 (保留以向后兼容) ====================

/**
 * @deprecated 已废弃，请使用 RRRequestProtocol 和 RRResponseProtocol
 */
export type ProtocolMessageType =
  | 'version_notify' // 版本号通知：发送方通知接收方有新消息版本
  | 'version_request' // 版本请求：接收方请求指定版本的消息内容
  | 'version_response' // 版本响应：发送方返回消息内容
  | 'delivery_ack' // 送达确认
  | 'discovery_query' // 发现中心：询问在线设备
  | 'discovery_response' // 发现中心：响应在线设备列表
  | 'discovery_notification' // 发现中心：通知对端我发现了你
  | 'username_query' // 查询用户名
  | 'username_response' // 响应用户名查询
  | 'online_check_query' // 在线检查：询问设备是否在线
  | 'online_check_response' // 在线检查：响应在线状态
  | 'user_info_query' // 查询用户完整信息（包含版本号）
  | 'user_info_response' // 响应用户完整信息
  | 'user_info_update' // 用户信息更新通知：主动推送用户信息更新
  | 'relay_message' // 网络加速：请求中转消息
  | 'relay_response' // 网络加速：中转响应
  | 'network_acceleration_status' // 网络加速：状态同步
  | 'device_list_request' // 设备互相发现：请求设备列表
  | 'device_list_response' // 设备互相发现：响应设备列表
  | 'five_stage_notify' // 通用五段式协议：版本号通知
  | 'five_stage_request' // 通用五段式协议：版本请求
  | 'five_stage_response' // 通用五段式协议：版本响应
  | 'five_stage_ack'; // 通用五段式协议：送达确认

/**
 * @deprecated 已废弃，请使用 RRRequestProtocol 和 RRResponseProtocol
 */
export interface ProtocolMessage {
  type: ProtocolMessageType;
  from: string;
  to: string;
  timestamp: number;
}

// ==================== 五段式消息传递协议 (已废弃) ====================

/**
 * @deprecated 已废弃，请使用 RRRequestProtocol 和 RRResponseProtocol
 */
export type SendingStage = 'notifying' | 'requested' | 'delivering' | 'acked';

/**
 * @deprecated 已废弃，请使用 RRRequestProtocol 和 RRResponseProtocol
 */
export interface SendingMessageState {
  messageId: string;
  version: number;
  peerId: string;
  stage: SendingStage;
  notifyCount: number; // 第一段重发次数
  respondCount: number; // 第三段发送次数
  notifiedAt: number;
  requestedAt?: number;
  deliveredAt?: number;
  ackedAt?: number;
  notifyTimer?: ReturnType<typeof setInterval>; // 第一段重发定时器
}

/**
 * @deprecated 已废弃，请使用 RRRequestProtocol 和 RRResponseProtocol
 */
export type ReceivingStage = 'pending' | 'requested' | 'received' | 'acked';

/**
 * @deprecated 已废弃，请使用 RRRequestProtocol 和 RRResponseProtocol
 */
export interface ReceivingMessageState {
  version: number;
  peerId: string;
  stage: ReceivingStage;
  notifiedAt?: number;
  requestedAt?: number;
  receivedAt?: number;
  ackedAt?: number;
}

/**
 * @deprecated 已废弃，请使用 ChatMessageRequest
 */
export interface VersionNotifyProtocol extends ProtocolMessage {
  type: 'version_notify';
  from: string;
  messageId: string; // 消息唯一标识
  version: number; // 发送方最新的聊天版本号
  msgType: MessageType; // 消息类型
  retryCount: number; // 重试次数
}

/**
 * @deprecated 已废弃，请使用 ChatMessageRequest
 */
export interface VersionRequestProtocol extends ProtocolMessage {
  type: 'version_request';
  to: string;
  messageId: string; // 消息唯一标识（用于匹配发送方状态）
  version: number; // 请求的版本号
}

/**
 * @deprecated 已废弃，请使用 ChatMessageResponse
 */
export interface VersionResponseProtocol extends ProtocolMessage {
  type: 'version_response';
  from: string;
  version: number;
  message: ChatMessage; // 完整的消息对象
  responseTime: number; // 响应时间戳
}

/**
 * @deprecated 已废弃，请使用 ChatMessageResponse
 */
export interface DeliveryAckProtocol extends ProtocolMessage {
  type: 'delivery_ack';
  messageId: string; // 消息唯一标识
  version: number; // 版本号（用于匹配发送方状态）
  ackTime: number; // 确认时间戳
}

// ==================== 传统协议类型 (保留以向后兼容) ====================

/**
 * @deprecated 请使用 DeviceListRequest
 */
export interface DiscoveryQueryProtocol extends ProtocolMessage {
  type: 'discovery_query';
}

/**
 * @deprecated 请使用 DiscoveryNotificationResponse
 */
export interface DiscoveryResponseProtocol extends ProtocolMessage {
  type: 'discovery_response';
  devices?: OnlineDevice[]; // 设备列表（用于查询设备列表的响应）
  username?: string; // 用户名（用于发现通知的响应）
  avatar?: string | null; // 头像（用于发现通知的响应）
}

/**
 * @deprecated 请使用 DiscoveryNotificationRequest
 */
export interface DiscoveryNotificationProtocol extends ProtocolMessage {
  type: 'discovery_notification';
  fromUsername: string;
  fromAvatar: string | null;
  profileVersion: number; // 个人信息版本号
}

/**
 * @deprecated 请使用 UserInfoRequest
 */
export interface UsernameQueryProtocol extends ProtocolMessage {
  type: 'username_query';
}

/**
 * @deprecated 请使用 UserInfoResponse
 */
export interface UsernameResponseProtocol extends ProtocolMessage {
  type: 'username_response';
  username: string;
  avatar: string | null;
}

/**
 * @deprecated 请使用 OnlineCheckRequest
 */
export interface OnlineCheckQueryProtocol extends ProtocolMessage {
  type: 'online_check_query';
  userInfoVersion: number; // 询问者的用户信息版本号
}

/**
 * @deprecated 请使用 OnlineCheckResponse
 */
export interface OnlineCheckResponseProtocol extends ProtocolMessage {
  type: 'online_check_response';
  isOnline: boolean;
  username: string;
  avatar: string | null;
  userInfoVersion: number; // 响应者的用户信息版本号
}

/**
 * @deprecated 请使用 UserInfoRequest
 */
export interface UserInfoQueryProtocol extends ProtocolMessage {
  type: 'user_info_query';
}

/**
 * @deprecated 请使用 UserInfoResponse
 */
export interface UserInfoResponseProtocol extends ProtocolMessage {
  type: 'user_info_response';
  username: string;
  avatar: string | null;
  version: number;
}

// ==================== 网络加速协议 (保留以向后兼容) ====================

/**
 * @deprecated 请使用 RRRequest 和 RRResponse 配合网络加速逻辑
 */
export interface RelayMessageProtocol extends ProtocolMessage {
  type: 'relay_message';
  originalFrom: string; // 原始发送者
  targetPeerId: string; // 目标接收者
  payload: AnyProtocol; // 要中转的实际协议消息
  sequenceId: string; // 序列号，用于匹配响应
}

/**
 * @deprecated 请使用 RRRequest 和 RRResponse 配合网络加速逻辑
 */
export interface RelayResponseProtocol extends ProtocolMessage {
  type: 'relay_response';
  originalFrom: string; // 原始发送者
  targetPeerId: string; // 目标接收者
  payload: AnyProtocol | null; // 中转返回的响应
  success: boolean; // 是否成功
  errorMessage?: string; // 错误信息
  sequenceId: string; // 序列号，用于匹配请求
}

/**
 * @deprecated 请使用 RRRequest 和 RRResponse 配合网络加速逻辑
 */
export interface NetworkAccelerationStatusProtocol extends ProtocolMessage {
  type: 'network_acceleration_status';
  enabled: boolean; // 是否开启网络加速
}

// ==================== 设备互相发现协议 (保留以向后兼容) ====================

/**
 * @deprecated 请使用 DeviceListRequest
 */
export interface DeviceListRequestProtocol extends ProtocolMessage {
  type: 'device_list_request';
}

/**
 * @deprecated 请使用 DeviceListResponse
 */
export interface DeviceListResponseProtocol extends ProtocolMessage {
  type: 'device_list_response';
  devices: OnlineDevice[]; // 请求者的在线设备列表
  isBootstrap?: boolean; // 响应者是否是宇宙启动者
  realPeerId?: string; // 如果响应者是宇宙启动者，提供其真实 PeerID
}

// ==================== 废弃协议联合类型 ====================

/**
 * @deprecated 已废弃，请使用 RRRequest 或 RRResponse
 */
export type AnyProtocol =
  | VersionNotifyProtocol
  | VersionRequestProtocol
  | VersionResponseProtocol
  | DeliveryAckProtocol
  | DiscoveryQueryProtocol
  | DiscoveryResponseProtocol
  | DiscoveryNotificationProtocol
  | UsernameQueryProtocol
  | UsernameResponseProtocol
  | OnlineCheckQueryProtocol
  | OnlineCheckResponseProtocol
  | UserInfoQueryProtocol
  | UserInfoResponseProtocol
  | RelayMessageProtocol
  | RelayResponseProtocol
  | NetworkAccelerationStatusProtocol
  | DeviceListRequestProtocol
  | DeviceListResponseProtocol;

// ==================== Request-Response 协议架构 (新) ====================

// Request-Response 协议类型
export type RRRequestProtocolType =
  | 'chat_message_request'
  | 'online_check_request'
  | 'discovery_notification_request'
  | 'device_list_request'
  | 'user_info_request'
  | 'file_transfer_request'
  | 'call_request'
  | 'key_exchange_request';

export type RRResponseProtocolType =
  | 'chat_message_response'
  | 'online_check_response'
  | 'discovery_notification_response'
  | 'device_list_response'
  | 'user_info_response'
  | 'file_transfer_response'
  | 'call_response'
  | 'key_exchange_response';

// 基础请求协议（扩展支持数字签名）
export interface RRRequest {
  type: RRRequestProtocolType;
  requestId: string;
  from: string;
  to: string;
  timestamp: number;
  payload?: unknown;
  signature?: string; // 数字签名（发送方使用私钥签名）
}

// 基础响应协议（扩展支持数字签名）
export interface RRResponse {
  type: RRResponseProtocolType;
  requestId: string;
  from: string;
  to: string;
  timestamp: number;
  success: boolean;
  error?: string;
  data?: unknown;
  signature?: string; // 数字签名（响应方使用私钥签名）
}

// ==================== 聊天消息协议 ====================

export interface ChatMessageRequest extends RRRequest {
  type: 'chat_message_request';
  message: ChatMessage;
}

export interface ChatMessageResponse extends RRResponse {
  type: 'chat_message_response';
  deliveredAt: number;
}

// ==================== 在线检查协议 ====================

export interface OnlineCheckRequest extends RRRequest {
  type: 'online_check_request';
}

export interface OnlineCheckResponse extends RRResponse {
  type: 'online_check_response';
  isOnline: boolean;
  username: string;
  avatar: string | null;
  userInfoVersion: number;
  publicKey?: string;
}

// ==================== 发现通知协议 ====================

export interface DiscoveryNotificationRequest extends RRRequest {
  type: 'discovery_notification_request';
  fromUsername: string;
  fromAvatar: string | null;
  profileVersion: number;
  publicKey: string;
}

export interface DiscoveryNotificationResponse extends RRResponse {
  type: 'discovery_notification_response';
}

// ==================== 设备列表协议 ====================

export interface DeviceListRequest extends RRRequest {
  type: 'device_list_request';
}

export interface DeviceListResponse extends RRResponse {
  type: 'device_list_response';
  devices: OnlineDevice[];
  isBootstrap?: boolean;
  realPeerId?: string;
}

// ==================== 用户信息协议 ====================

export interface UserInfoRequest extends RRRequest {
  type: 'user_info_request';
}

export interface UserInfoResponse extends RRResponse {
  type: 'user_info_response';
  username: string;
  avatar: string | null;
  version: number;
}

// ==================== 文件传输协议 ====================

export interface FileTransferRequest extends RRRequest {
  type: 'file_transfer_request';
  file: {
    name: string;
    size: number;
    type: string;
    chunks: number;
  };
  fileId: string;
  chunkIndex: number;
  chunkData: string; // base64
}

export interface FileTransferResponse extends RRResponse {
  type: 'file_transfer_response';
  receivedChunk: number;
}

// ==================== 通话协议 ====================

export interface CallRequest extends RRRequest {
  type: 'call_request';
  callType: 'audio' | 'video' | 'data_channel';
  offer?: RTCSessionDescriptionInit;
}

export interface CallResponse extends RRResponse {
  type: 'call_response';
  accepted: boolean;
  answer?: RTCSessionDescriptionInit;
}

export interface CallSignalling {
  type: 'call_signalling';
  from: string;
  to: string;
  action: 'offer' | 'answer' | 'ice-candidate';
  data: RTCSessionDescriptionInit | RTCIceCandidateInit;
  timestamp: number;
}

// ==================== 公钥交换协议 ====================

export interface KeyExchangeRequest extends RRRequest {
  type: 'key_exchange_request';
  publicKey: string;
  timestamp: number;
}

export interface KeyExchangeResponse extends RRResponse {
  type: 'key_exchange_response';
  publicKey: string;
  timestamp: number;
}

// ==================== RR 协议联合类型 ====================

export type AnyRRRequest =
  | ChatMessageRequest
  | OnlineCheckRequest
  | DiscoveryNotificationRequest
  | DeviceListRequest
  | UserInfoRequest
  | FileTransferRequest
  | CallRequest
  | KeyExchangeRequest;

export type AnyRRResponse =
  | ChatMessageResponse
  | OnlineCheckResponse
  | DiscoveryNotificationResponse
  | DeviceListResponse
  | UserInfoResponse
  | FileTransferResponse
  | CallResponse
  | KeyExchangeResponse;

export type AnyRRProtocol = AnyRRRequest | AnyRRResponse;
