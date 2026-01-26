import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { UserInfo } from '../types';

const USER_INFO_KEY = 'p2p_user_info';
const MY_PEER_ID_KEY = 'p2p_my_peer_id';

export const useUserStore = defineStore('user', () => {
  const userInfo = ref<UserInfo>({
    username: '',
    avatar: null,
    peerId: null,
    version: 0,
  });

  const isSetup = ref(false);

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
    const hasChange =
      (info.username !== undefined && info.username !== userInfo.value.username) ||
      (info.avatar !== undefined && info.avatar !== userInfo.value.avatar);

    userInfo.value = { ...userInfo.value, ...info };

    // 如果有实质性变更，版本号+1
    if (hasChange && (info.username || info.avatar !== undefined)) {
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

  return {
    userInfo,
    isSetup,
    myPeerId,
    loadUserInfo,
    saveUserInfo,
    setPeerId,
    clearUserInfo,
  };
});
