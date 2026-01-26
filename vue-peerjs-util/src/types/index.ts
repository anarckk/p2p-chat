// 消息类型
export type MessageType = 'text' | 'image' | 'file' | 'video' | 'system';

// 消息状态
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'failed';

// 协议消息类型
export type ProtocolMessageType =
  | 'version_notify'           // 版本号通知：发送方通知接收方有新消息版本
  | 'version_request'          // 版本请求：接收方请求指定版本的消息内容
  | 'version_response'         // 版本响应：发送方返回消息内容
  | 'delivery_ack'             // 送达确认
  | 'discovery_query'          // 发现中心：询问在线设备
  | 'discovery_response'       // 发现中心：响应在线设备列表
  | 'discovery_notification'   // 发现中心：通知对端我发现了你
  | 'username_query'           // 查询用户名
  | 'username_response'        // 响应用户名查询
  | 'online_check_query'       // 在线检查：询问设备是否在线
  | 'online_check_response'    // 在线检查：响应在线状态
  | 'user_info_query'          // 查询用户完整信息（包含版本号）
  | 'user_info_response';      // 响应用户完整信息

export interface UserInfo {
  username: string;
  avatar: string | null;
  peerId: string | null;
  version: number; // 用户信息版本号
}

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
  id: string;          // 消息唯一标识
  from: string;        // 发送者 PeerId
  to: string;          // 接收者 PeerId
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

export interface OnlineDevice {
  peerId: string;
  username: string;
  avatar: string | null;
  lastHeartbeat: number;
  isOnline?: boolean; // 设备当前是否在线
  firstDiscovered: number; // 首次发现时间
  userInfoVersion?: number; // 对方的用户信息版本号
}

// 协议消息基础接口
export interface ProtocolMessage {
  type: ProtocolMessageType;
  from: string;
  to: string;
  timestamp: number;
}

// 版本号通知：发送方通知接收方有新消息版本
export interface VersionNotifyProtocol extends ProtocolMessage {
  type: 'version_notify';
  from: string;
  version: number; // 发送方最新的聊天版本号
  msgType: MessageType; // 消息类型
}

// 版本请求：接收方请求指定版本的消息内容
export interface VersionRequestProtocol extends ProtocolMessage {
  type: 'version_request';
  to: string;
  version: number; // 请求的版本号
}

// 版本响应：发送方返回消息内容
export interface VersionResponseProtocol extends ProtocolMessage {
  type: 'version_response';
  from: string;
  version: number;
  message: ChatMessage; // 完整的消息对象
}

// 送达确认
export interface DeliveryAckProtocol extends ProtocolMessage {
  type: 'delivery_ack';
  messageId: string;
}

// 发现中心：询问在线设备
export interface DiscoveryQueryProtocol extends ProtocolMessage {
  type: 'discovery_query';
}

// 发现中心：响应在线设备列表
export interface DiscoveryResponseProtocol extends ProtocolMessage {
  type: 'discovery_response';
  devices: OnlineDevice[];
}

// 发现中心：通知对端我发现了你
export interface DiscoveryNotificationProtocol extends ProtocolMessage {
  type: 'discovery_notification';
  fromUsername: string;
  fromAvatar: string | null;
}

// 查询用户名
export interface UsernameQueryProtocol extends ProtocolMessage {
  type: 'username_query';
}

// 响应用户名查询
export interface UsernameResponseProtocol extends ProtocolMessage {
  type: 'username_response';
  username: string;
  avatar: string | null;
}

// 在线检查：询问设备是否在线
export interface OnlineCheckQueryProtocol extends ProtocolMessage {
  type: 'online_check_query';
  userInfoVersion: number; // 询问者的用户信息版本号
}

// 在线检查：响应在线状态
export interface OnlineCheckResponseProtocol extends ProtocolMessage {
  type: 'online_check_response';
  isOnline: boolean;
  username: string;
  avatar: string | null;
  userInfoVersion: number; // 响应者的用户信息版本号
}

// 查询用户完整信息
export interface UserInfoQueryProtocol extends ProtocolMessage {
  type: 'user_info_query';
}

// 响应用户完整信息
export interface UserInfoResponseProtocol extends ProtocolMessage {
  type: 'user_info_response';
  username: string;
  avatar: string | null;
  version: number;
}

// 联合类型
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
  | UserInfoResponseProtocol;
