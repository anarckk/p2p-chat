import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { UserInfo } from '../types';
import indexedDBStorage from '../util/indexedDBStorage';

const USER_INFO_KEY = 'p2p_user_info';
const USER_INFO_META_KEY = 'p2p_user_info_meta'; // 存储小型元数据（不含头像）
const NETWORK_ACCELERATION_KEY = 'p2p_network_acceleration';
const NETWORK_LOGGING_KEY = 'p2p_network_logging';
const USER_AVATAR_MIGRATION_KEY = 'user_avatar_migrated_to_indexeddb'; // 标记是否已迁移头像
const MY_AVATAR_ID = 'my-avatar'; // 用户自己的头像在 IndexedDB 中的 ID
// const MY_PEER_ID_KEY = 'p2p_my_peer_id'; // 保留但不使用，避免 ESLint 警告

export const useUserStore = defineStore('user', () => {
  const userInfo = ref<UserInfo>({
    username: '',
    avatar: null,
    peerId: null,
    version: 0,
  });

  const isSetup = ref(false);

  // 网络加速开关
  const networkAccelerationEnabled = ref(false);

  // 网络数据日志记录开关
  const networkLoggingEnabled = ref(false);

  // 独立的 myPeerId，用于发现中心展示
  const myPeerId = computed(() => userInfo.value.peerId);

  /**
   * 加载用户信息（混合策略：localStorage + IndexedDB）
   * 小数据（用户名、peerId、版本）→ localStorage
   * 大数据（头像）→ IndexedDB
   */
  async function loadUserInfo() {
    // 首次加载时检查是否需要迁移旧数据
    await migrateOldUserDataIfNeeded();

    // 从 localStorage 加载用户元数据
    const saved = localStorage.getItem(USER_INFO_META_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        userInfo.value = {
          username: parsed.username || '',
          avatar: null, // 稍后从 IndexedDB 加载
          peerId: parsed.peerId || null,
          version: parsed.version || 0,
        };
        isSetup.value = !!parsed.username;

        // 从 IndexedDB 加载头像
        const avatarData = await indexedDBStorage.get('avatars', MY_AVATAR_ID);
        if (avatarData && avatarData.avatar) {
          userInfo.value.avatar = avatarData.avatar;
        } else {
          // 回退：如果 IndexedDB 中没有头像，尝试从旧的 localStorage key 加载
          const oldData = localStorage.getItem(USER_INFO_KEY);
          if (oldData) {
            try {
              const oldParsed = JSON.parse(oldData);
              if (oldParsed.avatar) {
                userInfo.value.avatar = oldParsed.avatar;
                console.log('[UserStore] Loaded avatar from fallback (old localStorage key)');
                // 迁移到 IndexedDB
                await indexedDBStorage.set('avatars', {
                  id: MY_AVATAR_ID,
                  peerId: MY_AVATAR_ID,
                  avatar: oldParsed.avatar,
                });
                console.log('[UserStore] Migrated avatar to IndexedDB');
              }
            } catch (e) {
              console.error('[UserStore] Failed to load avatar from fallback:', e);
            }
          }
        }
      } catch (e) {
        console.error('[UserStore] Failed to load user info:', e);
      }
    }
    return isSetup.value;
  }

  /**
   * 迁移旧用户数据到新的混合存储策略
   * 只在首次加载时执行一次
   */
  async function migrateOldUserDataIfNeeded() {
    const hasMigrated = localStorage.getItem(USER_AVATAR_MIGRATION_KEY);
    if (hasMigrated) {
      return; // 已迁移过
    }

    try {
      // 检查是否有旧数据
      const oldData = localStorage.getItem(USER_INFO_KEY);
      if (!oldData) {
        localStorage.setItem(USER_AVATAR_MIGRATION_KEY, 'true');
        return;
      }

      const parsed = JSON.parse(oldData);
      console.log('[UserStore] 开始迁移用户数据到混合存储...');

      // 分离元数据和头像
      const { avatar, ...meta } = parsed;

      // 保存元数据到 localStorage
      localStorage.setItem(USER_INFO_META_KEY, JSON.stringify(meta));

      // 如果有头像，存储到 IndexedDB
      if (avatar) {
        await indexedDBStorage.set('avatars', {
          id: MY_AVATAR_ID,
          peerId: MY_AVATAR_ID,
          avatar,
        });
        console.log('[UserStore] 用户头像已移至 IndexedDB');
      }

      // 删除旧数据
      localStorage.removeItem(USER_INFO_KEY);

      // 标记迁移完成
      localStorage.setItem(USER_AVATAR_MIGRATION_KEY, 'true');

      console.log('[UserStore] 用户数据迁移完成！');
    } catch (e) {
      console.error('[UserStore] 迁移失败:', e);
    }
  }

  /**
   * 保存用户信息（混合策略：localStorage + IndexedDB）
   * 小数据（用户名、peerId、版本）→ localStorage
   * 大数据（头像）→ IndexedDB
   */
  async function saveUserInfo(info: Partial<UserInfo>) {
    // 检查是否有实质性变更（username 或 avatar 变化）
    // 注意：需要考虑 null 的情况，只有当新值与旧值确实不同时才算变更
    const hasUsernameChange =
      info.username !== undefined && info.username !== userInfo.value.username;
    const hasAvatarChange =
      info.avatar !== undefined &&
      info.avatar !== userInfo.value.avatar &&
      // 处理 null 的情况：如果新旧值都是 null，不算变更
      !((info.avatar === null || info.avatar === undefined) && userInfo.value.avatar === null);

    const hasChange = hasUsernameChange || hasAvatarChange;

    // 合并信息，但不要覆盖已有的 peerId（除非明确传入了新的 peerId）
    const { avatar, peerId, ...restInfo } = info;
    userInfo.value = {
      ...userInfo.value,
      ...restInfo,
      // 只有当明确传入 peerId 且不为 null 时才更新 peerId
      ...(peerId !== undefined && peerId !== null ? { peerId } : {}),
    };

    // 如果有实质性变更，版本号+1
    if (hasChange) {
      userInfo.value.version += 1;
    }

    // 如果传入了头像，保存到 IndexedDB
    if (avatar !== undefined) {
      userInfo.value.avatar = avatar;
      if (avatar) {
        await indexedDBStorage.set('avatars', {
          id: MY_AVATAR_ID,
          peerId: MY_AVATAR_ID,
          avatar,
        });
      } else {
        await indexedDBStorage.delete('avatars', MY_AVATAR_ID);
      }
    }

    // 保存元数据到 localStorage（不含头像）
    const { avatar: _, ...metaToSave } = userInfo.value;
    localStorage.setItem(USER_INFO_META_KEY, JSON.stringify(metaToSave));

    // 为了向后兼容，同时保存到旧的 key（包含头像）
    // 注意：这里包含完整的 userInfo，包括头像
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo.value));

    if (info.username) {
      isSetup.value = true;
    }
  }

  async function setPeerId(peerId: string) {
    userInfo.value.peerId = peerId;
    // 保存元数据到 localStorage（不含头像）
    const { avatar: _, ...metaToSave } = userInfo.value;
    localStorage.setItem(USER_INFO_META_KEY, JSON.stringify(metaToSave));
    // 为了向后兼容，同时保存到旧的 key
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo.value));
  }

  async function clearUserInfo() {
    userInfo.value = {
      username: '',
      avatar: null,
      peerId: null,
      version: 0,
    };
    isSetup.value = false;
    localStorage.removeItem(USER_INFO_META_KEY);
    // 同时删除 IndexedDB 中的头像
    await indexedDBStorage.delete('avatars', MY_AVATAR_ID);
  }

  // ==================== 网络加速 ====================

  /**
   * 加载网络加速开关状态
   */
  function loadNetworkAcceleration() {
    const saved = localStorage.getItem(NETWORK_ACCELERATION_KEY);
    if (saved !== null) {
      networkAccelerationEnabled.value = saved === 'true';
    }
    return networkAccelerationEnabled.value;
  }

  /**
   * 设置网络加速开关状态
   */
  function setNetworkAcceleration(enabled: boolean) {
    networkAccelerationEnabled.value = enabled;
    localStorage.setItem(NETWORK_ACCELERATION_KEY, String(enabled));
  }

  // ==================== 网络数据日志记录 ====================

  /**
   * 加载网络数据日志记录开关状态
   */
  function loadNetworkLogging() {
    const saved = localStorage.getItem(NETWORK_LOGGING_KEY);
    if (saved !== null) {
      networkLoggingEnabled.value = saved === 'true';
    }
    return networkLoggingEnabled.value;
  }

  /**
   * 设置网络数据日志记录开关状态
   */
  function setNetworkLogging(enabled: boolean) {
    networkLoggingEnabled.value = enabled;
    localStorage.setItem(NETWORK_LOGGING_KEY, String(enabled));
  }

  return {
    userInfo,
    isSetup,
    myPeerId,
    loadUserInfo,
    saveUserInfo,
    setPeerId,
    clearUserInfo,
    // 网络加速
    networkAccelerationEnabled,
    loadNetworkAcceleration,
    setNetworkAcceleration,
    // 网络数据日志记录
    networkLoggingEnabled,
    loadNetworkLogging,
    setNetworkLogging,
  };
});
