import type { OnlineDevice } from '../../types';
import { useChatStore } from '../../stores/chatStore';
import { useDeviceStore } from '../../stores/deviceStore';
import { useUserStore } from '../../stores/userStore';
import { commLog } from '../../util/logger';
import { peerInstance } from './state';

/**
 * 发现中心和用户信息模块
 */

/**
 * 请求用户完整信息
 */
export async function requestUserInfo(peerId: string): Promise<any> {
  const instance = peerInstance;
  const deviceStore = useDeviceStore();
  const chatStore = useChatStore();

  if (!instance) {
    return null;
  }

  commLog.sync.requestInfo({ to: peerId });

  try {
    const userInfo = await instance.queryUserInfo(peerId);
    if (userInfo) {
      console.log(
        '[Peer] Got user info for ' + peerId + ': ' + JSON.stringify({
          username: userInfo.username,
          version: userInfo.version,
        }),
      );
      // 更新设备信息（保留原有的 firstDiscovered）
      const existingDevice = deviceStore.getDevice(peerId);
      deviceStore.addOrUpdateDevice({
        peerId,
        username: userInfo.username,
        avatar: userInfo.avatar,
        lastHeartbeat: Date.now(),
        firstDiscovered: existingDevice?.firstDiscovered || Date.now(),
        userInfoVersion: userInfo.version,
      });

      // 同时更新联系人信息
      const contact = chatStore.getContact(peerId);
      if (contact) {
        chatStore.addOrUpdateContact({
          ...contact,
          username: userInfo.username,
          avatar: userInfo.avatar,
          lastSeen: Date.now(),
        });
      }

      return userInfo;
    }
  } catch (error) {
    console.error('[Peer] Request user info error:', error);
  }
  return null;
}

/**
 * 发现中心：查询指定节点已发现的设备
 */
export async function queryDiscoveredDevices(peerId: string): Promise<OnlineDevice[]> {
  const instance = peerInstance;
  const deviceStore = useDeviceStore();

  if (!instance) {
    return [];
  }

  try {
    commLog.discovery.add({ peerId });
    const devices = await instance.queryDiscoveredDevices(peerId);
    // 同时更新到 deviceStore
    if (devices.length > 0) {
      deviceStore.addDevices(devices);
    }
    return devices;
  } catch (error) {
    console.error('[Peer] Query discovered devices error:', error);
    return [];
  }
}

/**
 * 发现中心：获取已发现的设备列表
 */
export function getDiscoveredDevices(): OnlineDevice[] {
  const instance = peerInstance;
  if (!instance) {
    return [];
  }
  return instance.getDiscoveredDevices();
}

/**
 * 发现中心：获取 deviceStore 中的设备列表
 */
export function getStoredDevices(): OnlineDevice[] {
  const deviceStore = useDeviceStore();
  return deviceStore.allDevices;
}

/**
 * 发现中心：添加已发现的设备
 */
export function addDiscoveredDevice(device: OnlineDevice) {
  const instance = peerInstance;
  const deviceStore = useDeviceStore();

  if (instance) {
    instance.addDiscoveredDevice(device);
    // 同时添加到 deviceStore
    deviceStore.addOrUpdateDevice(device);
  }
}

/**
 * 发现中心：发送发现通知给对端
 */
export async function sendDiscoveryNotification(peerId: string): Promise<void> {
  const instance = peerInstance;
  const userStore = useUserStore();

  if (!instance) {
    console.warn('[Peer] sendDiscoveryNotification: peerInstance is null');
    return;
  }

  try {
    console.log('[Peer] Sending discovery notification to:', peerId, 'username:', userStore.userInfo.username);
    commLog.discovery.notify({ to: peerId, username: userStore.userInfo.username });
    await instance.sendDiscoveryNotification(peerId, userStore.userInfo.username || '', userStore.userInfo.avatar, userStore.userInfo.version || 0);
    console.log('[Peer] Discovery notification sent successfully to:', peerId);
  } catch (error) {
    console.error('[Peer] Send discovery notification error:', error);
  }
}

/**
 * 发现中心：查询对端用户名
 */
export async function queryUsername(peerId: string): Promise<{ username: string; avatar: string | null } | null> {
  const instance = peerInstance;

  if (!instance) {
    console.warn('[Peer] queryUsername: peerInstance is null');
    return null;
  }

  try {
    console.log('[Peer] Querying username for:', peerId);
    commLog.discovery.query({ from: peerId });
    const result = await instance.queryUsername(peerId);
    console.log('[Peer] Query username result:', result);
    return result;
  } catch (error) {
    console.error('[Peer] Query username error: ' + String(error));
    return null;
  }
}

/**
 * 在线检查：查询指定设备是否在线（带上版本号）
 * @param peerId - 目标设备 PeerId
 * @param timeoutMs - 超时时间（毫秒），默认 5000ms
 */
export async function checkOnline(peerId: string, timeoutMs: number = 5000): Promise<boolean> {
  const instance = peerInstance;
  const userStore = useUserStore();

  if (!instance) {
    return false;
  }

  try {
    commLog.heartbeat.check({ to: peerId, version: userStore.userInfo.version });
    const result = await instance.checkOnline(peerId, userStore.userInfo.username || '', userStore.userInfo.avatar, userStore.userInfo.version, timeoutMs);
    if (result !== null && result.isOnline) {
      commLog.heartbeat.online({ from: peerId });
      return true;
    }
    if (result !== null && !result.isOnline) {
      commLog.heartbeat.offline({ peerId });
    }
    return result !== null && result.isOnline;
  } catch (error) {
    console.error('[Peer] Check online error: ' + String(error));
    commLog.heartbeat.offline({ peerId });
    return false;
  }
}

// ==================== 设备互相发现 ====================

/**
 * 请求指定设备的在线设备列表
 */
export async function requestDeviceList(peerId: string): Promise<OnlineDevice[]> {
  const instance = peerInstance;
  const deviceStore = useDeviceStore();

  if (!instance) {
    return [];
  }

  commLog.deviceDiscovery.requestSent({ to: peerId });

  try {
    const devices = await instance.requestDeviceList(peerId);
    // 合并到 deviceStore
    if (devices.length > 0) {
      deviceStore.addDevices(devices);
    }
    return devices;
  } catch (error) {
    console.error('[Peer] Request device list error:', error);
    return [];
  }
}

/**
 * 向所有在线设备请求设备列表
 */
export async function requestAllDeviceLists(): Promise<void> {
  const instance = peerInstance;
  const deviceStore = useDeviceStore();

  if (!instance) {
    return;
  }

  const devices = deviceStore.allDevices;
  console.log('[Peer] Requesting device lists from ' + devices.length + ' devices');

  // 向所有设备发起请求（包括离线设备），这样才能检测到离线设备是否上线
  const promises = devices.map((device) => {
    return requestDeviceList(device.peerId);
  });

  await Promise.allSettled(promises);
}

/**
 * 广播用户信息更新给所有在线设备
 */
export async function broadcastUserInfoUpdate(): Promise<void> {
  const instance = peerInstance;
  const userStore = useUserStore();
  const deviceStore = useDeviceStore();

  if (!instance) {
    return;
  }

  const devices = deviceStore.allDevices;
  const { username, avatar, version } = userStore.userInfo;

  console.log('[Peer] Broadcasting user info update to', devices.length, 'devices:', { username, version });

  const promises = devices.map((device) => {
    if (device.isOnline) {
      return instance
        .sendUserInfoUpdate(device.peerId, username, avatar, version)
        .catch((error) => {
          console.warn('[Peer] Failed to send user info update to', device.peerId, error);
        });
    }
    return Promise.resolve();
  });

  await Promise.allSettled(promises);
  console.log('[Peer] User info update broadcast completed');
}
