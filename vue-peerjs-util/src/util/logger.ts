/**
 * 通讯日志工具
 * 用于记录P2P通讯的关键事件
 */

const MAX_STR_LENGTH = 200;
const MAX_FIELD_LENGTH = 200;

/**
 * 获取格式化的时间戳
 */
function getTimestamp(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * 截断字符串到指定长度
 */
function truncate(str: string, maxLength: number = MAX_STR_LENGTH): string {
  if (!str) return '';
  const s = String(str);
  return s.length > maxLength ? s.substring(0, maxLength) + '...' : s;
}

/**
 * 格式化对象为字符串，每个字段限制长度
 */
function formatObject(obj: any): string {
  if (!obj || typeof obj !== 'object') {
    return truncate(String(obj));
  }

  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
    parts.push(`${key}=${truncate(valueStr, MAX_FIELD_LENGTH)}`);
  }

  const result = parts.join(' ');
  return truncate(result, MAX_STR_LENGTH);
}

/**
 * 格式化 PeerId（只显示前8位和后8位）
 */
function formatPeerId(peerId: string): string {
  if (!peerId || peerId.length <= 16) return peerId;
  return `${peerId.substring(0, 8)}...${peerId.substring(peerId.length - 8)}`;
}

/**
 * 日志级别
 */
export enum LogLevel {
  INFO = 'INFO',
  SUCCESS = 'SUCCESS',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
}

/**
 * 打印通讯日志
 * @param module - 模块名
 * @param level - 日志级别
 * @param action - 动作描述
 * @param data - 相关数据
 */
export function log(
  module: string,
  level: LogLevel,
  action: string,
  data?: {
    peerId?: string;
    from?: string;
    to?: string;
    username?: string;
    messageId?: string;
    msgType?: string;
    version?: number;
    userInfo?: string;
    [key: string]: any;
  }
): void {
  const timestamp = getTimestamp();
  const parts: string[] = [`[${timestamp}][${module}]`, level, action];

  if (data) {
    if (data.peerId) {
      parts.push(`peer=${formatPeerId(data.peerId)}`);
    }
    if (data.from) {
      parts.push(`from=${formatPeerId(data.from)}`);
    }
    if (data.to) {
      parts.push(`to=${formatPeerId(data.to)}`);
    }
    if (data.username) {
      parts.push(`user=${truncate(data.username, 50)}`);
    }
    if (data.messageId) {
      parts.push(`msg=${truncate(data.messageId, 20)}`);
    }
    if (data.msgType) {
      parts.push(`type=${data.msgType}`);
    }
    if (data.version !== undefined) {
      parts.push(`v=${data.version}`);
    }
    if (data.userInfo) {
      parts.push(`info=${truncate(data.userInfo, 100)}`);
    }
    // 其他字段
    const extraKeys = Object.keys(data).filter(
      (k) => !['peerId', 'from', 'to', 'username', 'messageId', 'msgType', 'version', 'userInfo'].includes(k)
    );
    for (const key of extraKeys) {
      parts.push(`${key}=${formatObject(data[key])}`);
    }
  }

  const logStr = truncate(parts.join(' '));

  // 根据级别选择输出方式
  switch (level) {
    case LogLevel.SUCCESS:
      console.log(`%c${logStr}`, 'color: #52c41a; font-weight: bold');
      break;
    case LogLevel.WARNING:
      console.warn(`%c${logStr}`, 'color: #faad14; font-weight: bold');
      break;
    case LogLevel.ERROR:
      console.error(`%c${logStr}`, 'color: #ff4d4f; font-weight: bold');
      break;
    default:
      console.log(logStr);
  }
}

/**
 * 快捷方法
 */
export const commLog = {
  // 发现相关
  discovery: {
    found: (data?: { peerId?: string; username?: string }) => log('DISCOVERY', LogLevel.SUCCESS, '发现用户', data),
    add: (data?: { peerId?: string; username?: string }) => log('DISCOVERY', LogLevel.INFO, '添加设备', data),
    notify: (data?: { to?: string; username?: string }) => log('DISCOVERY', LogLevel.INFO, '发送发现通知', data),
    notified: (data?: { from?: string; username?: string }) => log('DISCOVERY', LogLevel.INFO, '收到发现通知', data),
    query: (data?: { from?: string }) => log('DISCOVERY', LogLevel.INFO, '查询用户名', data),
    response: (data?: { to?: string; username?: string }) => log('DISCOVERY', LogLevel.INFO, '响应用户名', data),
  },

  // 消息相关
  message: {
    send: (data?: { to?: string; msgType?: string; messageId?: string }) => log('MESSAGE', LogLevel.INFO, '发送消息', data),
    sent: (data?: { to?: string; messageId?: string }) => log('MESSAGE', LogLevel.SUCCESS, '消息已送达', data),
    received: (data?: { from?: string; msgType?: string; messageId?: string }) => log('MESSAGE', LogLevel.SUCCESS, '收到消息', data),
    delivered: (data?: { from?: string; messageId?: string }) => log('MESSAGE', LogLevel.SUCCESS, '送达确认', data),
    retry: (data?: { to?: string; messageId?: string }) => log('MESSAGE', LogLevel.WARNING, '重试消息', data),
    failed: (data?: { to?: string; messageId?: string }) => log('MESSAGE', LogLevel.ERROR, '发送失败', data),
  },

  // 用户信息同步
  sync: {
    versionMismatch: (data?: { peerId?: string; stored?: number; theirs?: number }) => log('SYNC', LogLevel.INFO, '版本号不一致', data),
    requestInfo: (data?: { to?: string }) => log('SYNC', LogLevel.INFO, '请求用户信息', data),
    updateInfo: (data?: { peerId?: string; username?: string; version?: number }) => log('SYNC', LogLevel.SUCCESS, '更新用户信息', data),
    respondInfo: (data?: { to?: string; version?: number }) => log('SYNC', LogLevel.INFO, '响应用户信息', data),
  },

  // 在线检查
  heartbeat: {
    check: (data?: { to?: string; version?: number }) => log('HEARTBEAT', LogLevel.INFO, '心跳检查', data),
    online: (data?: { from?: string }) => log('HEARTBEAT', LogLevel.SUCCESS, '设备在线', data),
    offline: (data?: { peerId?: string }) => log('HEARTBEAT', LogLevel.WARNING, '设备离线', data),
    response: (data?: { to?: string; version?: number }) => log('HEARTBEAT', LogLevel.INFO, '响应心跳', data),
  },

  // 连接相关
  connection: {
    connecting: () => log('CONN', LogLevel.INFO, '正在连接'),
    connected: (data?: { peerId?: string }) => log('CONN', LogLevel.SUCCESS, '连接成功', data),
    disconnected: () => log('CONN', LogLevel.WARNING, '连接断开'),
    closed: () => log('CONN', LogLevel.ERROR, '连接关闭'),
    error: (data?: { error?: string }) => log('CONN', LogLevel.ERROR, '连接错误', data),
  },

  // 通用
  info: (action: string, data?: any) => log('COMM', LogLevel.INFO, action, data),
  success: (action: string, data?: any) => log('COMM', LogLevel.SUCCESS, action, data),
  warning: (action: string, data?: any) => log('COMM', LogLevel.WARNING, action, data),
  error: (action: string, data?: any) => log('COMM', LogLevel.ERROR, action, data),
};
