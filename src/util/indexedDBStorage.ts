/**
 * IndexedDB 存储工具类
 * 用于存储大量数据，如头像、消息体、设备列表等
 *
 * 设计原则：
 * - 小数据（用户名、peerId、版本号等）→ localStorage
 * - 大数据（头像、消息体、设备列表）→ IndexedDB
 */
class IndexedDBStorage {
  private db: IDBDatabase | null = null;
  private DB_NAME = 'p2p-chat';
  private DB_VERSION = 1;

  /**
   * 初始化 IndexedDB
   */
  async init(): Promise<void> {
    if (this.db) {
      return; // 已初始化
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => {
        console.error('[IndexedDB] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[IndexedDB] Database opened successfully');
        resolve();
      };

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 创建 avatars store (存储头像)
        if (!db.objectStoreNames.contains('avatars')) {
          const avatarStore = db.createObjectStore('avatars', { keyPath: 'id' });
          avatarStore.createIndex('peerId', 'peerId', { unique: false });
        }

        // 创建 messages store (存储消息体)
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
          messageStore.createIndex('toPeerId', 'toPeerId', { unique: false });
          messageStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // 创建 devices store (存储设备列表)
        if (!db.objectStoreNames.contains('devices')) {
          const deviceStore = db.createObjectStore('devices', { keyPath: 'peerId' });
          deviceStore.createIndex('username', 'username', { unique: false });
        }

        console.log('[IndexedDB] Object stores created');
      };
    });
  }

  /**
   * 确保数据库已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.db) {
      await this.init();
    }
  }

  /**
   * 存储大型数据到 IndexedDB
   * @param storeName - 存储名称 ('avatars' | 'messages' | 'devices')
   * @param data - 要存储的数据
   */
  async set(storeName: 'avatars' | 'messages' | 'devices', data: any): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => {
        console.log(`[IndexedDB] Data saved to ${storeName}:`, data.id || data.peerId || data.toPeerId);
        resolve();
      };

      request.onerror = () => {
        console.error(`[IndexedDB] Failed to save to ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 从 IndexedDB 获取数据
   * @param storeName - 存储名称
   * @param key - 数据的键
   */
  async get(storeName: 'avatars' | 'messages' | 'devices', key: string): Promise<any> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error(`[IndexedDB] Failed to get from ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 从 IndexedDB 获取所有数据
   * @param storeName - �储名称
   */
  async getAll(storeName: 'avatars' | 'messages' | 'devices'): Promise<any[]> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error(`[IndexedDB] Failed to get all from ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 删除 IndexedDB 中的数据
   * @param storeName - 存储名称
   * @param key - 数据的键
   */
  async delete(storeName: 'avatars' | 'messages' | 'devices', key: string): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => {
        console.log(`[IndexedDB] Data deleted from ${storeName}:`, key);
        resolve();
      };

      request.onerror = () => {
        console.error(`[IndexedDB] Failed to delete from ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 清空 IndexedDB 中的某个存储
   * @param storeName - 存储名称
   */
  async clearStore(storeName: 'avatars' | 'messages' | 'devices'): Promise<void> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => {
        console.log(`[IndexedDB] Store ${storeName} cleared`);
        resolve();
      };

      request.onerror = () => {
        console.error(`[IndexedDB] Failed to clear ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[IndexedDB] Database closed');
    }
  }
}

// 创建单例实例
const indexedDBStorage = new IndexedDBStorage();

export default indexedDBStorage;
