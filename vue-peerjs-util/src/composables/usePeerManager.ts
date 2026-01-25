import { ref, onUnmounted } from 'vue';
import { PeerHttpUtil } from '../util/PeerHttpUtil';
import { useChatStore } from '../stores/chatStore';
import { useUserStore } from '../stores/userStore';
import type { ChatMessage } from '../types';
import { message } from 'ant-design-vue';

let peerInstance: PeerHttpUtil | null = null;
let messageHandler: ((data: { from: string; data: any }) => void) | null = null;

export function usePeerManager() {
  const chatStore = useChatStore();
  const userStore = useUserStore();

  const isConnected = ref(false);
  const myPeerId = ref<string | null>(null);

  function init() {
    if (peerInstance) {
      return peerInstance;
    }

    // 使用用户名作为 peerId 前缀，确保唯一性
    const username = userStore.userInfo.username || 'user';
    const uniqueId = `${username}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    peerInstance = new PeerHttpUtil(uniqueId);

    peerInstance.on('open', (id: string) => {
      myPeerId.value = id;
      isConnected.value = true;
      userStore.setPeerId(id);
      console.log('[Peer] Connected with ID:', id);
    });

    messageHandler = (data: { from: string; data: any }) => {
      handleIncomingMessage(data);
    };

    peerInstance.on('message', messageHandler);

    return peerInstance;
  }

  function handleIncomingMessage(data: { from: string; data: any }) {
    const { from, data: msgData } = data;

    // 处理不同类型的消息
    if (typeof msgData === 'object') {
      switch (msgData.type) {
        case 'chat':
          handleChatMessage(from, msgData);
          break;
        case 'profile':
          handleProfileMessage(from, msgData);
          break;
        case 'heartbeat':
          handleHeartbeat(from, msgData);
          break;
        case 'heartbeat_response':
          // 忽略心跳响应
          break;
        default:
          console.log('[Peer] Unknown message type:', msgData.type);
      }
    } else {
      // 兼容旧的文本消息格式
      handleChatMessage(from, { content: msgData });
    }
  }

  async function handleChatMessage(from: string, msgData: any) {
    const contact = chatStore.getContact(from);

    // 对方发送消息，说明对方在线了
    chatStore.setContactOnline(from, true);

    // 如果是未知联系人，先请求对方资料
    if (!contact) {
      chatStore.addOrUpdateContact({
        peerId: from,
        username: from,
        avatar: null,
        online: true,
        lastSeen: Date.now(),
        unreadCount: 1,
      });

      // 请求对方资料
      await sendMessage(from, {
        type: 'profile',
        data: { requestProfile: true },
      });

      message.info('新设备加入聊天');
    } else {
      chatStore.incrementUnread(from);
    }

    // 保存消息
    const chatMessage: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      from,
      to: myPeerId.value || '',
      content: msgData.content || '',
      timestamp: Date.now(),
      status: 'sent',
      type: 'text',
    };

    chatStore.addMessage(from, chatMessage);

    // 对方上线了，检查是否有待发送的消息
    await retryPendingMessages(from);
  }

  function handleProfileMessage(from: string, msgData: any) {
    const { username, avatar, requestProfile } = msgData.data || {};

    if (requestProfile) {
      // 对方请求我们的资料，发送过去
      sendMessage(from, {
        type: 'profile',
        data: {
          username: userStore.userInfo.username,
          avatar: userStore.userInfo.avatar,
        },
      });
      return;
    }

    // 更新联系人信息
    if (username || avatar) {
      const contact = chatStore.getContact(from);
      if (contact) {
        chatStore.addOrUpdateContact({
          ...contact,
          username: username || contact.username,
          avatar: avatar || contact.avatar,
        });
      }
    }
  }

  async function handleHeartbeat(from: string, msgData: any) {
    chatStore.setContactOnline(from, true);

    // 回复心跳
    await sendMessage(from, {
      type: 'heartbeat_response',
    });

    // 检查是否有给这个联系人的待发送消息
    await retryPendingMessages(from);
  }

  async function retryPendingMessages(peerId: string) {
    const pending = chatStore.getPendingMessagesForPeer(peerId);
    if (pending.length === 0) return;

    console.log(`[Peer] Retrying ${pending.length} pending messages for ${peerId}`);

    for (const pendingMsg of pending) {
      const success = await sendMessage(peerId, {
        type: 'chat',
        data: {
          content: pendingMsg.content,
          timestamp: pendingMsg.timestamp,
        },
      });

      if (success) {
        chatStore.removePendingMessage(pendingMsg.id);
        // 更新消息状态为已发送
        chatStore.updateMessageStatus(peerId, pendingMsg.id, 'sent');
      } else {
        // 发送失败，增加重试计数
        pendingMsg.retryCount++;
        if (pendingMsg.retryCount > 5) {
          // 超过最大重试次数，放弃
          chatStore.removePendingMessage(pendingMsg.id);
        }
      }
    }
  }

  async function sendMessage(peerId: string, data: any): Promise<boolean> {
    if (!peerInstance) {
      message.error('Peer 未连接');
      return false;
    }

    try {
      await peerInstance.send(peerId, data);
      return true;
    } catch (error) {
      console.error('[Peer] Send error:', error);
      return false;
    }
  }

  function destroy() {
    if (peerInstance) {
      if (messageHandler) {
        // peerInstance.off('message', messageHandler);
      }
      peerInstance.destroy();
      peerInstance = null;
      messageHandler = null;
      isConnected.value = false;
      myPeerId.value = null;
    }
  }

  onUnmounted(() => {
    destroy();
  });

  return {
    isConnected,
    myPeerId,
    init,
    sendMessage,
    destroy,
  };
}
