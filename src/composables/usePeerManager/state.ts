import { ref } from 'vue';
import { PeerHttpUtil } from '../../util/PeerHttpUtil';
import Peer from 'peerjs';

/**
 * 模块状态管理
 * 所有模块级别的状态变量集中管理
 */

// Peer 实例
export let peerInstance: PeerHttpUtil | null = null;
export function setPeerInstance(instance: PeerHttpUtil | null): void {
  peerInstance = instance;
}

// 宇宙启动者 Peer 实例
export let bootstrapPeerInstance: Peer | null = null;
export function setBootstrapPeerInstance(instance: Peer | null): void {
  bootstrapPeerInstance = instance;
}

// 协议处理器引用
// 注意：deliveryAck 已废弃，五段式协议已迁移到 Request-Response 协议
export const handlers = {
  message: null as ((data: { from: string; data: any }) => void) | null,
  // deliveryAck 已废弃 - 聊天消息送达确认现在在 chat_message_response 中处理
  discoveryResponse: null as ((protocol: any, from: string) => void) | null,
  discoveryNotification: null as ((protocol: any, from: string) => void) | null,
  // 新协议处理器：同时支持新旧协议类型
  discoveryNotificationRequest: null as ((protocol: any, from: string) => void) | null,
  usernameQuery: null as ((protocol: any, from: string) => void) | null,
  usernameResponse: null as ((protocol: any, from: string) => void) | null,
  onlineCheckQuery: null as ((protocol: any, from: string) => void) | null,
  // 新协议处理器：同时支持新旧协议类型
  onlineCheckRequest: null as ((protocol: any, from: string) => void) | null,
  onlineCheckResponse: null as ((protocol: any, from: string) => void) | null,
  userInfoQuery: null as ((protocol: any, from: string) => void) | null,
  userInfoResponse: null as ((protocol: any, from: string) => void) | null,
  userInfoUpdate: null as ((protocol: any, from: string) => void) | null,
  relayMessage: null as ((protocol: any, from: string) => void) | null,
  relayResponse: null as ((protocol: any, from: string) => void) | null,
  networkAccelerationStatus: null as ((protocol: any, from: string) => void) | null,
  deviceListRequest: null as ((protocol: any, from: string) => void) | null,
  deviceListResponse: null as ((protocol: any, from: string) => void) | null,
};

// 设备互相发现：正在处理的设备集合（避免无限递归）
export const processingDeviceListRequests = new Set<string>();

// 自动重连相关
export let reconnectTimer: number | null = null;
export let isReconnecting = false;
export const RECONNECT_INTERVAL = 10000; // 10秒重连间隔

export function setReconnectTimer(timer: number | null): void {
  reconnectTimer = timer;
}

export function setIsReconnecting(value: boolean): void {
  isReconnecting = value;
}

// 连接状态：模块级别的 ref，确保所有调用共享同一个响应式状态
export const isConnected = ref(false);

// 宇宙启动者状态：模块级别的 ref
export const isBootstrap = ref(false);
