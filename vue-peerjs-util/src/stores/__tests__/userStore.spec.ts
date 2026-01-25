import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useUserStore } from '../userStore';

describe('userStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('初始状态', () => {
    it('应该有正确的初始状态', () => {
      const store = useUserStore();

      expect(store.userInfo.username).toBe('');
      expect(store.userInfo.avatar).toBeNull();
      expect(store.userInfo.peerId).toBeNull();
      expect(store.isSetup).toBe(false);
    });
  });

  describe('saveUserInfo', () => {
    it('应该保存用户名', () => {
      const store = useUserStore();

      store.saveUserInfo({ username: 'testUser' });

      expect(store.userInfo.username).toBe('testUser');
      expect(store.isSetup).toBe(true);
    });

    it('应该保存头像', () => {
      const store = useUserStore();

      const avatarData = 'data:image/png;base64,iVBORw0KGgoAAAANS...';
      store.saveUserInfo({ avatar: avatarData });

      expect(store.userInfo.avatar).toBe(avatarData);
    });

    it('应该保存到 localStorage', () => {
      const store = useUserStore();

      store.saveUserInfo({ username: 'testUser' });

      const saved = localStorage.getItem('p2p_user_info');
      expect(saved).toBeTruthy();

      const parsed = JSON.parse(saved!);
      expect(parsed.username).toBe('testUser');
    });

    it('应该支持部分更新', () => {
      const store = useUserStore();

      store.saveUserInfo({ username: 'user1' });
      store.saveUserInfo({ avatar: 'avatar1.png' });

      expect(store.userInfo.username).toBe('user1');
      expect(store.userInfo.avatar).toBe('avatar1.png');
    });
  });

  describe('loadUserInfo', () => {
    it('应该从 localStorage 加载用户信息', () => {
      const store = useUserStore();

      localStorage.setItem(
        'p2p_user_info',
        JSON.stringify({
          username: 'loadedUser',
          avatar: 'loaded.png',
          peerId: 'peer-123',
        }),
      );

      const isSetup = store.loadUserInfo();

      expect(store.userInfo.username).toBe('loadedUser');
      expect(store.userInfo.avatar).toBe('loaded.png');
      expect(store.userInfo.peerId).toBe('peer-123');
      expect(isSetup).toBe(true);
    });

    it('应该在没有保存数据时返回 false', () => {
      const store = useUserStore();

      const isSetup = store.loadUserInfo();

      expect(isSetup).toBe(false);
      expect(store.isSetup).toBe(false);
    });

    it('应该处理无效的 localStorage 数据', () => {
      const store = useUserStore();

      localStorage.setItem('p2p_user_info', 'invalid json');

      const isSetup = store.loadUserInfo();

      expect(isSetup).toBe(false);
    });
  });

  describe('setPeerId', () => {
    it('应该设置 peerId', () => {
      const store = useUserStore();

      store.setPeerId('peer-abc-123');

      expect(store.userInfo.peerId).toBe('peer-abc-123');
    });

    it('应该保存到 localStorage', () => {
      const store = useUserStore();

      store.saveUserInfo({ username: 'test' });
      store.setPeerId('peer-xyz');

      const saved = localStorage.getItem('p2p_user_info');
      const parsed = JSON.parse(saved!);
      expect(parsed.peerId).toBe('peer-xyz');
    });
  });

  describe('clearUserInfo', () => {
    it('应该清除所有用户信息', () => {
      const store = useUserStore();

      store.saveUserInfo({ username: 'test', avatar: 'test.png' });
      store.setPeerId('peer-123');

      store.clearUserInfo();

      expect(store.userInfo.username).toBe('');
      expect(store.userInfo.avatar).toBeNull();
      expect(store.userInfo.peerId).toBeNull();
      expect(store.isSetup).toBe(false);
    });

    it('应该从 localStorage 删除数据', () => {
      const store = useUserStore();

      store.saveUserInfo({ username: 'test' });
      store.clearUserInfo();

      const saved = localStorage.getItem('p2p_user_info');
      expect(saved).toBeNull();
    });
  });
});
