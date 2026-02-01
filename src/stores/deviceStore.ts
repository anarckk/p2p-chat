import { defineStore } from 'pinia';
import { ref, computed, triggerRef } from 'vue';
import type { OnlineDevice } from '../types';
import indexedDBStorage from '../util/indexedDBStorage';

const DEVICE_STORAGE_KEY = 'discovered_devices';
const DEVICE_META_STORAGE_KEY = 'discovered_devices_meta'; // 存储小型元数据
const AVATAR_MIGRATION_KEY = 'avatar_migrated_to_indexeddb'; // 标记是否已迁移头像
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
   * 从存储加载数据（混合策略：localStorage + IndexedDB）
   * 小数据（元数据）→ localStorage
   * 大数据（头像）→ IndexedDB
   */
  async function loadDevices() {
    try {
      // 首次加载时检查是否需要迁移旧数据
      await migrateOldDataIfNeeded();

      // 从 localStorage 加载设备元数据
      const storedMeta = localStorage.getItem(DEVICE_META_STORAGE_KEY);
      if (storedMeta) {
        const parsedMeta = JSON.parse(storedMeta);
        const deviceList: OnlineDevice[] = Object.values(parsedMeta);

        // 从 IndexedDB 批量加载头像
        const avatars = await indexedDBStorage.getAll('avatars');
        const avatarMap = new Map(
          avatars.map((a) => [a.peerId, a.avatar])
        );

        // 合并数据，同时更新在线状态
        const now = Date.now();
        devices.value = new Map(
          deviceList.map((device) => [
            device.peerId,
            {
              ...device,
              avatar: avatarMap.get(device.peerId) || null,
              isOnline: now - device.lastHeartbeat < OFFLINE_THRESHOLD,
            },
          ])
        );

        // 添加调试信息：检查加载后的 isBootstrap 状态
        devices.value.forEach((device, peerId) => {
          console.log('[DeviceStore] Loaded device: ' + peerId + ' isBootstrap=' + device.isBootstrap + ' realPeerId=' + device.realPeerId);
        });

        console.log(`[DeviceStore] Loaded ${devices.value.size} devices from storage (${avatarMap.size} avatars from IndexedDB)`);
        // 加载后更新设备的在线状态
        await updateOnlineStatus();
      }
    } catch (e) {
      console.error('[DeviceStore] Failed to load devices:', e);
    }
  }

  /**
   * 迁移旧数据到新的混合存储策略
   * 只在首次加载时执行一次
   */
  async function migrateOldDataIfNeeded() {
    const hasMigrated = localStorage.getItem(AVATAR_MIGRATION_KEY);
    if (hasMigrated) {
      return; // 已迁移过
    }

    try {
      // 检查是否有旧数据
      const oldData = localStorage.getItem(DEVICE_STORAGE_KEY);
      if (!oldData) {
        localStorage.setItem(AVATAR_MIGRATION_KEY, 'true');
        return;
      }

      const oldDevices: OnlineDevice[] = Object.values(JSON.parse(oldData));
      console.log(`[DeviceStore] 开始迁移 ${oldDevices.length} 个设备到混合存储...`);

      // 分离元数据和头像
      const metadata: Record<string, Omit<OnlineDevice, 'avatar'>> = {};
      const avatarsWithAvatar: Array<{ peerId: string; avatar: string }> = [];

      for (const device of oldDevices) {
        const { avatar, ...meta } = device;
        metadata[device.peerId] = meta;

        // 如果有头像，存储到 IndexedDB
        if (avatar) {
          await indexedDBStorage.set('avatars', {
            id: device.peerId,
            peerId: device.peerId,
            avatar,
          });
          avatarsWithAvatar.push({ peerId: device.peerId, avatar });
        }
      }

      // 保存元数据到 localStorage
      localStorage.setItem(DEVICE_META_STORAGE_KEY, JSON.stringify(metadata));

      // 删除旧数据
      localStorage.removeItem(DEVICE_STORAGE_KEY);

      // 标记迁移完成
      localStorage.setItem(AVATAR_MIGRATION_KEY, 'true');

      console.log(`[DeviceStore] 迁移完成！${avatarsWithAvatar.length} 个头像已移至 IndexedDB`);
    } catch (e) {
      console.error('[DeviceStore] 迁移失败:', e);
    }
  }

  /**
   * 保存设备列表（混合策略：localStorage + IndexedDB）
   * 小数据（元数据）→ localStorage
   * 大数据（头像）→ IndexedDB
   *
   * 注意：isBootstrap 字段不会持久化，每次运行时重新获取
   */
  async function saveDevices() {
    try {
      const metadata: Record<string, Omit<OnlineDevice, 'avatar' | 'isBootstrap'>> = {};

      // 遍历所有设备，分离元数据和头像
      for (const [peerId, device] of devices.value) {
        const { avatar, isBootstrap, ...meta } = device;
        metadata[peerId] = meta;

        // 如果有头像，保存到 IndexedDB
        if (avatar) {
          await indexedDBStorage.set('avatars', {
            id: peerId,
            peerId,
            avatar,
          });
        } else {
          // 如果没有头像，从 IndexedDB 删除
          await indexedDBStorage.delete('avatars', peerId);
        }
      }

      // 保存元数据到 localStorage
      localStorage.setItem(DEVICE_META_STORAGE_KEY, JSON.stringify(metadata));
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
  async function addOrUpdateDevice(device: OnlineDevice) {
    const existing = devices.value.get(device.peerId);
    const now = Date.now();

    if (existing) {
      // 更新现有设备
      existing.username = device.username;
      existing.avatar = device.avatar;
      existing.lastHeartbeat = device.lastHeartbeat;
      existing.isOnline = now - device.lastHeartbeat < OFFLINE_THRESHOLD;
      // 如果设备离线，清除 isBootstrap 状态（因为离线的设备不可能是宇宙启动者）
      if (!existing.isOnline) {
        existing.isBootstrap = false;
        existing.realPeerId = undefined;
      } else {
        // 同步更新 isBootstrap 字段（只在新数据中明确指定时才更新）
        if ('isBootstrap' in device) {
          existing.isBootstrap = device.isBootstrap;
        }
        // 同步更新 realPeerId 字段
        if ('realPeerId' in device) {
          existing.realPeerId = device.realPeerId;
        }
      }
    } else {
      // 添加新设备
      devices.value.set(device.peerId, {
        ...device,
        firstDiscovered: device.firstDiscovered || now,
        isOnline: true,
      });
    }

    await saveDevices();
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
  async function updateHeartbeat(peerId: string) {
    const device = devices.value.get(peerId);
    if (device) {
      device.lastHeartbeat = Date.now();
      device.isOnline = true;
      await saveDevices();
    }
  }

  /**
   * 更新设备在线状态
   */
  async function updateDeviceOnlineStatus(peerId: string, isOnline: boolean) {
    const device = devices.value.get(peerId);
    if (device) {
      const wasBootstrap = device.isBootstrap;
      device.isOnline = isOnline;
      if (isOnline) {
        device.lastHeartbeat = Date.now();
      } else {
        // 设备离线时，清除宇宙启动者相关字段（离线的设备不可能是宇宙启动者）
        if (device.isBootstrap) {
          console.log('[DeviceStore] 设备离线，清除启动者标签: ' + peerId + ' (wasBootstrap: ' + wasBootstrap + ')');
        }
        device.isBootstrap = false;
        device.realPeerId = undefined;
      }
      await saveDevices();
      // 手动触发响应式更新
      triggerRef(devices);
      console.log('[DeviceStore] updateDeviceOnlineStatus: ' + peerId + ' isOnline=' + isOnline + ' (wasBootstrap: ' + wasBootstrap + ', isBootstrap: ' + device.isBootstrap + ')');
    } else {
      console.warn('[DeviceStore] updateDeviceOnlineStatus: device not found: ' + peerId);
    }
  }

  /**
   * 批量添加设备
   */
  async function addDevices(deviceList: OnlineDevice[]) {
    const now = Date.now();
    deviceList.forEach((device) => {
      const existing = devices.value.get(device.peerId);
      if (existing) {
        existing.lastHeartbeat = Math.max(existing.lastHeartbeat, device.lastHeartbeat);
        existing.isOnline = now - existing.lastHeartbeat < OFFLINE_THRESHOLD;
        // 更新用户名和头像（如果响应中有新的值）
        if (device.username) {
          existing.username = device.username;
        }
        if (device.avatar !== undefined) {
          existing.avatar = device.avatar;
        }
        // 同步更新 isBootstrap 字段（如果响应中明确指定了）
        if ('isBootstrap' in device) {
          existing.isBootstrap = device.isBootstrap;
        }
        // 同步更新 realPeerId 字段
        if ('realPeerId' in device) {
          existing.realPeerId = device.realPeerId;
        }
      } else {
        devices.value.set(device.peerId, {
          ...device,
          firstDiscovered: now,
          isOnline: true,
        });
      }
    });
    await saveDevices();
  }

  /**
   * 删除指定设备
   */
  async function removeDevice(peerId: string) {
    if (devices.value.delete(peerId)) {
      // 同时删除 IndexedDB 中的头像
      await indexedDBStorage.delete('avatars', peerId);
      await saveDevices();
      return true;
    }
    return false;
  }

  /**
   * 清理超过3天未在线的设备
   */
  async function cleanupExpiredDevices() {
    const now = Date.now();
    const toDelete: string[] = [];

    devices.value.forEach((device, peerId) => {
      // 检查是否超过3天未在线
      if (now - device.lastHeartbeat > EXPIRY_MS) {
        toDelete.push(peerId);
      }
    });

    for (const peerId of toDelete) {
      devices.value.delete(peerId);
      // 同时删除 IndexedDB 中的头像
      await indexedDBStorage.delete('avatars', peerId);
      console.log(`[DeviceStore] Removed expired device: ${peerId}`);
    }

    if (toDelete.length > 0) {
      await saveDevices();
    }

    return toDelete.length;
  }

  /**
   * 更新所有设备的在线状态
   */
  async function updateOnlineStatus() {
    const now = Date.now();
    devices.value.forEach((device) => {
      device.isOnline = now - device.lastHeartbeat < OFFLINE_THRESHOLD;
    });
    await saveDevices();
    // 手动触发响应式更新
    triggerRef(devices);
  }

  /**
   * 启动心跳定时器
   * @param onCheck - 设备在线检查回调函数
   * @param intervalSeconds - 心跳间隔（秒），默认 20 秒
   */
  function startHeartbeatTimer(
    onCheck: (device: OnlineDevice) => Promise<boolean>,
    intervalSeconds: number = 20,
  ) {
    if (heartbeatTimer !== null) {
      return; // 已经启动
    }

    // 立即执行一次清理（异步）
    cleanupExpiredDevices().catch((e) => console.error('[DeviceStore] Initial cleanup failed:', e));

    // 执行心跳检查
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
            await updateHeartbeat(device.peerId);
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
      await updateOnlineStatus();

      // 清理过期设备
      await cleanupExpiredDevices();
    }, intervalSeconds * 1000);

    console.log('[DeviceStore] Heartbeat timer started (interval: ' + intervalSeconds + 's)');
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
  async function clearAll() {
    devices.value.clear();
    // 清空 IndexedDB 中的所有头像
    await indexedDBStorage.clearStore('avatars');
    await saveDevices();
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
