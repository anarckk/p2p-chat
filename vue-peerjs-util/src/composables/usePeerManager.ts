import { ref, onUnmounted } from 'vue';
import { PeerHttpUtil } from '../util/PeerHttpUtil';
import { useChatStore } from '../stores/chatStore';
import { useUserStore } from '../stores/userStore';
import { useDeviceStore } from '../stores/deviceStore';
import type { ChatMessage, MessageType, MessageContent, OnlineDevice } from '../types';
import { message } from 'ant-design-vue';

let peerInstance: PeerHttpUtil | null = null;
let messageHandler: ((data: { from: string; data: any }) => void) | null = null;
let deliveryAckHandler: ((protocol: any, from: string) => void) | null = null;
let discoveryResponseHandler: ((protocol: any, from: string) => void) | null = null;
let discoveryNotificationHandler: ((protocol: any, from: string) => void) | null = null;
let usernameQueryHandler: ((protocol: any, from: string) => void) | null = null;
let usernameResponseHandler: ((protocol: any, from: string) => void) | null = null;
let onlineCheckQueryHandler: ((protocol: any, from: string) => void) | null = null;
let onlineCheckResponseHandler: ((protocol: any, from: string) => void) | null = null;

export function usePeerManager() {
  const chatStore = useChatStore();
  const userStore = useUserStore();
  const deviceStore = useDeviceStore();

  const isConnected = ref(false);

  function init() {
    if (peerInstance) {
      return peerInstance;
    }

    // 优先使用已存储的 PeerId，保持不变
    let peerId = userStore.userInfo.peerId;

    // 如果没有存储的 PeerId，生成新的
    if (!peerId) {
      const username = userStore.userInfo.username || 'user';
      peerId = `${username}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    peerInstance = new PeerHttpUtil(peerId);

    peerInstance.on('open', (id: string) => {
      isConnected.value = true;
      userStore.setPeerId(id);
      console.log('[Peer] Connected with ID:', id);
    });

    // 如果已经连接，直接设置状态（用于恢复已存在的连接）
    if (peerInstance.getId()) {
      isConnected.value = true;
    }

    // 处理送达确认
    deliveryAckHandler = (protocol: any, _from: string) => {
      if (protocol.type === 'delivery_ack') {
        const { messageId } = protocol;
        // 查找消息并更新状态
        const msg = chatStore.getMessageById(messageId);
        if (msg) {
          chatStore.updateMessageStatus(msg.to, messageId, 'delivered');
          chatStore.removePendingMessage(messageId);
        }
      }
    };

    peerInstance.onProtocol('delivery_ack', deliveryAckHandler);

    // 处理发现中心响应
    discoveryResponseHandler = (protocol: any, _from: string) => {
      if (protocol.type === 'discovery_response') {
        const { devices } = protocol;
        // 更新在线设备列表
        devices?.forEach((device: OnlineDevice) => {
          peerInstance?.addDiscoveredDevice(device);
        });
      }
    };

    peerInstance.onProtocol('discovery_response', discoveryResponseHandler);

    // 处理发现通知
    discoveryNotificationHandler = (protocol: any, from: string) => {
      if (protocol.type === 'discovery_notification') {
        const { fromUsername, fromAvatar } = protocol;
        // 对端发现了我，添加到发现中心的设备列表
        const device: OnlineDevice = {
          peerId: from,
          username: fromUsername,
          avatar: fromAvatar,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
          isOnline: true,
        };

        // 同时添加到 peerInstance 和 deviceStore
        peerInstance?.addDiscoveredDevice(device);
        deviceStore.addOrUpdateDevice(device);

        // 触发自定义事件，通知 UI 自动刷新
        window.dispatchEvent(new CustomEvent('discovery-devices-updated'));

        // 如果不在聊天列表中，自动添加到聊天列表
        if (!chatStore.getContact(from)) {
          chatStore.createChat(from, fromUsername);
          // 更新用户信息
          chatStore.addOrUpdateContact({
            peerId: from,
            username: fromUsername,
            avatar: fromAvatar,
            online: true,
            lastSeen: Date.now(),
            unreadCount: 0,
          });
          message.info(`${fromUsername} 发现了你`);
        }
      }
    };

    peerInstance.onProtocol('discovery_notification', discoveryNotificationHandler);

    // 处理用户名查询
    usernameQueryHandler = (_protocol: any, from: string) => {
      if (_protocol.type === 'username_query') {
        // 响应我的用户信息
        peerInstance?.respondUsernameQuery(
          from,
          userStore.userInfo.username || '',
          userStore.userInfo.avatar,
        );
      }
    };

    peerInstance.onProtocol('username_query', usernameQueryHandler);

    // 处理用户名响应
    usernameResponseHandler = (protocol: any, _from: string) => {
      if (protocol.type === 'username_response') {
        const { username, avatar } = protocol;
        // 更新联系人信息
        const contact = chatStore.getContact(_from);
        if (contact) {
          chatStore.addOrUpdateContact({
            ...contact,
            username,
            avatar,
          });
        }
      }
    };

    peerInstance.onProtocol('username_response', usernameResponseHandler);

    // 处理在线检查查询
    onlineCheckQueryHandler = (_protocol: any, from: string) => {
      if (_protocol.type === 'online_check_query') {
        // 响应我的在线状态
        peerInstance?.respondOnlineCheck(
          from,
          userStore.userInfo.username || '',
          userStore.userInfo.avatar,
        );
      }
    };

    peerInstance.onProtocol('online_check_query', onlineCheckQueryHandler);

    // 处理在线检查响应
    onlineCheckResponseHandler = (protocol: any, _from: string) => {
      if (protocol.type === 'online_check_response') {
        const { isOnline, username, avatar } = protocol;
        // 更新设备信息
        deviceStore.addOrUpdateDevice({
          peerId: _from,
          username,
          avatar,
          lastHeartbeat: Date.now(),
          firstDiscovered: Date.now(),
        });

        // 同时更新联系人信息
        const contact = chatStore.getContact(_from);
        if (contact) {
          chatStore.addOrUpdateContact({
            ...contact,
            username,
            avatar,
            online: isOnline,
            lastSeen: Date.now(),
          });
        }
      }
    };

    peerInstance.onProtocol('online_check_response', onlineCheckResponseHandler);

    messageHandler = (data: { from: string; data: any }) => {
      handleIncomingMessage(data);
    };

    peerInstance.on('message', messageHandler);

    return peerInstance;
  }

  function handleIncomingMessage(data: { from: string; data: any }) {
    const { from, data: msgData } = data;

    // 检查是否是 ChatMessage（通过三段式协议接收的）
    if (msgData && typeof msgData === 'object' && 'id' in msgData && 'type' in msgData) {
      handleChatMessage(from, msgData as ChatMessage);
      return;
    }
  }

  async function handleChatMessage(from: string, chatMessage: ChatMessage) {
    const { id, from: sender, content, type, timestamp } = chatMessage;

    // 检查消息是否已处理（去重）
    if (chatStore.isMessageProcessed(id)) {
      // 已处理过，但仍需发送送达确认
      await sendDeliveryAck(sender, id);
      return;
    }

    // 标记消息已处理
    chatStore.markMessageProcessed(id);

    const contact = chatStore.getContact(from);

    // 对方发送消息，说明对方在线了
    chatStore.setContactOnline(from, true);

    // 如果是未知联系人，添加到联系人列表
    if (!contact) {
      chatStore.addOrUpdateContact({
        peerId: from,
        username: from,
        avatar: null,
        online: true,
        lastSeen: Date.now(),
        unreadCount: 1,
      });

      message.info('新设备加入聊天');
    } else {
      chatStore.incrementUnread(from);
    }

    // 保存消息（状态已设置为 delivered）
    chatStore.addMessage(from, chatMessage);

    // 发送送达确认
    await sendDeliveryAck(from, id);

    // 对方上线了，检查是否有待发送的消息
    await retryPendingMessages(from);
  }

  async function sendDeliveryAck(peerId: string, messageId: string) {
    if (!peerInstance) return;

    try {
      await peerInstance.send(peerId, `ack_${messageId}`, '', 'system');
    } catch (error) {
      console.error('[Peer] Failed to send delivery ack:', error);
    }
  }

  async function retryPendingMessages(peerId: string) {
    const pending = chatStore.getPendingMessagesForPeer(peerId);
    if (pending.length === 0) return;

    console.log(`[Peer] Retrying ${pending.length} pending messages for ${peerId}`);

    for (const pendingMsg of pending) {
      const success = await sendChatMessage(
        peerId,
        pendingMsg.id,
        pendingMsg.content,
        pendingMsg.type,
      );

      if (success) {
        chatStore.removePendingMessage(pendingMsg.id);
      } else {
        // 发送失败，增加重试计数
        const canContinue = chatStore.incrementRetryCount(pendingMsg.id);
        if (!canContinue) {
          // 超过最大重试次数，放弃
          chatStore.removePendingMessage(pendingMsg.id);
          chatStore.updateMessageStatus(peerId, pendingMsg.id, 'failed');
        }
      }
    }
  }

  /**
   * 发送聊天消息（使用三段式协议）
   */
  async function sendChatMessage(
    peerId: string,
    messageId: string,
    content: MessageContent,
    type: MessageType = 'text',
  ): Promise<boolean> {
    if (!peerInstance) {
      message.error('Peer 未连接');
      return false;
    }

    try {
      const result = await peerInstance.send(peerId, messageId, content, type);
      return result.sent;
    } catch (error) {
      console.error('[Peer] Send error:', error);
      return false;
    }
  }

  /**
   * 生成消息唯一ID
   */
  function generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 发送消息并处理重试
   */
  async function sendMessageWithRetry(
    peerId: string,
    content: MessageContent,
    type: MessageType = 'text',
  ): Promise<string> {
    const messageId = generateMessageId();

    // 先保存消息到本地
    const chatMessage: ChatMessage = {
      id: messageId,
      from: userStore.myPeerId || '',
      to: peerId,
      content,
      timestamp: Date.now(),
      status: 'sending',
      type,
    };

    chatStore.addMessage(peerId, chatMessage);

    // 尝试发送
    const success = await sendChatMessage(peerId, messageId, content, type);

    if (success) {
      chatStore.updateMessageStatus(peerId, messageId, 'sent');
    } else {
      // 发送失败，加入待发送队列
      chatStore.addPendingMessage({
        id: messageId,
        to: peerId,
        content,
        timestamp: Date.now(),
        retryCount: 0,
        type,
      });
      chatStore.updateMessageStatus(peerId, messageId, 'failed');
    }

    return messageId;
  }

  /**
   * 发现中心：查询指定节点已发现的设备
   */
  async function queryDiscoveredDevices(peerId: string): Promise<OnlineDevice[]> {
    if (!peerInstance) {
      return [];
    }

    try {
      const devices = await peerInstance.queryDiscoveredDevices(peerId);
      // 同时更新到 deviceStore
      if (devices.length > 0) {
        deviceStore.addDevices(devices);
      }
      return devices;
    } catch (error) {
      console.error('[Peer] Query discovered devices error:', error);
      return [];
    }
  }

  /**
   * 发现中心：获取已发现的设备列表
   */
  function getDiscoveredDevices(): OnlineDevice[] {
    if (!peerInstance) {
      return [];
    }
    return peerInstance.getDiscoveredDevices();
  }

  /**
   * 发现中心：获取 deviceStore 中的设备列表
   */
  function getStoredDevices(): OnlineDevice[] {
    return deviceStore.allDevices;
  }

  /**
   * 发现中心：添加已发现的设备
   */
  function addDiscoveredDevice(device: OnlineDevice) {
    if (peerInstance) {
      peerInstance.addDiscoveredDevice(device);
      // 同时添加到 deviceStore
      deviceStore.addOrUpdateDevice(device);
    }
  }

  /**
   * 发现中心：发送发现通知给对端
   */
  async function sendDiscoveryNotification(peerId: string) {
    if (!peerInstance) return;

    try {
      await peerInstance.sendDiscoveryNotification(
        peerId,
        userStore.userInfo.username || '',
        userStore.userInfo.avatar,
      );
    } catch (error) {
      console.error('[Peer] Send discovery notification error:', error);
    }
  }

  /**
   * 发现中心：查询对端用户名
   */
  async function queryUsername(peerId: string): Promise<{ username: string; avatar: string | null } | null> {
    if (!peerInstance) {
      return null;
    }

    try {
      return await peerInstance.queryUsername(peerId);
    } catch (error) {
      console.error('[Peer] Query username error:', error);
      return null;
    }
  }

  function destroy() {
    if (peerInstance) {
      if (messageHandler) {
        // peerInstance.off('message', messageHandler);
      }
      if (deliveryAckHandler) {
        // peerInstance.offProtocol('delivery_ack', deliveryAckHandler);
      }
      if (discoveryResponseHandler) {
        // peerInstance.offProtocol('discovery_response', discoveryResponseHandler);
      }
      peerInstance.destroy();
      peerInstance = null;
      messageHandler = null;
      deliveryAckHandler = null;
      discoveryResponseHandler = null;
      onlineCheckQueryHandler = null;
      onlineCheckResponseHandler = null;
      isConnected.value = false;
    }
    // 停止心跳定时器
    deviceStore.stopHeartbeatTimer();
  }

  onUnmounted(() => {
    destroy();
  });

  return {
    isConnected,
    init,
    sendChatMessage,
    sendMessageWithRetry,
    queryDiscoveredDevices,
    getDiscoveredDevices,
    getStoredDevices,
    addDiscoveredDevice,
    sendDiscoveryNotification,
    queryUsername,
    destroy,
    deviceStore,
  };
}
