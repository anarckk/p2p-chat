import type { ChatMessage, MessageType, MessageContent } from '../../types';
import { useChatStore } from '../../stores/chatStore';
import { useUserStore } from '../../stores/userStore';
import { commLog } from '../../util/logger';
import { peerInstance, isConnected } from './state';

/**
 * 消息发送和处理模块
 */

/**
 * 处理接收到的消息
 */
export function handleIncomingMessage(data: { from: string; data: any }) {
  const { from, data: msgData } = data;

  // 检查是否是 ChatMessage（通过三段式协议接收的）
  if (msgData && typeof msgData === 'object' && 'id' in msgData && 'type' in msgData) {
    handleChatMessage(from, msgData as ChatMessage);
    return;
  }
}

/**
 * 处理聊天消息
 */
async function handleChatMessage(from: string, chatMessage: ChatMessage) {
  const chatStore = useChatStore();
  const { id, type } = chatMessage;

  commLog.message.received({ from, msgType: type, messageId: id });

  const chatMessageLog = JSON.stringify({
    id,
    from,
    to: chatMessage.to,
    type,
    timestamp: chatMessage.timestamp,
  });
  console.log('[Peer] Handling chat message:', chatMessageLog.substring(0, 200));

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
  } else {
    chatStore.incrementUnread(from);
    console.log('[Peer] Incremented unread for ' + from);
  }

  // 保存消息（状态已设置为 delivered）
  chatStore.addMessage(from, chatMessage);

  console.log('[Peer] Message saved to store: ' + chatMessage.id);

  // 对方上线了，检查是否有待发送的消息
  await retryPendingMessages(from);
}

/**
 * 重试待发送的消息
 */
async function retryPendingMessages(peerId: string) {
  const chatStore = useChatStore();
  const pending = chatStore.getPendingMessagesForPeer(peerId);
  if (pending.length === 0) return;

  console.log('[Peer] Retrying ' + pending.length + ' pending messages for ' + peerId);

  for (const pendingMsg of pending) {
    const success = await sendChatMessage(peerId, pendingMsg.id, pendingMsg.content, pendingMsg.type);

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
 * 发送聊天消息（使用五段式协议）
 */
async function sendChatMessage(
  peerId: string,
  messageId: string,
  content: MessageContent,
  type: MessageType = 'text',
): Promise<boolean> {
  const instance = peerInstance;
  if (!instance) {
    console.error('[Peer] Peer instance not initialized');
    return false;
  }

  console.log('[Peer] Sending chat message: peerId=' + peerId + ', msgId=' + messageId + ', type=' + type);

  try {
    const result = await instance.send(peerId, messageId, content, type);
    console.log('[Peer] Send result: msgId=' + result.messageId + ', sent=' + result.sent + ', stage=' + result.stage);

    // 更新消息状态为发送中
    if (result.sent) {
      const chatStore = useChatStore();
      chatStore.updateMessageStatus(peerId, messageId, 'sending');
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
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * 发送消息并处理重试
 */
export async function sendMessageWithRetry(
  peerId: string,
  content: MessageContent,
  type: MessageType = 'text',
): Promise<string> {
  const userStore = useUserStore();
  const chatStore = useChatStore();

  // 确保 Peer 已连接
  if (!isConnected.value || !peerInstance) {
    console.error('[Peer] Peer not connected, cannot send message');
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

export { sendChatMessage };

/**
 * 创建消息处理器
 */
export function createMessageHandler() {
  return (data: { from: string; data: any }) => {
    handleIncomingMessage(data);
  };
}
