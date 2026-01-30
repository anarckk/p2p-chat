import { peerInstance } from './state';
import { commLog } from '../../util/logger';
import { useDeviceStore } from '../../stores/deviceStore';

/**
 * 网络加速模块
 */

/**
 * 设置网络加速开关
 */
export function setNetworkAccelerationEnabled(enabled: boolean): void {
  const instance = peerInstance;
  if (instance) {
    instance.setNetworkAccelerationEnabled(enabled);
    if (enabled) {
      commLog.networkAcceleration.enabled();
    } else {
      commLog.networkAcceleration.disabled();
    }
  }
}

/**
 * 获取网络加速开关状态
 */
export function getNetworkAccelerationEnabled(): boolean {
  const instance = peerInstance;
  return instance?.getNetworkAccelerationEnabled() || false;
}

/**
 * 发送网络加速状态给所有在线设备
 */
export async function broadcastNetworkAccelerationStatus(): Promise<void> {
  const instance = peerInstance;
  if (!instance) {
    return;
  }

  const deviceStore = useDeviceStore();
  const devices = deviceStore.allDevices;
  const enabled = instance.getNetworkAccelerationEnabled();

  const promises = devices.map((device: any) => {
    if (device.isOnline) {
      return instance
        .sendNetworkAccelerationStatus(device.peerId)
        .catch(() => {
          // 忽略错误
        });
    }
    return Promise.resolve();
  });

  await Promise.allSettled(promises);
}
