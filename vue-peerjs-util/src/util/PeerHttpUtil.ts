/**
 * PeerJS HTTP 封装库
 * 对外仅暴露 send() 和 on('message')
 */
import Peer from 'peerjs';

export type MessageHandler = (data: { from: string; data: any }) => void;
export type OpenHandler = (id: string) => void;

export class PeerHttpUtil {
  private peer: any;
  private messageHandlers: MessageHandler[] = [];

  /**
   * 构造函数
   * @param peerId - 当前节点的 ID，如果不提供则自动生成
   * @param options - PeerJS 配置选项
   */
  constructor(peerId: string | null = null, options: any = {}) {
    this.peer = new Peer(peerId, { debug: 1, ...options });

    this.peer.on('connection', (conn: any) => {
      conn.on('data', (data: any) => {
        this.messageHandlers.forEach((handler) => {
          try {
            handler({ from: conn.peer, data });
          } catch (err) {
            console.error('[PeerHttp] Handler error:', err);
          }
        });
        conn.close();
      });
    });
  }

  /**
   * 发送消息到指定节点
   * @param peerId - 目标节点的 ID
   * @param message - 要发送的消息
   */
  send(peerId: string, message: any): Promise<{ peerId: string; message: any; sent: boolean }> {
    return new Promise((resolve, reject) => {
      const conn = this.peer.connect(peerId);
      conn.on('open', () => {
        try {
          conn.send(message);
          resolve({ peerId, message, sent: true });
        } catch (err) {
          conn.close();
          reject(err);
        }
      });
      conn.on('error', reject);
    });
  }

  /**
   * 监听消息事件
   * @param event - 仅支持 'message' | 'open'
   * @param handler - 消息处理函数，接收 { from, data }
   */
  on(event: 'message', handler: MessageHandler): void;
  on(event: 'open', handler: OpenHandler): void;
  on(event: string, handler: any): void {
    if (event === 'message') {
      this.messageHandlers.push(handler);
    } else if (event === 'open') {
      this.peer.on('open', handler);
    }
  }

  /**
   * 获取当前节点的 ID
   */
  getId(): string | null {
    return this.peer.id;
  }

  /**
   * 销毁连接
   */
  destroy(): void {
    if (this.peer) {
      this.peer.destroy();
    }
  }
}
