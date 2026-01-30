/**
 * usePeerManager - Peer 管理主入口
 *
 * 拆分后的模块结构：
 * - state.ts: 模块状态管理
 * - init.ts: 初始化和连接管理
 * - handlers.ts: 协议处理器注册
 * - messaging.ts: 消息发送和处理
 * - bootstrap.ts: 宇宙启动者机制
 * - discovery.ts: 发现中心和设备互相发现
 * - network.ts: 网络加速
 */

import { useChatStore } from '../../stores/chatStore';
import { useUserStore } from '../../stores/userStore';
import { useDeviceStore } from '../../stores/deviceStore';
import type { ChatMessage, MessageType, MessageContent, OnlineDevice } from '../../types';

// 导入状态
import {
  isConnected,
  isBootstrap,
  peerInstance,
  bootstrapPeerInstance,
  setPeerInstance,
  setBootstrapPeerInstance,
  handlers,
} from './state';

// 导入初始化模块
import { createPeer, stopReconnect } from './init';

// 导入协议处理器模块
import { registerProtocolHandlers } from './handlers';

// 导入消息模块
import {
  sendChatMessage,
  sendMessageWithRetry,
  generateMessageId,
  createMessageHandler,
} from './messaging';

// 导入发现中心模块
import {
  queryDiscoveredDevices,
  getDiscoveredDevices,
  getStoredDevices,
  addDiscoveredDevice,
  sendDiscoveryNotification,
  queryUsername,
  checkOnline,
  requestUserInfo,
  requestDeviceList,
  requestAllDeviceLists,
  broadcastUserInfoUpdate,
} from './discovery';

// 导入宇宙启动者模块
import { tryBecomeBootstrap, requestBootstrapDeviceList } from './bootstrap';

// 导入网络加速模块
import {
  setNetworkAccelerationEnabled,
  getNetworkAccelerationEnabled,
  broadcastNetworkAccelerationStatus,
} from './network';

/**
 * usePeerManager 主函数
 */
export function usePeerManager() {
  const chatStore = useChatStore();
  const userStore = useUserStore();
  const deviceStore = useDeviceStore();

  /**
   * 初始化 Peer 连接
   */
  function init(): Promise<any> {
    return createPeer(userStore);
  }

  /**
   * 销毁 Peer 实例
   */
  function destroy() {
    // 停止自动重连
    stopReconnect();

    const instance = peerInstance;
    if (instance) {
      instance.destroy();
      // 清理状态
      setPeerInstance(null);
      // 清理处理器引用
      (handlers as any).message = null;
      (handlers as any).deliveryAck = null;
      (handlers as any).discoveryResponse = null;
      (handlers as any).discoveryNotification = null;
      (handlers as any).onlineCheckQuery = null;
      (handlers as any).onlineCheckResponse = null;
      isConnected.value = false;
    }

    // 清理启动者连接
    const bootstrap = bootstrapPeerInstance;
    if (bootstrap) {
      bootstrap.destroy();
      setBootstrapPeerInstance(null);
      console.log('[Peer] Bootstrap connection destroyed');
    }
  }

  return {
    // 状态
    isConnected,
    isBootstrap,

    // 初始化
    init,
    destroy,

    // 消息
    sendChatMessage,
    sendMessageWithRetry,
    generateMessageId,

    // 发现中心
    queryDiscoveredDevices,
    getDiscoveredDevices,
    getStoredDevices,
    addDiscoveredDevice,
    sendDiscoveryNotification,
    queryUsername,
    checkOnline,

    // 用户信息
    requestUserInfo,

    // 宇宙启动者
    tryBecomeBootstrap,
    requestBootstrapDeviceList,

    // 网络加速
    setNetworkAccelerationEnabled,
    getNetworkAccelerationEnabled,
    broadcastNetworkAccelerationStatus,

    // 设备互相发现
    requestDeviceList,
    requestAllDeviceLists,

    // 用户信息广播
    broadcastUserInfoUpdate,

    // Store 引用
    deviceStore,
  };
}

// 导出类型
export type { ChatMessage, MessageType, MessageContent, OnlineDevice };
