export interface UserInfo {
  username: string;
  avatar: string | null;
  peerId: string | null;
}

export interface ChatMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: number;
  status: 'sending' | 'sent' | 'failed';
  type?: 'text' | 'system';
}

export interface Contact {
  peerId: string;
  username: string;
  avatar: string | null;
  online: boolean;
  lastSeen: number;
  unreadCount: number;
}

export interface PendingMessage {
  id: string;
  to: string;
  content: string;
  timestamp: number;
  retryCount: number;
}

export interface OnlineDevice {
  peerId: string;
  username: string;
  avatar: string | null;
  lastHeartbeat: number;
}
