import type { OnlineDevice } from '../../types';
import { useChatStore } from '../../stores/chatStore';
import { useDeviceStore } from '../../stores/deviceStore';
import { useUserStore } from '../../stores/userStore';
import { commLog } from '../../util/logger';
import { peerInstance, handlers, processingDeviceListRequests } from './state';
import { requestUserInfo } from './discovery';
import { requestDeviceList } from './discovery';

/**
 * 协议处理器注册模块
 */

/**
 * 注册所有协议处理器
 */
export function registerProtocolHandlers(instance: any): any {
  const chatStore = useChatStore();
  const deviceStore = useDeviceStore();
  const userStore = useUserStore();

  // 处理送达确认
  handlers.deliveryAck = (protocol: any, _from: string) => {
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

  instance.onProtocol('delivery_ack', handlers.deliveryAck);

  // 处理发现中心响应
  handlers.discoveryResponse = (protocol: any, from: string) => {
    if (protocol.type === 'discovery_response') {
      // 检查是否是设备列表响应
      if (protocol.devices) {
        const { devices } = protocol;
        commLog.discovery.found({ peerId: from });
        // 更新在线设备列表
        devices?.forEach((device: OnlineDevice) => {
          instance?.addDiscoveredDevice(device);
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

        // 同时更新 instance 和 deviceStore
        instance?.addDiscoveredDevice(deviceInfo);
        deviceStore.addOrUpdateDevice(deviceInfo);

        // 触发自定义事件，通知 UI 自动刷新
        window.dispatchEvent(new CustomEvent('discovery-devices-updated'));
      }
    }
  };

  instance.onProtocol('discovery_response', handlers.discoveryResponse);

  // 处理发现通知
  handlers.discoveryNotification = (protocol: any, from: string) => {
    console.log('[Peer] discoveryNotificationHandler called:', { type: protocol.type, from });
    if (protocol.type === 'discovery_notification') {
      const { fromUsername, fromAvatar, profileVersion } = protocol;
      commLog.discovery.notified({ from, username: fromUsername });
      console.log('[Peer] Received discovery notification from:', from, 'username:', fromUsername, 'profileVersion:', profileVersion);

      // 对端发现了我，添加到发现中心的设备列表（保留原有的 firstDiscovered）
      const existingDevice = deviceStore.getDevice(from);

      // 检查是否需要更新个人信息
      const needsUpdate =
        !existingDevice || existingDevice.userInfoVersion === undefined || existingDevice.userInfoVersion < profileVersion;

      const device: OnlineDevice = {
        peerId: from,
        username: fromUsername,
        avatar: fromAvatar,
        lastHeartbeat: Date.now(),
        firstDiscovered: existingDevice?.firstDiscovered || Date.now(),
        isOnline: true,
        userInfoVersion: profileVersion,
      };

      console.log('[Peer] Adding device to store:', device);

      // 同时添加到 instance 和 deviceStore
      instance?.addDiscoveredDevice(device);
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
      }

      // 发送响应，包含我的用户名和头像
      // 这样对端就能知道我的用户信息，而不需要额外查询
      const currentUsername = userStore.userInfo.username || '';
      const currentAvatar = userStore.userInfo.avatar;
      console.log('[Peer] Sending discovery response to:', from, 'username:', currentUsername, 'avatar:', currentAvatar);
      instance?.sendDiscoveryResponse(from, currentUsername, currentAvatar);

      // 如果需要更新个人信息，主动请求
      if (needsUpdate && existingDevice !== undefined) {
        console.log('[Peer] Profile version mismatch, requesting latest user info from:', from);
        requestUserInfo(from);
      }

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

  instance.onProtocol('discovery_notification', handlers.discoveryNotification);

  // 处理用户名查询
  handlers.usernameQuery = (_protocol: any, from: string) => {
    if (_protocol.type === 'username_query') {
      commLog.discovery.query({ from });
      // 响应我的用户信息
      instance?.respondUsernameQuery(from, userStore.userInfo.username || '', userStore.userInfo.avatar);
    }
  };

  instance.onProtocol('username_query', handlers.usernameQuery);

  // 处理用户名响应
  handlers.usernameResponse = (protocol: any, _from: string) => {
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
      // 同时更新 instance 和 deviceStore
      instance?.addDiscoveredDevice(deviceInfo);
      deviceStore.addOrUpdateDevice(deviceInfo);
    }
  };

  instance.onProtocol('username_response', handlers.usernameResponse);

  // 处理在线检查查询
  handlers.onlineCheckQuery = (_protocol: any, from: string) => {
    if (_protocol.type === 'online_check_query') {
      // 检查对方的版本号，如果不一致则请求用户信息
      const { userInfoVersion: theirVersion } = _protocol;
      const device = deviceStore.getDevice(from);
      const storedVersion = device?.userInfoVersion || 0;

      commLog.heartbeat.response({ to: from, version: userStore.userInfo.version });

      // 响应我的在线状态（带上我的版本号）
      instance?.respondOnlineCheck(from, userStore.userInfo.username || '', userStore.userInfo.avatar, userStore.userInfo.version);

      // 检查对方版本号，如果不一致则请求用户信息
      if (theirVersion !== undefined && theirVersion !== storedVersion) {
        commLog.sync.versionMismatch({ peerId: from, stored: storedVersion, theirs: theirVersion });
        commLog.sync.requestInfo({ to: from });
        // 异步请求用户信息
        requestUserInfo(from);
      }
    }
  };

  instance.onProtocol('online_check_query', handlers.onlineCheckQuery);

  // 处理在线检查响应
  handlers.onlineCheckResponse = (protocol: any, _from: string) => {
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

  instance.onProtocol('online_check_response', handlers.onlineCheckResponse);

  // 处理用户信息查询
  handlers.userInfoQuery = (_protocol: any, from: string) => {
    if (_protocol.type === 'user_info_query') {
      commLog.sync.respondInfo({ to: from, version: userStore.userInfo.version });
      // 响应我的用户信息
      instance?.respondUserInfo(from, userStore.userInfo.username || '', userStore.userInfo.avatar, userStore.userInfo.version);
    }
  };

  // 处理用户信息响应
  handlers.userInfoResponse = (protocol: any, from: string) => {
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

  instance.onProtocol('user_info_query', handlers.userInfoQuery);
  instance.onProtocol('user_info_response', handlers.userInfoResponse);

  // 处理用户信息更新通知
  handlers.userInfoUpdate = (protocol: any, from: string) => {
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

  instance.onProtocol('user_info_update' as any, handlers.userInfoUpdate);

  // 处理网络加速状态同步
  handlers.networkAccelerationStatus = (protocol: any, from: string) => {
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

  instance.onProtocol('network_acceleration_status', handlers.networkAccelerationStatus);

  // 处理设备列表响应
  handlers.deviceListResponse = (protocol: any) => {
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
          // 同时添加到 instance.discoveredDevices，确保数据同步
          instance?.addDiscoveredDevice(device);
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

  instance.onProtocol('device_list_response', handlers.deviceListResponse);

  // 处理设备列表请求
  handlers.deviceListRequest = (_protocol: any, from: string) => {
    if (_protocol.type === 'device_list_request') {
      commLog.deviceDiscovery.requestReceived({ from });
      // 响应我的设备列表
      const devices = deviceStore.allDevices;
      instance?.sendDeviceListResponse(from, devices);
    }
  };

  instance.onProtocol('device_list_request', handlers.deviceListRequest);

  return instance;
}
