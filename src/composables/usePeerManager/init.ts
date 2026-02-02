import { PeerHttpUtil } from '../../util/PeerHttpUtil';
import { networkLogDB } from '../../util/networkLogDB';
import { useUserStore } from '../../stores/userStore';
import { useDeviceStore } from '../../stores/deviceStore';
import {
  setPeerInstance,
  peerInstance,
  reconnectTimer,
  setReconnectTimer,
  setIsReconnecting,
  isReconnecting,
  isConnected,
} from './state';
import { registerProtocolHandlers } from './handlers';
import { createMessageHandler } from './messaging';

/**
 * 初始化和连接管理模块
 */

/**
 * 停止自动重连
 */
export function stopReconnect() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    setReconnectTimer(null);
    console.log('[Peer] Auto-reconnect stopped');
  }
  setIsReconnecting(false);
}

/**
 * 开始自动重连
 */
export function startReconnect(initFn: () => Promise<PeerHttpUtil>) {
  if (isReconnecting) {
    return; // 已经在重连中
  }

  setIsReconnecting(true);
  console.log('[Peer] Starting auto-reconnect in 10 seconds...');

  setReconnectTimer(
    window.setTimeout(async () => {
      console.log('[Peer] Attempting to reconnect...');

      try {
        // 重新初始化连接
        await initFn();
        console.log('[Peer] Reconnected successfully');
        stopReconnect();
      } catch (error) {
        console.error('[Peer] Reconnect failed:', error);
        // 继续下一次重连
        startReconnect(initFn);
      }
    }, 10000),
  );
}

/**
 * 初始化 Peer 连接
 */
export function createPeer(userStore: ReturnType<typeof useUserStore>): Promise<PeerHttpUtil> {
  return new Promise((resolve, reject) => {
    const deviceStore = useDeviceStore();
    // 性能监控：记录 Peer 初始化开始时间
    const initStartTime = performance.now();
    console.log('[Peer-Performance] ===== Peer 初始化开始 =====');
    console.log('[Peer-Performance] Timestamp:', Date.now());

    const perfLog = (phase: string, message: string) => {
      const now = performance.now();
      const duration = Math.round(now - initStartTime);
      console.log(`[Peer-Performance] [${phase}] +${duration}ms ${message}`);
    };

    perfLog('start', '开始初始化 Peer');

    // 总是重新初始化 peerInstance，确保连接有效
    const oldInstance = peerInstance;
    if (oldInstance) {
      perfLog('destroy-old', '销毁旧的 peerInstance');
      oldInstance.destroy();
      setPeerInstance(null);
    }

    // 优先使用已存储的 PeerId，保持不变
    let peerId = userStore.userInfo.peerId;

    // 如果没有存储的 PeerId，生成新的
    if (!peerId) {
      perfLog('generate-peerid', '生成新的 PeerId');
      // PeerJS ID 不能包含中文字符，需要使用字母数字组合
      // 使用时间戳和随机字符串，确保唯一性
      const timestamp = Date.now().toString(36);
      const randomStr = Math.random().toString(36).substring(2, 11);
      peerId = `peer_${timestamp}_${randomStr}`;
    } else {
      perfLog('reuse-peerid', `复用已存储的 PeerId: ${peerId}`);
    }

    console.log('[Peer] Initializing with PeerId:', peerId, 'at', new Date().toISOString());

    // PeerJS 配置，增加调试信息
    const peerOptions = {
      debug: 2, // 增加调试级别
    };

    perfLog('before-peer-http-util', '准备创建 PeerHttpUtil');
    const createPeerStart = performance.now();
    const instance = new PeerHttpUtil(peerId, peerOptions);
    setPeerInstance(instance);
    perfLog('after-peer-http-util', `PeerHttpUtil 创建完成 (耗时 ${Math.round(performance.now() - createPeerStart)}ms)`);

    // 设置网络日志记录器
    const networkLoggingEnabled = userStore.loadNetworkLogging();
    if (networkLoggingEnabled) {
      perfLog('network-logging', '启用网络日志');
      instance.setNetworkLogger(true, async (log) => {
        try {
          await networkLogDB.addLog(log);
        } catch (error) {
          console.error('[Peer] Failed to save network log:', error);
        }
      });
      console.log('[Peer] Network logging enabled');
    }

    // 用于跟踪是否已经 resolve/reject
    let settled = false;

    // 设置连接超时
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        console.error('[Peer] Connection timeout');
        perfLog('timeout', '连接超时 (30秒)');
        isConnected.value = false;
        reject(new Error('Peer connection timeout'));
      }
    }, 30000); // 30秒超时

    // 注册所有协议处理器（在 'open' 事件前注册，避免错过早期消息）
    perfLog('before-register-protocols', '准备注册协议处理器');
    registerProtocolHandlers(instance);
    perfLog('after-register-protocols', '协议处理器注册完成');

    // 注册消息处理器
    perfLog('before-register-message', '准备注册消息处理器');
    instance.on('message', createMessageHandler());
    perfLog('after-register-message', '消息处理器注册完成');

    // 设置用户信息提供器（用于 Request-Response 协议）
    perfLog('before-set-userinfo-provider', '准备设置用户信息提供器');
    instance.setUserInfoProvider({
      getUsername: () => userStore.userInfo.username || '',
      getAvatar: () => userStore.userInfo.avatar,
      getVersion: () => userStore.userInfo.version || 0,
    });
    perfLog('after-set-userinfo-provider', '用户信息提供器设置完成');

    // 设置在线检查器（用于 Request-Response 协议）
    instance.setOnlineChecker((peerId: string) => {
      const device = deviceStore.getDevice(peerId);
      return device?.isOnline ?? false;
    });
    perfLog('after-set-online-checker', '在线检查器设置完成');

    instance.on('open', (id: string) => {
      if (!settled) {
        const openTime = performance.now();
        settled = true;
        clearTimeout(timeout);
        isConnected.value = true;
        userStore.setPeerId(id);

        const connectionTime = Math.round(openTime - initStartTime);
        console.log('[Peer] Connected with ID:', id);
        perfLog('connected', `Peer 连接成功! 总耗时: ${connectionTime}ms`);
        console.log('[Peer-Performance] ===== Peer 初始化完成 =====');

        // 连接成功，停止自动重连
        stopReconnect();

        resolve(instance);
      }
    });

    // 监听断开连接事件
    instance.on('disconnected', () => {
      console.warn('[Peer] Disconnected from Peer Server');
      isConnected.value = false;
      // 启动自动重连
      startReconnect(createPeer.bind(null, userStore));
    });

    // 监听连接关闭事件
    instance.on('close', () => {
      console.warn('[Peer] Peer connection closed');
      isConnected.value = false;
      // 启动自动重连
      startReconnect(createPeer.bind(null, userStore));
    });

    // 监听底层 PeerJS 错误
    instance.on('error', (error: any) => {
      console.error('[Peer] PeerJS error:', error);
      // 如果是严重的连接错误，reject Promise
      if (
        !settled &&
        (error?.type === 'peer-unavailable' ||
          error?.type === 'network' ||
          error?.type === 'server-error' ||
          error?.type === 'socket-error' ||
          error?.type === 'socket-closed')
      ) {
        settled = true;
        clearTimeout(timeout);
        isConnected.value = false;
        reject(new Error(`Peer connection failed: ${error?.type || 'unknown error'}`));
      }
      // 某些错误可以忽略，如 peer-unavailable（对端离线）
      if (error?.type === 'peer-unavailable') {
        console.log('[Peer] Target peer unavailable:', error);
      }
    });
  });
}
