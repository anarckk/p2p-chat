/**
 * PeerJS HTTP 封装库
 * 对外仅暴露 send() 和 on('message')
 */
class PeerHttpUtil {
  /**
   * 构造函数
   * @param {string} peerId - 当前节点的 ID，如果不提供则自动生成
   * @param {Object} options - PeerJS 配置选项
   */
  constructor(peerId = null, options = {}) {
    this.peer = new Peer(peerId, { debug: 1, ...options });
    this.messageHandlers = [];
    this.peer.on('connection', (conn) => {
      conn.on('data', (data) => {
        this.messageHandlers.forEach(handler => {
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
   * @param {string} peerId - 目标节点的 ID
   * @param {*} message - 要发送的消息
   * @returns {Promise}
   */
  send(peerId, message) {
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
   * @param {string} event - 仅支持 'message'
   * @param {Function} handler - 消息处理函数，接收 { from, data }
   */
  on(event, handler) {
    if (event === 'message') {
      this.messageHandlers.push(handler);
    } else if (event === 'open') {
      this.peer.on('open', handler);
    }
  }

  /**
   * 获取当前节点的 ID
   * @returns {string|null}
   */
  getId() {
    return this.peer.id;
  }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PeerHttpUtil;
}
