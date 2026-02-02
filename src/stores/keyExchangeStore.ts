/**
 * 公钥变更弹窗状态管理
 * 用于处理身份校验机制中的公钥变更确认
 */
import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface KeyChangeDialog {
  visible: boolean;
  peerId: string;
  username: string;
  oldPublicKey: string;
  newPublicKey: string;
  resolve?: (trust: boolean) => void;
}

export const useKeyExchangeStore = defineStore('keyExchange', () => {
  // 公钥变更弹窗状态
  const dialog = ref<KeyChangeDialog>({
    visible: false,
    peerId: '',
    username: '',
    oldPublicKey: '',
    newPublicKey: '',
  });

  // 待确认的公钥变更队列（支持多个变更）
  const pendingChanges = ref<Map<string, KeyChangeDialog>>(new Map());

  /**
   * 显示公钥变更弹窗
   * @returns Promise<boolean> - 用户是否信任新公钥
   */
  function showKeyChangeDialog(
    peerId: string,
    username: string,
    oldPublicKey: string,
    newPublicKey: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      // 如果已经有待处理的弹窗，加入队列
      if (dialog.value.visible) {
        pendingChanges.value.set(peerId, {
          visible: false,
          peerId,
          username,
          oldPublicKey,
          newPublicKey,
        });
        console.log('[KeyExchangeStore] Dialog queued for:', peerId);
        return;
      }

      // 设置当前弹窗
      dialog.value = {
        visible: true,
        peerId,
        username,
        oldPublicKey,
        newPublicKey,
        resolve,
      };

      console.log('[KeyExchangeStore] Showing dialog for:', peerId);
    });
  }

  /**
   * 用户选择"不信任"
   */
  function handleNotTrust() {
    const currentDialog = dialog.value;
    if (currentDialog.resolve) {
      currentDialog.resolve(false);
    }

    closeCurrentDialog();

    // 处理队列中的下一个弹窗
    processNextDialog();
  }

  /**
   * 用户选择"信任"
   */
  function handleTrust() {
    const currentDialog = dialog.value;
    if (currentDialog.resolve) {
      currentDialog.resolve(true);
    }

    closeCurrentDialog();

    // 处理队列中的下一个弹窗
    processNextDialog();
  }

  /**
   * 关闭当前弹窗
   */
  function closeCurrentDialog() {
    dialog.value = {
      visible: false,
      peerId: '',
      username: '',
      oldPublicKey: '',
      newPublicKey: '',
    };
  }

  /**
   * 处理队列中的下一个弹窗
   */
  function processNextDialog() {
    if (pendingChanges.value.size === 0) {
      return;
    }

    // 获取第一个待处理的弹窗
    const firstEntry = pendingChanges.value.entries().next();
    if (firstEntry.done) {
      return;
    }

    const [peerId, dialogData] = firstEntry.value;
    pendingChanges.value.delete(peerId);

    // 显示弹窗
    dialog.value = {
      ...dialogData,
      visible: true,
    };

    console.log('[KeyExchangeStore] Processing next dialog for:', peerId);
  }

  /**
   * 取消指定设备的待处理弹窗
   */
  function cancelPendingDialog(peerId: string) {
    if (dialog.value.peerId === peerId && dialog.value.visible) {
      // 当前正在显示的弹窗，直接关闭
      if (dialog.value.resolve) {
        dialog.value.resolve(false);
      }
      closeCurrentDialog();
      processNextDialog();
    } else {
      // 队列中的弹窗，删除即可
      pendingChanges.value.delete(peerId);
    }
  }

  /**
   * 清空所有待处理的弹窗
   */
  function clearAllPending() {
    pendingChanges.value.clear();
    closeCurrentDialog();
  }

  /**
   * 截断公钥显示
   */
  function truncateKey(key: string): string {
    if (key.length < 40) {
      return key;
    }
    return `${key.substring(0, 20)}...${key.substring(key.length - 20)}`;
  }

  return {
    dialog,
    pendingChanges,
    showKeyChangeDialog,
    handleNotTrust,
    handleTrust,
    cancelPendingDialog,
    clearAllPending,
    truncateKey,
  };
});
