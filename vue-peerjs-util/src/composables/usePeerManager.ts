import { ref } from 'vue';
import { PeerHttpUtil } from '../util/PeerHttpUtil';
import { useChatStore } from '../stores/chatStore';
import { useUserStore } from '../stores/userStore';
import { useDeviceStore } from '../stores/deviceStore';
import type { ChatMessage, MessageType, MessageContent, OnlineDevice } from '../types';
import { message } from 'ant-design-vue';
import { commLog } from '../util/logger';

let peerInstance: PeerHttpUtil | null = null;
let messageHandler: ((data: { from: string; data: any }) => void) | null = null;
let deliveryAckHandler: ((protocol: any, from: string) => void) | null = null;
let discoveryResponseHandler: ((protocol: any, from: string) => void) | null = null;
let discoveryNotificationHandler: ((protocol: any, from: string) => void) | null = null;
let usernameQueryHandler: ((protocol: any, from: string) => void) | null = null;
let usernameResponseHandler: ((protocol: any, from: string) => void) | null = null;
let onlineCheckQueryHandler: ((protocol: any, from: string) => void) | null = null;
let onlineCheckResponseHandler: ((protocol: any, from: string) => void) | null = null;
let userInfoQueryHandler: ((protocol: any, from: string) => void) | null = null;
let userInfoResponseHandler: ((protocol: any, from: string) => void) | null = null;

// 自动重连相关
let reconnectTimer: number | null = null;
let isReconnecting = false;
const RECONNECT_INTERVAL = 10000; // 10秒重连间隔

export function usePeerManager() {
  const chatStore = useChatStore();
  const userStore = useUserStore();
  const deviceStore = useDeviceStore();

  const isConnected = ref(false);

  /**
   * 停止自动重连
   */
  function stopReconnect() {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      console.log('[Peer] Auto-reconnect stopped');
    }
    isReconnecting = false;
  }

  /**
   * 开始自动重连
   */
  function startReconnect() {
    if (isReconnecting) {
      return; // 已经在重连中
    }

    isReconnecting = true;
    console.log('[Peer] Starting auto-reconnect in 10 seconds...');

    reconnectTimer = window.setTimeout(async () => {
      console.log('[Peer] Attempting to reconnect...');
      message.warning('与 Peer Server 断开连接，正在尝试重连...');

      try {
        // 重新初始化连接
        await init();
        console.log('[Peer] Reconnected successfully');
        message.success('已重新连接到 Peer Server');
        stopReconnect();
      } catch (error) {
        console.error('[Peer] Reconnect failed:', error);
        // 继续下一次重连
        startReconnect();
      }
    }, RECONNECT_INTERVAL);
  }

  /**
   * 请求用户完整信息
   */
  async function requestUserInfo(peerId: string) {
    if (!peerInstance) {
      return null;
    }

    commLog.sync.requestInfo({ to: peerId });

    try {
      const userInfo = await peerInstance.queryUserInfo(peerId);
      if (userInfo) {
        console.log('[Peer] Got user info for ' + peerId + ': ' + JSON.stringify({
          username: userInfo.username,
          version: userInfo.version
        }));
        // 更新设备信息（保留原有的 firstDiscovered）
        const existingDevice = deviceStore.getDevice(peerId);
        deviceStore.addOrUpdateDevice({
          peerId,
          username: userInfo.username,
          avatar: userInfo.avatar,
          lastHeartbeat: Date.now(),
          firstDiscovered: existingDevice?.firstDiscovered || Date.now(),
          userInfoVersion: userInfo.version,
        });

        // 同时更新联系人信息
        const contact = chatStore.getContact(peerId);
        if (contact) {
          chatStore.addOrUpdateContact({
            ...contact,
            username: userInfo.username,
            avatar: userInfo.avatar,
            lastSeen: Date.now(),
          });
        }

        return userInfo;
      }
    } catch (error) {
      console.error('[Peer] Request user info error:', error);
    }
    return null;
  }

  function init(): Promise<PeerHttpUtil> {
    return new Promise((resolve, reject) => {
      // 总是重新初始化 peerInstance，确保连接有效
      if (peerInstance) {
        peerInstance.destroy();
        peerInstance = null;
      }

      // 优先使用已存储的 PeerId，保持不变
      let peerId = userStore.userInfo.peerId;

      // 如果没有存储的 PeerId，生成新的
      if (!peerId) {
        const username = userStore.userInfo.username || 'user';
        peerId = `${username}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      }

      console.log('[Peer] Initializing with PeerId:', peerId);
      peerInstance = new PeerHttpUtil(peerId);

      // 用于跟踪是否已经 resolve/reject
      let settled = false;

      // 设置连接超时
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          console.error('[Peer] Connection timeout');
          isConnected.value = false;
          reject(new Error('Peer connection timeout'));
        }
      }, 30000); // 30秒超时

      // 注册所有协议处理器（在 'open' 事件前注册，避免错过早期消息）
      registerProtocolHandlers();

      peerInstance.on('open', (id: string) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          isConnected.value = true;
          userStore.setPeerId(id);
          console.log('[Peer] Connected with ID:', id);

          // 连接成功，停止自动重连
          stopReconnect();

          resolve(peerInstance!);
        }
      });

      // 监听断开连接事件
      peerInstance.on('disconnected', () => {
        console.warn('[Peer] Disconnected from Peer Server');
        isConnected.value = false;
        // 启动自动重连
        startReconnect();
      });

      // 监听连接关闭事件
      peerInstance.on('close', () => {
        console.warn('[Peer] Peer connection closed');
        isConnected.value = false;
        // 启动自动重连
        startReconnect();
      });

      // 不要依赖 getId() 来判断连接状态，因为 getId() 可能立即返回传入的 peerId
      // 而不是等待连接成功。我们只依赖 'open' 事件。

      // 监听底层 PeerJS 错误
      peerInstance.on('error', (error: any) => {
        console.error('[Peer] PeerJS error:', error);
        // 如果是严重的连接错误，reject Promise
        if (!settled && (error?.type === 'peer-unavailable' || error?.type === 'network' || error?.type === 'server-error' || error?.type === 'socket-error' || error?.type === 'socket-closed')) {
          settled = true;
          clearTimeout(timeout);
          isConnected.value = false;
          reject(new Error(`Peer connection failed: ${error?.type || 'unknown error'}`));
        }
        // 某些错误可以忽略，如 peer-unavailable（对端离线）
        if (error?.type === 'peer-unavailable') {
          console.log('[Peer] Target peer unavailable:', error);
        }
      });
    });
  }

  function registerProtocolHandlers() {
    if (!peerInstance) return;

    // 处理送达确认
    deliveryAckHandler = (protocol: any, _from: string) => {
      if (protocol.type === 'delivery_ack') {
        const { messageId } = protocol;
        commLog.message.delivered({ from: _from, messageId });
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
        commLog.discovery.found({ peerId: _from });
        // 更新在线设备列表
        devices?.forEach((device: OnlineDevice) => {
          peerInstance?.addDiscoveredDevice(device);
        });
      }
    };

    peerInstance.onProtocol('discovery_response', discoveryResponseHandler);

    // 处理发现通知
    discoveryNotificationHandler = (protocol: any, from: string) => {
      console.log('[Peer] discoveryNotificationHandler called:', { type: protocol.type, from });
      if (protocol.type === 'discovery_notification') {
        const { fromUsername, fromAvatar } = protocol;
        commLog.discovery.notified({ from, username: fromUsername });
        console.log('[Peer] Received discovery notification from:', from, 'username:', fromUsername);

        // 对端发现了我，添加到发现中心的设备列表（保留原有的 firstDiscovered）
        const existingDevice = deviceStore.getDevice(from);
        const device: OnlineDevice = {
          peerId: from,
          username: fromUsername,
          avatar: fromAvatar,
          lastHeartbeat: Date.now(),
          firstDiscovered: existingDevice?.firstDiscovered || Date.now(),
          isOnline: true,
        };

        console.log('[Peer] Adding device to store:', device);

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
            chatVersion: 0,
          });
          message.info(`${fromUsername} 发现了你`);
        }
      }
    };

    peerInstance.onProtocol('discovery_notification', discoveryNotificationHandler);

    // 处理用户名查询
    usernameQueryHandler = (_protocol: any, from: string) => {
      if (_protocol.type === 'username_query') {
        commLog.discovery.query({ from });
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
        commLog.discovery.response({ to: _from, username });
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
        // 检查对方的版本号，如果不一致则请求用户信息
        const { userInfoVersion: theirVersion } = _protocol;
        const device = deviceStore.getDevice(from);
        const storedVersion = device?.userInfoVersion || 0;

        commLog.heartbeat.response({ to: from, version: userStore.userInfo.version });

        // 响应我的在线状态（带上我的版本号）
        peerInstance?.respondOnlineCheck(
          from,
          userStore.userInfo.username || '',
          userStore.userInfo.avatar,
          userStore.userInfo.version,
        );

        // 检查对方版本号，如果不一致则请求用户信息
        if (theirVersion !== undefined && theirVersion !== storedVersion) {
          commLog.sync.versionMismatch({ peerId: from, stored: storedVersion, theirs: theirVersion });
          commLog.sync.requestInfo({ to: from });
          // 异步请求用户信息
          requestUserInfo(from);
        }
      }
    };

    peerInstance.onProtocol('online_check_query', onlineCheckQueryHandler);

    // 处理在线检查响应
    onlineCheckResponseHandler = (protocol: any, _from: string) => {
      if (protocol.type === 'online_check_response') {
        const { isOnline, username, avatar, userInfoVersion } = protocol;
        const device = deviceStore.getDevice(_from);
        const storedVersion = device?.userInfoVersion || 0;

        // 更新设备信息（保留原有的 firstDiscovered）
        deviceStore.addOrUpdateDevice({
          peerId: _from,
          username,
          avatar,
          lastHeartbeat: Date.now(),
          firstDiscovered: device?.firstDiscovered || Date.now(),
          userInfoVersion,
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

        // 检查版本号是否不一致，不一致则请求用户信息
        if (userInfoVersion !== undefined && userInfoVersion !== storedVersion) {
          commLog.sync.versionMismatch({ peerId: _from, stored: storedVersion, theirs: userInfoVersion });
          requestUserInfo(_from);
        }
      }
    };

    peerInstance.onProtocol('online_check_response', onlineCheckResponseHandler);

    // 处理用户信息查询
    userInfoQueryHandler = (_protocol: any, from: string) => {
      if (_protocol.type === 'user_info_query') {
        commLog.sync.respondInfo({ to: from, version: userStore.userInfo.version });
        // 响应我的用户信息
        peerInstance?.respondUserInfo(
          from,
          userStore.userInfo.username || '',
          userStore.userInfo.avatar,
          userStore.userInfo.version,
        );
      }
    };

    // 处理用户信息响应
    userInfoResponseHandler = (protocol: any, from: string) => {
      if (protocol.type === 'user_info_response') {
        const { username, avatar, version } = protocol;
        commLog.sync.updateInfo({ peerId: from, username, version });

        // 更新设备信息（保留原有的 firstDiscovered）
        const existingDevice = deviceStore.getDevice(from);
        deviceStore.addOrUpdateDevice({
          peerId: from,
          username,
          avatar,
          lastHeartbeat: Date.now(),
          firstDiscovered: existingDevice?.firstDiscovered || Date.now(),
          userInfoVersion: version,
        });

        // 同时更新联系人信息
        const contact = chatStore.getContact(from);
        if (contact) {
          chatStore.addOrUpdateContact({
            ...contact,
            username,
            avatar,
            lastSeen: Date.now(),
          });
        }
      }
    };

    peerInstance.onProtocol('user_info_query', userInfoQueryHandler);
    peerInstance.onProtocol('user_info_response', userInfoResponseHandler);

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
    const { id, type } = chatMessage;

    commLog.message.received({ from, msgType: type, messageId: id });

    const chatMessageLog = JSON.stringify({
      id,
      from,
      to: chatMessage.to,
      type,
      timestamp: chatMessage.timestamp
    });
    console.log('[Peer] Handling chat message:', chatMessageLog.substring(0, 200));

    // 去重已在 PeerHttpUtil 的版本号机制中处理，无需再次检查

    const contact = chatStore.getContact(from);

    // 对方发送消息，说明对方在线了
    chatStore.setContactOnline(from, true);

    console.log('[Peer] Contact online: ' + from);

    // 如果是未知联系人，添加到联系人列表
    if (!contact) {
      chatStore.addOrUpdateContact({
        peerId: from,
        username: from,
        avatar: null,
        online: true,
        lastSeen: Date.now(),
        unreadCount: 1,
        chatVersion: 0,
      });

      message.info('新设备加入聊天');
    } else {
      chatStore.incrementUnread(from);
      console.log('[Peer] Incremented unread for ' + from);
    }

    // 保存消息（状态已设置为 delivered）
    chatStore.addMessage(from, chatMessage);

    console.log('[Peer] Message saved to store: ' + chatMessage.id);

    // 送达确认已在 PeerHttpUtil 的 handleMessageContent 中自动发送
    // 这里不需要再发送

    // 对方上线了，检查是否有待发送的消息
    await retryPendingMessages(from);
  }

  async function retryPendingMessages(peerId: string) {
    const pending = chatStore.getPendingMessagesForPeer(peerId);
    if (pending.length === 0) return;

    console.log('[Peer] Retrying ' + pending.length + ' pending messages for ' + peerId);

    for (const pendingMsg of pending) {
      // 重试时使用 isRetry=true，只发送消息ID
      const success = await sendChatMessage(
        peerId,
        pendingMsg.id,
        pendingMsg.content,
        pendingMsg.type,
        true, // isRetry = true，只发送消息ID
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
   * @param isRetry - 是否为重试（重试时只发送消息ID）
   */
  async function sendChatMessage(
    peerId: string,
    messageId: string,
    content: MessageContent,
    type: MessageType = 'text',
    isRetry: boolean = false,
  ): Promise<boolean> {
    if (!peerInstance) {
      console.error('[Peer] Peer instance not initialized');
      message.error('Peer 未连接');
      return false;
    }

    console.log('[Peer] Sending chat message: peerId=' + peerId + ', messageId=' + messageId + ', type=' + type + ', isRetry=' + isRetry);

    try {
      const result = await peerInstance.send(peerId, messageId, content, type, isRetry);
      const resultLog = JSON.stringify({
        peerId: result.peerId,
        messageId: result.messageId,
        sent: result.sent,
        stage: result.stage
      });
      console.log('[Peer] Send result: ' + resultLog.substring(0, 200));

      // 更新消息的 messageStage
      if (result.sent && result.stage) {
        chatStore.updateMessageStatus(peerId, messageId, 'sending');
        const msg = chatStore.getMessageById(messageId);
        if (msg) {
          msg.messageStage = result.stage;
        }
      }

      return result.sent;
    } catch (error) {
      console.error('[Peer] Send error: ' + String(error));
      return false;
    }
  }

  /**
   * 生成消息唯一ID
   */
  function generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * 发送消息并处理重试
   */
  async function sendMessageWithRetry(
    peerId: string,
    content: MessageContent,
    type: MessageType = 'text',
  ): Promise<string> {
    // 确保 Peer 已连接
    if (!isConnected.value || !peerInstance) {
      console.error('[Peer] Peer not connected, cannot send message');
      message.error('Peer 未连接，请稍后重试');
      throw new Error('Peer not connected');
    }

    const messageId = generateMessageId();

    commLog.message.send({ to: peerId, msgType: type, messageId });

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
    console.log('[Peer] Message added to local store: ' + chatMessage.id);

    // 尝试发送
    const success = await sendChatMessage(peerId, messageId, content, type);

    console.log('[Peer] Send result: messageId=' + messageId + ', success=' + success);

    if (success) {
      // 发送成功，等待送达确认（状态保持为 sending）
      // 当收到 delivery_ack 时，状态会更新为 delivered
      chatStore.updateMessageStatus(peerId, messageId, 'sending');
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
      commLog.discovery.add({ peerId });
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
    if (!peerInstance) {
      console.warn('[Peer] sendDiscoveryNotification: peerInstance is null');
      return;
    }

    try {
      console.log('[Peer] Sending discovery notification to:', peerId, 'username:', userStore.userInfo.username);
      commLog.discovery.notify({ to: peerId, username: userStore.userInfo.username });
      await peerInstance.sendDiscoveryNotification(
        peerId,
        userStore.userInfo.username || '',
        userStore.userInfo.avatar,
      );
      console.log('[Peer] Discovery notification sent successfully to:', peerId);
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
      commLog.discovery.query({ from: peerId });
      return await peerInstance.queryUsername(peerId);
    } catch (error) {
      console.error('[Peer] Query username error: ' + String(error));
      return null;
    }
  }

  /**
   * 在线检查：查询指定设备是否在线（带上版本号）
   */
  async function checkOnline(peerId: string): Promise<boolean> {
    if (!peerInstance) {
      return false;
    }

    try {
      commLog.heartbeat.check({ to: peerId, version: userStore.userInfo.version });
      const result = await peerInstance.checkOnline(
        peerId,
        userStore.userInfo.username || '',
        userStore.userInfo.avatar,
        userStore.userInfo.version,
      );
      if (result !== null) {
        commLog.heartbeat.online({ from: peerId });
      }
      return result !== null;
    } catch (error) {
      console.error('[Peer] Check online error: ' + String(error));
      commLog.heartbeat.offline({ peerId });
      return false;
    }
  }

  function destroy() {
    // 停止自动重连
    stopReconnect();

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
    // 不要停止心跳定时器，让它在全局持续运行
    // deviceStore.stopHeartbeatTimer();
  }

  // 不要在组件卸载时销毁 peer 实例，保持全局单例
  // onUnmounted(() => {
  //   destroy();
  // });

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
    checkOnline,
    requestUserInfo,
    destroy,
    deviceStore,
  };
}
