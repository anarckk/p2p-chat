import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { UserInfo } from '../types';

const USER_INFO_KEY = 'p2p_user_info';
const NETWORK_ACCELERATION_KEY = 'p2p_network_acceleration';
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

  // 独立的 myPeerId，用于发现中心展示
  const myPeerId = computed(() => userInfo.value.peerId);

  function loadUserInfo() {
    const saved = localStorage.getItem(USER_INFO_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        userInfo.value = {
          username: parsed.username || '',
          avatar: parsed.avatar || null,
          peerId: parsed.peerId || null,
          version: parsed.version || 0,
        };
        isSetup.value = !!parsed.username;
      } catch (e) {
        console.error('Failed to load user info:', e);
      }
    }
    return isSetup.value;
  }

  function saveUserInfo(info: Partial<UserInfo>) {
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
    const { peerId, ...restInfo } = info;
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

    localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo.value));
    if (info.username) {
      isSetup.value = true;
    }
  }

  function setPeerId(peerId: string) {
    userInfo.value.peerId = peerId;
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(userInfo.value));
  }

  function clearUserInfo() {
    userInfo.value = {
      username: '',
      avatar: null,
      peerId: null,
      version: 0,
    };
    isSetup.value = false;
    localStorage.removeItem(USER_INFO_KEY);
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
  };
});
