/**
 * 五段式协议业务场景适配器
 *
 * 为不同业务场景提供预配置的适配器，简化五段式协议的使用
 *
 * 支持的业务场景：
 * - 头像传输
 * - 用户名传输
 * - 设备列表传输
 * - 聊天消息传输
 */

import {
  FiveStageProtocol,
  BusinessType,
  type DataIdGenerator,
  type FiveStageHandler,
  AvatarDataIdGenerator,
  UsernameDataIdGenerator,
  DeviceListDataIdGenerator,
  ChatMessageDataIdGenerator,
} from './FiveStageProtocol';

// ==================== 头像传输适配器 ====================

/**
 * 头像传输数据
 */
export interface AvatarTransferData {
  username?: string;                        // 用户名（可选）
  avatar: string | null;                    // 头像（base64）
}

/**
 * 头像传输处理器
 */
export interface AvatarTransferHandler extends FiveStageHandler<AvatarTransferData> {
  onAvatarReceived?: (avatar: string | null, from: string, username?: string) => void;
  onAvatarDelivered?: (avatarId: string, to: string) => void;
}

/**
 * 创建头像传输适配器
 */
export function createAvatarAdapter(
  protocol: FiveStageProtocol,
  handler: AvatarTransferHandler,
): {
  sendAvatar: (peerId: string, avatar: string | null, username?: string) => Promise<{ avatarId: string; version: number; sent: boolean }>;
} {
  // 注册处理器
  protocol.registerHandler(BusinessType.AVATAR, {
    onDataReceived: (data: AvatarTransferData, from: string) => {
      handler.onAvatarReceived?.(data.avatar, from, data.username);
    },
    onDeliveryAck: (dataId: string, _version: number, to: string) => {
      handler.onAvatarDelivered?.(dataId, to);
    },
  });

  // 创建ID生成器
  const idGenerator = new AvatarDataIdGenerator();

  return {
    sendAvatar: async (peerId: string, avatar: string | null, username?: string) => {
      const data: AvatarTransferData = { avatar, username };
      // 使用头像数据生成 ID
      const dataId = idGenerator.generate(avatar);
      // 创建自定义 ID 生成器，返回预生成的 ID
      const customIdGenerator: DataIdGenerator<AvatarTransferData> = {
        dataType: idGenerator.dataType,
        generate: (_data: AvatarTransferData, _context?: string) => dataId,
      };
      const result = await protocol.send(peerId, BusinessType.AVATAR, customIdGenerator, data);
      return {
        avatarId: result.dataId,
        version: result.version,
        sent: result.sent,
      };
    },
  };
}

// ==================== 用户名传输适配器 ====================

/**
 * 用户名传输数据
 */
export interface UsernameTransferData {
  username: string;                         // 用户名
  version: number;                          // 用户信息版本号
}

/**
 * 用户名传输处理器
 */
export interface UsernameTransferHandler extends FiveStageHandler<UsernameTransferData> {
  onUsernameReceived?: (username: string, from: string, version: number) => void;
  onUsernameDelivered?: (usernameId: string, to: string) => void;
}

/**
 * 创建用户名传输适配器
 */
export function createUsernameAdapter(
  protocol: FiveStageProtocol,
  handler: UsernameTransferHandler,
): {
  sendUsername: (peerId: string, username: string, version: number) => Promise<{ usernameId: string; version: number; sent: boolean }>;
} {
  // 注册处理器
  protocol.registerHandler(BusinessType.USERNAME, {
    onDataReceived: (data: UsernameTransferData, from: string) => {
      handler.onUsernameReceived?.(data.username, from, data.version);
    },
    onDeliveryAck: (dataId: string, _version: number, to: string) => {
      handler.onUsernameDelivered?.(dataId, to);
    },
  });

  // 创建ID生成器
  const idGenerator = new UsernameDataIdGenerator();

  return {
    sendUsername: async (peerId: string, username: string, version: number) => {
      const data: UsernameTransferData = { username, version };
      // 使用用户名数据生成 ID
      const dataId = idGenerator.generate(username);
      // 创建自定义 ID 生成器，返回预生成的 ID
      const customIdGenerator: DataIdGenerator<UsernameTransferData> = {
        dataType: idGenerator.dataType,
        generate: (_data: UsernameTransferData, _context?: string) => dataId,
      };
      const result = await protocol.send(peerId, BusinessType.USERNAME, customIdGenerator, data);
      return {
        usernameId: result.dataId,
        version: result.version,
        sent: result.sent,
      };
    },
  };
}

// ==================== 设备列表传输适配器 ====================

/**
 * 设备列表传输数据
 */
export interface DeviceListTransferData {
  devices: Array<{                         // 设备列表
    peerId: string;
    username: string;
    avatar: string | null;
    lastHeartbeat: number;
    firstDiscovered: number;
    isOnline: boolean;
    userInfoVersion?: number;
    networkAccelerationEnabled?: boolean;
    isBootstrap?: boolean;
    realPeerId?: string;
  }>;
  listId: string;                           // 列表唯一标识（用户局部唯一）
  timestamp: number;                        // 列表生成时间
}

/**
 * 设备列表传输处理器
 */
export interface DeviceListTransferHandler extends FiveStageHandler<DeviceListTransferData> {
  onDeviceListReceived?: (devices: DeviceListTransferData['devices'], from: string, listId: string) => void;
  onDeviceListDelivered?: (listId: string, to: string) => void;
}

/**
 * 创建设备列表传输适配器
 */
export function createDeviceListAdapter(
  protocol: FiveStageProtocol,
  handler: DeviceListTransferHandler,
): {
  sendDeviceList: (peerId: string, devices: DeviceListTransferData['devices']) => Promise<{ listId: string; version: number; sent: boolean }>;
} {
  // 注册处理器
  protocol.registerHandler(BusinessType.DEVICE_LIST, {
    onDataReceived: (data: DeviceListTransferData, from: string) => {
      handler.onDeviceListReceived?.(data.devices, from, data.listId);
    },
    onDeliveryAck: (dataId: string, _version: number, to: string) => {
      handler.onDeviceListDelivered?.(dataId, to);
    },
  });

  return {
    sendDeviceList: async (peerId: string, devices: DeviceListTransferData['devices']) => {
      // 生成设备列表ID（用户局部唯一）
      const peerIds = devices.map((d) => d.peerId);
      const deviceIdGenerator = new DeviceListDataIdGenerator();
      const listId = deviceIdGenerator.generate(peerIds);

      const data: DeviceListTransferData = {
        devices,
        listId,
        timestamp: Date.now(),
      };

      // 创建自定义 ID 生成器，返回预生成的 ID
      const customIdGenerator: DataIdGenerator<DeviceListTransferData> = {
        dataType: deviceIdGenerator.dataType,
        generate: (_data: DeviceListTransferData, _context?: string) => listId,
      };

      const result = await protocol.send(peerId, BusinessType.DEVICE_LIST, customIdGenerator, data);
      return {
        listId: result.dataId,
        version: result.version,
        sent: result.sent,
      };
    },
  };
}

// ==================== 聊天消息传输适配器 ====================

/**
 * 聊天消息传输数据
 */
export interface ChatMessageTransferData {
  message: {                               // 聊天消息
    id: string;
    from: string;
    to: string;
    content: any;
    timestamp: number;
    status: 'sending' | 'sent' | 'delivered' | 'failed';
    type: 'text' | 'image' | 'file' | 'video' | 'system';
  };
  messageId: string;                        // 消息ID
}

/**
 * 聊天消息传输处理器
 */
export interface ChatMessageTransferHandler extends FiveStageHandler<ChatMessageTransferData> {
  onMessageReceived?: (message: ChatMessageTransferData['message'], from: string) => void;
  onMessageDelivered?: (messageId: string, to: string) => void;
}

/**
 * 创建聊天消息传输适配器
 */
export function createChatMessageAdapter(
  protocol: FiveStageProtocol,
  handler: ChatMessageTransferHandler,
): {
  sendMessage: (peerId: string, message: ChatMessageTransferData['message']) => Promise<{ messageId: string; version: number; sent: boolean }>;
} {
  // 注册处理器
  protocol.registerHandler(BusinessType.CHAT_MESSAGE, {
    onDataReceived: (data: ChatMessageTransferData, from: string) => {
      handler.onMessageReceived?.(data.message, from);
    },
    onDeliveryAck: (dataId: string, _version: number, to: string) => {
      handler.onMessageDelivered?.(dataId, to);
    },
  });

  // 创建ID生成器
  const idGenerator = new ChatMessageDataIdGenerator();

  return {
    sendMessage: async (peerId: string, message: ChatMessageTransferData['message']) => {
      const data: ChatMessageTransferData = { message, messageId: message.id };
      // 使用消息对象生成 ID
      const dataId = idGenerator.generate({ id: message.id });
      // 创建自定义 ID 生成器，返回预生成的 ID
      const customIdGenerator: DataIdGenerator<ChatMessageTransferData> = {
        dataType: idGenerator.dataType,
        generate: (_data: ChatMessageTransferData, _context?: string) => dataId,
      };
      const result = await protocol.send(peerId, BusinessType.CHAT_MESSAGE, customIdGenerator, data);
      return {
        messageId: result.dataId,
        version: result.version,
        sent: result.sent,
      };
    },
  };
}

// ==================== 组合适配器 ====================

/**
 * 完整的五段式协议适配器套件
 * 提供所有业务场景的发送方法
 */
export interface FiveStageAdapterSuite {
  // 头像传输
  sendAvatar: (peerId: string, avatar: string | null, username?: string) => Promise<{ avatarId: string; version: number; sent: boolean }>;

  // 用户名传输
  sendUsername: (peerId: string, username: string, version: number) => Promise<{ usernameId: string; version: number; sent: boolean }>;

  // 设备列表传输
  sendDeviceList: (peerId: string, devices: DeviceListTransferData['devices']) => Promise<{ listId: string; version: number; sent: boolean }>;

  // 聊天消息传输
  sendMessage: (peerId: string, message: ChatMessageTransferData['message']) => Promise<{ messageId: string; version: number; sent: boolean }>;
}

/**
 * 创建完整的五段式协议适配器套件
 */
export function createFiveStageAdapterSuite(
  protocol: FiveStageProtocol,
  handlers: {
    avatar?: AvatarTransferHandler;
    username?: UsernameTransferHandler;
    deviceList?: DeviceListTransferHandler;
    chatMessage?: ChatMessageTransferHandler;
  },
): FiveStageAdapterSuite {
  const adapters: FiveStageAdapterSuite = {
    sendAvatar: async () => ({ avatarId: '', version: 0, sent: false }),
    sendUsername: async () => ({ usernameId: '', version: 0, sent: false }),
    sendDeviceList: async () => ({ listId: '', version: 0, sent: false }),
    sendMessage: async () => ({ messageId: '', version: 0, sent: false }),
  };

  if (handlers.avatar) {
    const avatarAdapter = createAvatarAdapter(protocol, handlers.avatar);
    adapters.sendAvatar = avatarAdapter.sendAvatar;
  }

  if (handlers.username) {
    const usernameAdapter = createUsernameAdapter(protocol, handlers.username);
    adapters.sendUsername = usernameAdapter.sendUsername;
  }

  if (handlers.deviceList) {
    const deviceListAdapter = createDeviceListAdapter(protocol, handlers.deviceList);
    adapters.sendDeviceList = deviceListAdapter.sendDeviceList;
  }

  if (handlers.chatMessage) {
    const chatMessageAdapter = createChatMessageAdapter(protocol, handlers.chatMessage);
    adapters.sendMessage = chatMessageAdapter.sendMessage;
  }

  return adapters;
}
