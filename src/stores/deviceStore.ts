import { defineStore } from 'pinia';
import { ref, computed, triggerRef } from 'vue';
import type { OnlineDevice } from '../types';

const DEVICE_STORAGE_KEY = 'discovered_devices';
const OFFLINE_THRESHOLD = 10 * 60 * 1000; // 10分钟无心跳视为离线
const EXPIRY_DAYS = 3; // 3天后删除
const EXPIRY_MS = EXPIRY_DAYS * 24 * 60 * 60 * 1000;

/**
 * 设备持久化 Store
 * 负责管理发现中心的设备列表，支持：
 * - localStorage 持久化
 * - 自动清理超过3天未在线的设备
 * - 定时更新设备在线状态
 */
export const useDeviceStore = defineStore('device', () => {
  // 设备列表 Map<peerId, OnlineDevice>
  const devices = ref<Map<string, OnlineDevice>>(new Map());

  // 定时器引用
  let heartbeatTimer: number | null = null;

  /**
   * 从 localStorage 加载设备列表
   */
  function loadDevices() {
    try {
      const stored = localStorage.getItem(DEVICE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        devices.value = new Map(Object.entries(parsed));
        console.log(`[DeviceStore] Loaded ${devices.value.size} devices from storage`);
      }
    } catch (e) {
      console.error('[DeviceStore] Failed to load devices:', e);
    }
  }

  /**
   * 保存设备列表到 localStorage
   */
  function saveDevices() {
    try {
      const obj = Object.fromEntries(devices.value);
      localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.error('[DeviceStore] Failed to save devices:', e);
    }
  }

  /**
   * 获取所有设备
   */
  const allDevices = computed(() => {
    return Array.from(devices.value.values());
  });

  /**
   * 获取在线设备
   */
  const onlineDevices = computed(() => {
    const now = Date.now();
    return allDevices.value.filter(
      (d) => now - d.lastHeartbeat < OFFLINE_THRESHOLD
    );
  });

  /**
   * 获取离线设备
   */
  const offlineDevices = computed(() => {
    const now = Date.now();
    return allDevices.value.filter(
      (d) => now - d.lastHeartbeat >= OFFLINE_THRESHOLD
    );
  });

  /**
   * 添加或更新设备
   */
  function addOrUpdateDevice(device: OnlineDevice) {
    const existing = devices.value.get(device.peerId);
    const now = Date.now();

    if (existing) {
      // 更新现有设备
      existing.username = device.username;
      existing.avatar = device.avatar;
      existing.lastHeartbeat = device.lastHeartbeat;
      existing.isOnline = now - device.lastHeartbeat < OFFLINE_THRESHOLD;
    } else {
      // 添加新设备
      devices.value.set(device.peerId, {
        ...device,
        firstDiscovered: device.firstDiscovered || now,
        isOnline: true,
      });
    }

    saveDevices();
  }

  /**
   * 获取指定设备
   */
  function getDevice(peerId: string): OnlineDevice | undefined {
    return devices.value.get(peerId);
  }

  /**
   * 更新设备心跳时间
   */
  function updateHeartbeat(peerId: string) {
    const device = devices.value.get(peerId);
    if (device) {
      device.lastHeartbeat = Date.now();
      device.isOnline = true;
      saveDevices();
    }
  }

  /**
   * 更新设备在线状态
   */
  function updateDeviceOnlineStatus(peerId: string, isOnline: boolean) {
    const device = devices.value.get(peerId);
    if (device) {
      device.isOnline = isOnline;
      if (isOnline) {
        device.lastHeartbeat = Date.now();
      }
      saveDevices();
      // 手动触发响应式更新
      triggerRef(devices);
    }
  }

  /**
   * 批量添加设备
   */
  function addDevices(deviceList: OnlineDevice[]) {
    const now = Date.now();
    deviceList.forEach((device) => {
      const existing = devices.value.get(device.peerId);
      if (existing) {
        existing.lastHeartbeat = Math.max(existing.lastHeartbeat, device.lastHeartbeat);
        existing.isOnline = now - existing.lastHeartbeat < OFFLINE_THRESHOLD;
      } else {
        devices.value.set(device.peerId, {
          ...device,
          firstDiscovered: now,
          isOnline: true,
        });
      }
    });
    saveDevices();
  }

  /**
   * 删除指定设备
   */
  function removeDevice(peerId: string) {
    if (devices.value.delete(peerId)) {
      saveDevices();
      return true;
    }
    return false;
  }

  /**
   * 清理超过3天未在线的设备
   */
  function cleanupExpiredDevices() {
    const now = Date.now();
    const toDelete: string[] = [];

    devices.value.forEach((device, peerId) => {
      // 检查是否超过3天未在线
      if (now - device.lastHeartbeat > EXPIRY_MS) {
        toDelete.push(peerId);
      }
    });

    toDelete.forEach((peerId) => {
      devices.value.delete(peerId);
      console.log(`[DeviceStore] Removed expired device: ${peerId}`);
    });

    if (toDelete.length > 0) {
      saveDevices();
    }

    return toDelete.length;
  }

  /**
   * 更新所有设备的在线状态
   */
  function updateOnlineStatus() {
    const now = Date.now();
    devices.value.forEach((device) => {
      device.isOnline = now - device.lastHeartbeat < OFFLINE_THRESHOLD;
    });
    saveDevices();
  }

  /**
   * 启动心跳定时器（每10分钟）
   */
  function startHeartbeatTimer(
    onCheck: (device: OnlineDevice) => Promise<boolean>
  ) {
    if (heartbeatTimer !== null) {
      return; // 已经启动
    }

    // 立即执行一次清理
    cleanupExpiredDevices();

    // 每10分钟执行一次心跳检查
    heartbeatTimer = window.setInterval(async () => {
      console.log('[DeviceStore] Running heartbeat check...');
      const now = Date.now();
      const checkedDevices: OnlineDevice[] = [];

      // 收集所有设备进行心跳检查（向所有已知设备发起在线检查）
      devices.value.forEach((device) => {
        // 向所有设备发起心跳检查
        checkedDevices.push(device);
      });

      // 异步检查每个设备
      for (const device of checkedDevices) {
        try {
          const isOnline = await onCheck(device);
          if (isOnline) {
            updateHeartbeat(device.peerId);
          } else {
            // 设备离线，更新状态
            const dev = devices.value.get(device.peerId);
            if (dev) {
              dev.isOnline = false;
            }
          }
        } catch (e) {
          // 检查失败，标记为离线
          const dev = devices.value.get(device.peerId);
          if (dev) {
            dev.isOnline = false;
          }
        }
      }

      // 更新在线状态
      updateOnlineStatus();

      // 清理过期设备
      cleanupExpiredDevices();
    }, 10 * 60 * 1000); // 10分钟

    console.log('[DeviceStore] Heartbeat timer started');
  }

  /**
   * 停止心跳定时器
   */
  function stopHeartbeatTimer() {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      console.log('[DeviceStore] Heartbeat timer stopped');
    }
  }

  /**
   * 清空所有设备
   */
  function clearAll() {
    devices.value.clear();
    saveDevices();
  }

  return {
    devices,
    allDevices,
    onlineDevices,
    offlineDevices,
    loadDevices,
    addOrUpdateDevice,
    getDevice,
    updateHeartbeat,
    updateDeviceOnlineStatus,
    addDevices,
    removeDevice,
    cleanupExpiredDevices,
    updateOnlineStatus,
    startHeartbeatTimer,
    stopHeartbeatTimer,
    clearAll,
  };
});
