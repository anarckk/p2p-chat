import { ref } from 'vue';
import Peer from 'peerjs';
import { PeerHttpUtil } from '../util/PeerHttpUtil';
import { useChatStore } from '../stores/chatStore';
import { useUserStore } from '../stores/userStore';
import { useDeviceStore } from '../stores/deviceStore';
import type { ChatMessage, MessageType, MessageContent, OnlineDevice } from '../types';
import { message } from 'ant-design-vue';
import { commLog } from '../util/logger';

let peerInstance: PeerHttpUtil | null = null;
let bootstrapPeerInstance: Peer | null = null;
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
let userInfoUpdateHandler: ((protocol: any, from: string) => void) | null = null;
let relayMessageHandler: ((protocol: any, from: string) => void) | null = null;
let relayResponseHandler: ((protocol: any, from: string) => void) | null = null;
let networkAccelerationStatusHandler: ((protocol: any, from: string) => void) | null = null;
let deviceListRequestHandler: ((protocol: any, from: string) => void) | null = null;
let deviceListResponseHandler: ((protocol: any, from: string) => void) | null = null;

// 设备互相发现：正在处理的设备集合（避免无限递归）
const processingDeviceListRequests = new Set<string>();

// 自动重连相关
let reconnectTimer: number | null = null;
let isReconnecting = false;
const RECONNECT_INTERVAL = 10000; // 10秒重连间隔

// 连接状态：模块级别的 ref，确保所有调用共享同一个响应式状态
const isConnected = ref(false);

export function usePeerManager() {
  const chatStore = useChatStore();
  const userStore = useUserStore();
  const deviceStore = useDeviceStore();

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
        // PeerJS ID 不能包含中文字符，需要使用字母数字组合
        // 使用时间戳和随机字符串，确保唯一性
        const timestamp = Date.now().toString(36);
        const randomStr = Math.random().toString(36).substring(2, 11);
        peerId = `peer_${timestamp}_${randomStr}`;
      }

      console.log('[Peer] Initializing with PeerId:', peerId, 'at', new Date().toISOString());

      // PeerJS 配置，增加调试信息
      const peerOptions = {
        debug: 2, // 增加调试级别
      };

      peerInstance = new PeerHttpUtil(peerId, peerOptions);

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
    discoveryResponseHandler = (protocol: any, from: string) => {
      if (protocol.type === 'discovery_response') {
        // 检查是否是设备列表响应
        if (protocol.devices) {
          const { devices } = protocol;
          commLog.discovery.found({ peerId: from });
          // 更新在线设备列表
          devices?.forEach((device: OnlineDevice) => {
            peerInstance?.addDiscoveredDevice(device);
          });
        }
        // 检查是否是用户信息响应（来自发现通知的响应）
        else if (protocol.username) {
          const { username, avatar } = protocol;
          console.log('[Peer] Received discovery response from:', from, 'username:', username);

          // 更新设备信息
          const existingDevice = deviceStore.getDevice(from);
          const deviceInfo: OnlineDevice = {
            peerId: from,
            username,
            avatar,
            lastHeartbeat: Date.now(),
            firstDiscovered: existingDevice?.firstDiscovered || Date.now(),
            isOnline: true,
          };

          // 同时更新 peerInstance 和 deviceStore
          peerInstance?.addDiscoveredDevice(deviceInfo);
          deviceStore.addOrUpdateDevice(deviceInfo);

          // 触发自定义事件，通知 UI 自动刷新
          window.dispatchEvent(new CustomEvent('discovery-devices-updated'));
        }
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

        // 发送响应，包含我的用户名和头像
        // 这样对端就能知道我的用户信息，而不需要额外查询
        peerInstance?.sendDiscoveryResponse(from, userStore.userInfo.username || '', userStore.userInfo.avatar);

        // 设备互相发现：向新发现的设备询问其设备列表
        requestDeviceList(from).then((devices) => {
          if (devices.length > 0) {
            console.log('[Peer] Discovered ' + devices.length + ' devices from ' + from);
          }
        }).catch((error) => {
          console.error('[Peer] Request device list error after discovery notification:', error);
        });
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
        // 获取现有设备信息以保留 firstDiscovered
        const existingDevice = deviceStore.getDevice(_from);
        const deviceInfo: OnlineDevice = {
          peerId: _from,
          username,
          avatar,
          lastHeartbeat: Date.now(),
          firstDiscovered: existingDevice?.firstDiscovered || Date.now(),
          isOnline: true,
        };
        // 同时更新 peerInstance 和 deviceStore
        peerInstance?.addDiscoveredDevice(deviceInfo);
        deviceStore.addOrUpdateDevice(deviceInfo);
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

    // 处理用户信息更新通知
    userInfoUpdateHandler = (protocol: any, from: string) => {
      if (protocol.type === 'user_info_update') {
        const { username, avatar, version } = protocol;
        console.log('[Peer] Received user info update from:', from, 'username:', username, 'version:', version);

        // 更新设备信息
        const existingDevice = deviceStore.getDevice(from);
        if (existingDevice) {
          // 只在版本号更新时才更新（避免回退）
          if (!existingDevice.userInfoVersion || version > existingDevice.userInfoVersion) {
            deviceStore.addOrUpdateDevice({
              ...existingDevice,
              username,
              avatar,
              userInfoVersion: version,
              lastHeartbeat: Date.now(),
            });

            // 同时更新聊天列表中的联系人信息
            const existingContact = chatStore.getContact(from);
            if (existingContact) {
              chatStore.addOrUpdateContact({
                peerId: from,
                username,
                avatar,
                online: true,
                lastSeen: Date.now(),
                unreadCount: existingContact.unreadCount || 0,
                chatVersion: existingContact.chatVersion || 0,
              });
            }

            // 触发自定义事件，通知 UI 自动刷新
            window.dispatchEvent(new CustomEvent('discovery-devices-updated'));

            console.log('[Peer] User info updated for device:', from);
          }
        }
      }
    };

    peerInstance.onProtocol('user_info_update' as any, userInfoUpdateHandler);

    // 处理网络加速状态同步
    networkAccelerationStatusHandler = (protocol: any, from: string) => {
      if (protocol.type === 'network_acceleration_status') {
        const { enabled } = protocol;
        console.log('[Peer] Network acceleration status from ' + from + ': ' + enabled);
        commLog.networkAcceleration.statusSync({ from, enabled });
        // 存储到 deviceStore 中
        const device = deviceStore.getDevice(from);
        if (device) {
          deviceStore.addOrUpdateDevice({
            ...device,
            networkAccelerationEnabled: enabled,
          });
        }
      }
    };

    peerInstance.onProtocol('network_acceleration_status', networkAccelerationStatusHandler);

    // 处理设备列表响应
    deviceListResponseHandler = (protocol: any) => {
      if (protocol.type === 'device_list_response') {
        const { devices } = protocol;
        commLog.deviceDiscovery.responseReceived({ deviceCount: devices?.length || 0 });
        // 合并到 deviceStore
        if (devices && devices.length > 0) {
          // 设备互相发现：先找出新设备，再添加到 deviceStore
          const newDevices: OnlineDevice[] = [];
          devices.forEach((device: OnlineDevice) => {
            const isNewDevice = !deviceStore.getDevice(device.peerId);
            if (isNewDevice && !processingDeviceListRequests.has(device.peerId)) {
              newDevices.push(device);
            }
          });

          // 添加所有设备到 deviceStore
          deviceStore.addDevices(devices);

          // 对新设备递归发起设备列表请求
          newDevices.forEach((device: OnlineDevice) => {
            // 标记为正在处理，避免无限递归
            processingDeviceListRequests.add(device.peerId);
            commLog.deviceDiscovery.newDevice({ peerId: device.peerId, username: device.username });

            requestDeviceList(device.peerId)
              .then((discoveredDevices) => {
                if (discoveredDevices.length > 0) {
                  console.log('[Peer] Discovered ' + discoveredDevices.length + ' more devices from ' + device.peerId);
                }
              })
              .catch((error) => {
                console.error('[Peer] Recursive device list request error:', error);
              })
              .finally(() => {
                // 处理完成后移除标记
                processingDeviceListRequests.delete(device.peerId);
              });
          });
        }
      }
    };

    peerInstance.onProtocol('device_list_response', deviceListResponseHandler);

    // 处理设备列表请求
    deviceListRequestHandler = (_protocol: any, from: string) => {
      if (_protocol.type === 'device_list_request') {
        commLog.deviceDiscovery.requestReceived({ from });
        // 响应我的设备列表
        const devices = deviceStore.allDevices;
        peerInstance?.sendDeviceListResponse(from, devices);
      }
    };

    peerInstance.onProtocol('device_list_request', deviceListRequestHandler);

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
      console.warn('[Peer] queryUsername: peerInstance is null');
      return null;
    }

    try {
      console.log('[Peer] Querying username for:', peerId);
      commLog.discovery.query({ from: peerId });
      const result = await peerInstance.queryUsername(peerId);
      console.log('[Peer] Query username result:', result);
      return result;
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
      if (result !== null && result.isOnline) {
        commLog.heartbeat.online({ from: peerId });
        return true;
      }
      if (result !== null && !result.isOnline) {
        commLog.heartbeat.offline({ peerId });
      }
      return result !== null && result.isOnline;
    } catch (error) {
      console.error('[Peer] Check online error: ' + String(error));
      commLog.heartbeat.offline({ peerId });
      return false;
    }
  }

  // ==================== 宇宙启动者 ====================

  /**
   * 尝试成为宇宙启动者
   * 使用固定的 peerId 尝试连接，如果成功则成为启动者并保持连接
   */
  async function tryBecomeBootstrap(): Promise<boolean> {
    const UNIVERSE_BOOTSTRAP_ID = 'UNIVERSE-BOOTSTRAP-PEER-ID-001';
    commLog.universeBootstrap.connecting();

    return new Promise((resolve) => {
      // 如果已经是启动者，直接返回
      if (bootstrapPeerInstance) {
        console.log('[Peer] Already is bootstrap');
        resolve(true);
        return;
      }

      // 设置超时，3秒内如果连接成功则说明没有其他启动者
      const successTimeout = setTimeout(() => {
        commLog.universeBootstrap.success({ peerId: UNIVERSE_BOOTSTRAP_ID });
        console.log('[Peer] Became the universe bootstrap! Keeping connection...');
        // 不销毁连接，保持启动者状态
        resolve(true);
      }, 3000);

      // 尝试创建 peer
      try {
        bootstrapPeerInstance = new Peer(UNIVERSE_BOOTSTRAP_ID, { host: 'localhost', port: 9000, path: '/peerjs' });

        bootstrapPeerInstance.on('open', (id: string) => {
          // 连接成功，说明我们是第一个启动者
          clearTimeout(successTimeout);
          commLog.universeBootstrap.success({ peerId: UNIVERSE_BOOTSTRAP_ID });
          console.log('[Peer] Became the universe bootstrap! ID:', id);

          // 监听设备列表请求
          bootstrapPeerInstance!.on('connection', (conn: any) => {
            conn.on('data', (data: any) => {
              if (data && data.type === 'device_list_request') {
                console.log('[Peer-Bootstrap] Received device list request from:', data.from);
                commLog.deviceDiscovery.requestReceived({ from: data.from });

                // 响应我的设备列表
                const devices = deviceStore.allDevices;
                const response = {
                  type: 'device_list_response',
                  from: UNIVERSE_BOOTSTRAP_ID,
                  to: data.from,
                  timestamp: Date.now(),
                  devices,
                };

                conn.send(response);
                commLog.deviceDiscovery.responseSent({ to: data.from, deviceCount: devices.length });
                console.log('[Peer-Bootstrap] Sent device list with', devices.length, 'devices');
              }
            });
          });

          console.log('[Peer-Bootstrap] Listening for device list requests...');
          resolve(true);
        });

        bootstrapPeerInstance.on('error', (error: any) => {
          if (!bootstrapPeerInstance) {
            // 已经被清理了
            return;
          }

          clearTimeout(successTimeout);
          commLog.universeBootstrap.failed({ error: error?.type });
          console.log('[Peer] Bootstrap already exists, requesting device list...');

          // 清理失败的连接
          if (bootstrapPeerInstance) {
            bootstrapPeerInstance.destroy();
            bootstrapPeerInstance = null;
          }

          // 向启动者请求设备列表
          requestBootstrapDeviceList(UNIVERSE_BOOTSTRAP_ID).then(() => {
            resolve(false);
          }).catch(() => {
            resolve(false);
          });
        });

        bootstrapPeerInstance.on('disconnected', () => {
          console.warn('[Peer-Bootstrap] Disconnected from server');
        });

        bootstrapPeerInstance.on('close', () => {
          console.log('[Peer-Bootstrap] Connection closed');
          bootstrapPeerInstance = null;
        });
      } catch (error) {
        clearTimeout(successTimeout);
        console.error('[Peer] Bootstrap error:', error);
        bootstrapPeerInstance = null;
        resolve(false);
      }
    });
  }

  /**
   * 向宇宙启动者请求设备列表
   * 使用原始 Peer 连接直接与启动者通信
   */
  async function requestBootstrapDeviceList(bootstrapPeerId: string): Promise<void> {
    commLog.universeBootstrap.requestList({ to: bootstrapPeerId });

    return new Promise((resolve) => {
      // 创建一个临时 Peer 连接向启动者请求设备列表
      // 注意：不需要依赖主 peerInstance，因为这是独立的临时连接
      let tempPeer: any = null;
      let conn: any = null;
      let timeoutId: number | null = null;

      const cleanup = () => {
        if (conn) {
          conn.close();
          conn = null;
        }
        if (tempPeer) {
          tempPeer.destroy();
          tempPeer = null;
        }
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      // 设置超时
      timeoutId = window.setTimeout(() => {
        console.warn('[Peer] Request bootstrap device list timeout');
        cleanup();
        resolve();
      }, 10000);

      try {
        // 创建临时 Peer 连接
        tempPeer = new Peer({ host: 'localhost', port: 9000, path: '/peerjs' });

        tempPeer.on('open', (myId: string) => {
          console.log('[Peer] Temp peer connected with ID:', myId);

          // 连接到启动者
          conn = tempPeer.connect(bootstrapPeerId);

          conn.on('open', () => {
            console.log('[Peer] Connected to bootstrap, requesting device list...');

            // 发送设备列表请求
            const request = {
              type: 'device_list_request',
              from: myId,
              to: bootstrapPeerId,
              timestamp: Date.now(),
            };

            conn.send(request);
          });

          conn.on('data', (data: any) => {
            if (data && data.type === 'device_list_response') {
              console.log('[Peer] Received device list from bootstrap:', data.devices?.length || 0, 'devices');
              commLog.universeBootstrap.responseList({ deviceCount: data.devices?.length || 0 });

              // 合并到 deviceStore
              if (data.devices && data.devices.length > 0) {
                deviceStore.addDevices(data.devices);
              }

              cleanup();
              resolve();
            }
          });

          conn.on('error', (error: any) => {
            console.error('[Peer] Bootstrap connection error:', error);
            cleanup();
            resolve();
          });

          conn.on('close', () => {
            cleanup();
            resolve();
          });
        });

        tempPeer.on('error', (error: any) => {
          console.error('[Peer] Temp peer error:', error);
          cleanup();
          resolve();
        });
      } catch (error) {
        console.error('[Peer] Request bootstrap device list error:', error);
        cleanup();
        resolve();
      }
    });
  }

  // ==================== 网络加速 ====================

  /**
   * 设置网络加速开关
   */
  function setNetworkAccelerationEnabled(enabled: boolean): void {
    if (peerInstance) {
      peerInstance.setNetworkAccelerationEnabled(enabled);
      if (enabled) {
        commLog.networkAcceleration.enabled();
      } else {
        commLog.networkAcceleration.disabled();
      }
    }
  }

  /**
   * 获取网络加速开关状态
   */
  function getNetworkAccelerationEnabled(): boolean {
    return peerInstance?.getNetworkAccelerationEnabled() || false;
  }

  /**
   * 发送网络加速状态给所有在线设备
   */
  async function broadcastNetworkAccelerationStatus(): Promise<void> {
    if (!peerInstance) {
      return;
    }

    const devices = deviceStore.allDevices;
    const enabled = peerInstance.getNetworkAccelerationEnabled();

    const promises = devices.map((device) => {
      if (device.isOnline) {
        return peerInstance!.sendNetworkAccelerationStatus(device.peerId).catch(() => {
          // 忽略错误
        });
      }
      return Promise.resolve();
    });

    await Promise.allSettled(promises);
  }

  /**
   * 广播用户信息更新给所有在线设备
   */
  async function broadcastUserInfoUpdate(): Promise<void> {
    if (!peerInstance) {
      return;
    }

    const devices = deviceStore.allDevices;
    const { username, avatar, version } = userStore.userInfo;

    console.log('[Peer] Broadcasting user info update to', devices.length, 'devices:', { username, version });

    const promises = devices.map((device) => {
      if (device.isOnline) {
        return peerInstance!.sendUserInfoUpdate(device.peerId, username, avatar, version).catch((error) => {
          console.warn('[Peer] Failed to send user info update to', device.peerId, error);
        });
      }
      return Promise.resolve();
    });

    await Promise.allSettled(promises);
    console.log('[Peer] User info update broadcast completed');
  }

  // ==================== 设备互相发现 ====================

  /**
   * 请求指定设备的在线设备列表
   */
  async function requestDeviceList(peerId: string): Promise<OnlineDevice[]> {
    if (!peerInstance) {
      return [];
    }

    commLog.deviceDiscovery.requestSent({ to: peerId });

    try {
      const devices = await peerInstance.requestDeviceList(peerId);
      // 合并到 deviceStore
      if (devices.length > 0) {
        deviceStore.addDevices(devices);
      }
      return devices;
    } catch (error) {
      console.error('[Peer] Request device list error:', error);
      return [];
    }
  }

  /**
   * 向所有在线设备请求设备列表
   */
  async function requestAllDeviceLists(): Promise<void> {
    if (!peerInstance) {
      return;
    }

    const devices = deviceStore.allDevices;
    console.log('[Peer] Requesting device lists from ' + devices.length + ' devices');

    const promises = devices.map((device) => {
      if (device.isOnline) {
        return requestDeviceList(device.peerId);
      }
      return Promise.resolve([]);
    });

    await Promise.allSettled(promises);
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

    // 清理启动者连接
    if (bootstrapPeerInstance) {
      bootstrapPeerInstance.destroy();
      bootstrapPeerInstance = null;
      console.log('[Peer] Bootstrap connection destroyed');
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
    // 宇宙启动者
    tryBecomeBootstrap,
    // 网络加速
    setNetworkAccelerationEnabled,
    getNetworkAccelerationEnabled,
    broadcastNetworkAccelerationStatus,
    // 设备互相发现
    requestDeviceList,
    requestAllDeviceLists,
    // 用户信息广播
    broadcastUserInfoUpdate,
  };
}
