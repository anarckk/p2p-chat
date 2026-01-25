import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { UserInfo } from '../types';

const USER_INFO_KEY = 'p2p_user_info';

export const useUserStore = defineStore('user', () => {
  const userInfo = ref<UserInfo>({
    username: '',
    avatar: null,
    peerId: null,
  });

  const isSetup = ref(false);

  function loadUserInfo() {
    const saved = localStorage.getItem(USER_INFO_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        userInfo.value = parsed;
        isSetup.value = !!parsed.username;
      } catch (e) {
        console.error('Failed to load user info:', e);
      }
    }
    return isSetup.value;
  }

  function saveUserInfo(info: Partial<UserInfo>) {
    userInfo.value = { ...userInfo.value, ...info };
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
    };
    isSetup.value = false;
    localStorage.removeItem(USER_INFO_KEY);
  }

  return {
    userInfo,
    isSetup,
    loadUserInfo,
    saveUserInfo,
    setPeerId,
    clearUserInfo,
  };
});
