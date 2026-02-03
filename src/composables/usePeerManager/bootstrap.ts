import type { OnlineDevice } from '../../types';
import { useDeviceStore } from '../../stores/deviceStore';
import { useUserStore } from '../../stores/userStore';
import { commLog } from '../../util/logger';
import { setBootstrapPeerInstance, isBootstrap } from './state';
import { getPeerServerConfig } from '../../config/peer';
import Peer from 'peerjs';

/**
 * 宇宙启动者机制模块
 */

/**
 * 尝试成为宇宙启动者
 * 使用固定的 peerId 尝试连接，如果成功则成为启动者并保持连接
 */
export async function tryBecomeBootstrap(): Promise<boolean> {
  const UNIVERSE_BOOTSTRAP_ID = 'UNIVERSE-BOOTSTRAP-PEER-ID-001';
  const deviceStore = useDeviceStore();
  const userStore = useUserStore();

  console.log('[Peer] Trying to become universe bootstrap with ID:', UNIVERSE_BOOTSTRAP_ID);
  commLog.universeBootstrap.connecting();

  // 性能监控：记录启动者初始化开始时间
  const bootstrapStartTime = performance.now();
  console.log('[Bootstrap-Performance] ===== 尝试成为宇宙启动者 =====');

  const perfLog = (phase: string, message: string) => {
    const now = performance.now();
    const duration = Math.round(now - bootstrapStartTime);
    console.log(`[Bootstrap-Performance] [${phase}] +${duration}ms ${message}`);
  };

  perfLog('start', '开始尝试成为宇宙启动者');

  // 添加随机延迟（0-1000ms），避免多设备同时竞争启动者
  const randomDelay = Math.floor(Math.random() * 1000);
  if (randomDelay > 0) {
    console.log('[Peer] Adding random delay before bootstrap attempt:', randomDelay, 'ms');
    perfLog('random-delay', `添加随机延迟 ${randomDelay}ms 避免竞争`);
    await new Promise(resolve => setTimeout(resolve, randomDelay));
  }

  return new Promise((resolve) => {
    // 如果已经是启动者，直接返回
    let bootstrapPeerInstance = (globalThis as any).__bootstrapPeerInstance;
    if (bootstrapPeerInstance) {
      console.log('[Peer] Already is bootstrap');
      perfLog('already-bootstrap', '已经是启动者');
      resolve(true);
      return;
    }

    // 设置超时，3秒内如果连接成功则说明没有其他启动者
    const successTimeout = setTimeout(() => {
      commLog.universeBootstrap.success({ peerId: UNIVERSE_BOOTSTRAP_ID });
      console.log('[Peer] UNIVERSE-BOOTSTRAP-PEER-ID-001: Became the universe bootstrap! Keeping connection...');
      perfLog('success', '成为宇宙启动者成功 (3秒超时未被触发)');
      isBootstrap.value = true;
      // 不销毁连接，保持启动者状态
      resolve(true);
    }, 3000);

    // 尝试创建 peer
    try {
      perfLog('before-create-peer', '准备创建 Bootstrap Peer');
      const createPeerStart = performance.now();

      // 打印 peer server 地址
      const serverConfig = getPeerServerConfig();
      const serverHost = serverConfig.host || 'PeerJS Cloud (default)';
      const serverPort = serverConfig.port;
      const serverPath = serverConfig.path;
      const serverUrl = serverPort ? `${serverHost}:${serverPort}${serverPath}` : `${serverHost}${serverPath}`;
      console.log('[Peer-Bootstrap] Connecting to Peer Server:', serverUrl);

      bootstrapPeerInstance = new Peer(UNIVERSE_BOOTSTRAP_ID, serverConfig);
      (globalThis as any).__bootstrapPeerInstance = bootstrapPeerInstance;
      setBootstrapPeerInstance(bootstrapPeerInstance);
      perfLog('after-create-peer', `Bootstrap Peer 创建完成 (耗时 ${Math.round(performance.now() - createPeerStart)}ms)`);

      bootstrapPeerInstance.on('open', (id: string) => {
        // 连接成功，说明我们是第一个启动者
        const openTime = performance.now();
        clearTimeout(successTimeout);
        commLog.universeBootstrap.success({ peerId: UNIVERSE_BOOTSTRAP_ID });
        console.log('[Peer] UNIVERSE-BOOTSTRAP-PEER-ID-001: Became the universe bootstrap! ID:', id);
        perfLog('connected', `成为宇宙启动者成功! 连接耗时: ${Math.round(openTime - bootstrapStartTime)}ms`);
        isBootstrap.value = true;

        // 监听设备列表请求
        bootstrapPeerInstance!.on('connection', (conn: any) => {
          conn.on('data', (data: any) => {
            if (data && data.type === 'device_list_request') {
              console.log('[Peer-Bootstrap] Received device list request from:', data.from, 'realPeerId:', data.realPeerId, 'username:', data.username);
              commLog.deviceDiscovery.requestReceived({ from: data.from });

              // 如果请求者携带了真实 Peer ID，将其加入设备列表
              if (data.realPeerId && data.realPeerId !== userStore.myPeerId) {
                const requesterDevice: OnlineDevice = {
                  peerId: data.realPeerId,
                  username: data.username || data.realPeerId,
                  avatar: data.avatar || null,
                  lastHeartbeat: Date.now(),
                  firstDiscovered: Date.now(),
                  isOnline: true,
                };
                deviceStore.addOrUpdateDevice(requesterDevice);
                console.log('[Peer-Bootstrap] Added requester to device list:', data.realPeerId, 'username:', data.username);
              }

              // 响应我的设备列表
              const devices = deviceStore.allDevices;
              const response = {
                type: 'device_list_response',
                from: UNIVERSE_BOOTSTRAP_ID,
                to: data.from,
                timestamp: Date.now(),
                devices,
                isBootstrap: true,
                realPeerId: userStore.myPeerId, // 宇宙启动者的真实 PeerID
                username: userStore.userInfo.username, // 宇宙启动者的真实用户名
                avatar: userStore.userInfo.avatar, // 宇宙启动者的头像
              };

              conn.send(response);
              commLog.deviceDiscovery.responseSent({ to: data.from, deviceCount: devices.length });
              console.log('[Peer-Bootstrap] Sent device list with', devices.length, 'devices');
            }
          });
        });

        console.log('[Peer-Bootstrap] Listening for device list requests...');
        resolve(true);
      });

      bootstrapPeerInstance.on('error', (error: any) => {
        if (!bootstrapPeerInstance) {
          // 已经被清理了
          return;
        }

        const errorTime = performance.now();
        clearTimeout(successTimeout);
        commLog.universeBootstrap.failed({ error: error?.type });
        console.log('[Peer] UNIVERSE-BOOTSTRAP-PEER-ID-001: Bootstrap already exists, requesting device list...');
        perfLog('error', `Bootstrap 已存在，连接失败 (耗时 ${Math.round(errorTime - bootstrapStartTime)}ms)`);
        isBootstrap.value = false;

        // 清理失败的连接
        if (bootstrapPeerInstance) {
          bootstrapPeerInstance.destroy();
          bootstrapPeerInstance = null;
          (globalThis as any).__bootstrapPeerInstance = null;
          setBootstrapPeerInstance(null);
        }

        // 向启动者请求设备列表
        requestBootstrapDeviceList(UNIVERSE_BOOTSTRAP_ID).then(() => {
          resolve(false);
        }).catch(() => {
          resolve(false);
        });
      });

      bootstrapPeerInstance.on('disconnected', () => {
        console.warn('[Peer-Bootstrap] Disconnected from server');
      });

      bootstrapPeerInstance.on('close', () => {
        console.log('[Peer-Bootstrap] Connection closed');
        bootstrapPeerInstance = null;
        (globalThis as any).__bootstrapPeerInstance = null;
        setBootstrapPeerInstance(null);
        isBootstrap.value = false;
      });
    } catch (error) {
      clearTimeout(successTimeout);
      console.error('[Peer] Bootstrap error:', error);
      bootstrapPeerInstance = null;
      (globalThis as any).__bootstrapPeerInstance = null;
      setBootstrapPeerInstance(null);
      resolve(false);
    }
  });
}

/**
 * 向宇宙启动者请求设备列表
 * 使用原始 Peer 连接直接与启动者通信
 */
export async function requestBootstrapDeviceList(bootstrapPeerId: string): Promise<void> {
  const deviceStore = useDeviceStore();
  const userStore = useUserStore();

  commLog.universeBootstrap.requestList({ to: bootstrapPeerId });

  return new Promise((resolve) => {
    // 创建一个临时 Peer 连接向启动者请求设备列表
    // 注意：不需要依赖主 peerInstance，因为这是独立的临时连接
    let tempPeer: any = null;
    let conn: any = null;
    let timeoutId: number | null = null;
    let checkPeerIdInterval: number | null = null;

    const cleanup = () => {
      if (conn) {
        conn.close();
        conn = null;
      }
      if (tempPeer) {
        tempPeer.destroy();
        tempPeer = null;
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (checkPeerIdInterval !== null) {
        clearInterval(checkPeerIdInterval);
        checkPeerIdInterval = null;
      }
    };

    // 设置超时
    timeoutId = window.setTimeout(() => {
      console.warn('[Peer] Request bootstrap device list timeout');
      cleanup();
      resolve();
    }, 10000);

    try {
      // 创建临时 Peer 连接
      const serverConfig = getPeerServerConfig();
      const serverHost = serverConfig.host || 'PeerJS Cloud (default)';
      const serverPort = serverConfig.port;
      const serverPath = serverConfig.path;
      const serverUrl = serverPort ? `${serverHost}:${serverPort}${serverPath}` : `${serverHost}${serverPath}`;
      console.log('[Peer-Bootstrap-Request] Connecting to Peer Server:', serverUrl);

      tempPeer = new Peer(serverConfig);

      tempPeer.on('open', (myId: string) => {
        console.log('[Peer] Temp peer connected with ID:', myId);

        // 连接到启动者
        conn = tempPeer.connect(bootstrapPeerId);

        conn.on('open', () => {
          console.log('[Peer] Connected to bootstrap, waiting for myPeerId...');

          // 等待 userStore.myPeerId 已经设置
          // 最多等待 5 秒
          const maxWaitTime = 5000;
          const startTime = Date.now();

          checkPeerIdInterval = window.setInterval(() => {
            if (userStore.myPeerId) {
              clearInterval(checkPeerIdInterval!);
              checkPeerIdInterval = null;

              console.log('[Peer] myPeerId is ready:', userStore.myPeerId);

              // 发送设备列表请求（携带真实 Peer ID）
              const request = {
                type: 'device_list_request',
                from: myId,
                to: bootstrapPeerId,
                timestamp: Date.now(),
                realPeerId: userStore.myPeerId, // 真实 Peer ID
                username: userStore.userInfo.username, // 用户名
                avatar: userStore.userInfo.avatar, // 头像
              };

              console.log('[Peer] Sending device list request with realPeerId:', userStore.myPeerId);

              conn.send(request);
            } else {
              // 检查是否超时
              if (Date.now() - startTime > maxWaitTime) {
                clearInterval(checkPeerIdInterval!);
                checkPeerIdInterval = null;
                console.warn('[Peer] Timeout waiting for myPeerId, sending request without it...');

                // 超时后发送请求（不带真实 Peer ID）
                const request = {
                  type: 'device_list_request',
                  from: myId,
                  to: bootstrapPeerId,
                  timestamp: Date.now(),
                  realPeerId: null,
                  username: null,
                  avatar: null,
                };

                conn.send(request);
              }
            }
          }, 100); // 每 100ms 检查一次
        });

        conn.on('data', (data: any) => {
          if (data && data.type === 'device_list_response') {
            console.log('[Peer] Received device list from bootstrap:', data.devices?.length || 0, 'devices');
            commLog.universeBootstrap.responseList({ deviceCount: data.devices?.length || 0 });

            // 合并到 deviceStore
            if (data.devices && data.devices.length > 0) {
              deviceStore.addDevices(data.devices);
            }

            // 如果响应者是宇宙启动者，添加启动者设备到发现中心（使用真实 PeerID）
            if (data.isBootstrap && data.realPeerId) {
              console.log('[Peer] Bootstrap device has real PeerID:', data.realPeerId);
              // 将宇宙启动者添加到设备列表，标记为启动者
              const bootstrapDevice: OnlineDevice = {
                peerId: data.realPeerId, // 使用真实 PeerID
                username: data.username || '宇宙启动者', // 使用真实用户名
                avatar: data.avatar || null, // 使用真实头像
                lastHeartbeat: Date.now(),
                firstDiscovered: Date.now(),
                isOnline: true,
                isBootstrap: true,
                realPeerId: bootstrapPeerId, // 记录固定 ID
              };
              deviceStore.addOrUpdateDevice(bootstrapDevice);
            }

            cleanup();
            resolve();
          }
        });

        conn.on('error', (error: any) => {
          console.error('[Peer] Bootstrap connection error:', error);
          cleanup();
          resolve();
        });

        conn.on('close', () => {
          cleanup();
          resolve();
        });
      });

      tempPeer.on('error', (error: any) => {
        console.error('[Peer] Temp peer error:', error);
        cleanup();
        resolve();
      });
    } catch (error) {
      console.error('[Peer] Request bootstrap device list error:', error);
      cleanup();
      resolve();
    }
  });
}
