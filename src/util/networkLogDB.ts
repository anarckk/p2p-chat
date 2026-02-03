/**
 * 网络通信日志数据结构（request-response 协议）
 */
export interface NetworkLog {
  id?: number;
  timestamp: number;
  direction: 'outgoing' | 'incoming';
  peerId: string;
  businessType: string; // 业务类型
  request?: unknown; // 请求数据
  response?: unknown; // 响应数据
  dataSize: number;
  status: 'success' | 'error' | 'pending';
  error?: string;
}

/**
 * 分页查询结果
 */
export interface PagedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 网络日志 IndexedDB 工具类
 */
class NetworkLogDB {
  private static instance: NetworkLogDB;
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'P2PNetworkLogDB';
  private readonly DB_VERSION = 1;
  private readonly STORE_NAME = 'network_logs';

  private constructor() {}

  static getInstance(): NetworkLogDB {
    if (!NetworkLogDB.instance) {
      NetworkLogDB.instance = new NetworkLogDB();
    }
    return NetworkLogDB.instance;
  }

  /**
   * 初始化数据库
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('direction', 'direction', { unique: false });
          store.createIndex('peerId', 'peerId', { unique: false });
          store.createIndex('businessType', 'businessType', { unique: false });
        }
      };
    });
  }

  /**
   * 添加日志
   */
  async addLog(log: Omit<NetworkLog, 'id'>): Promise<number> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.add(log);

      request.onsuccess = () => {
        resolve(request.result as number);
      };

      request.onerror = () => {
        reject(new Error('Failed to add log'));
      };
    });
  }

  /**
   * 分页查询日志
   */
  async getLogs(page: number = 1, pageSize: number = 20): Promise<PagedResult<NetworkLog>> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('timestamp');
      const logs: NetworkLog[] = [];

      // 获取总记录数
      const countRequest = store.count();

      countRequest.onsuccess = () => {
        const total = countRequest.result;

        // 使用游标按时间倒序遍历
        const request = index.openCursor(null, 'prev');
        let skipCount = (page - 1) * pageSize;
        let count = 0;

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;

          if (cursor) {
            if (skipCount > 0) {
              skipCount--;
              cursor.continue();
              return;
            }

            if (count < pageSize) {
              logs.push(cursor.value);
              count++;
              cursor.continue();
            } else {
              resolve({
                data: logs,
                total,
                page,
                pageSize,
              });
            }
          } else {
            resolve({
              data: logs,
              total,
              page,
              pageSize,
            });
          }
        };

        request.onerror = () => {
          reject(new Error('Failed to query logs'));
        };
      };

      countRequest.onerror = () => {
        reject(new Error('Failed to count logs'));
      };
    });
  }

  /**
   * 清空所有日志
   */
  async clearAllLogs(): Promise<void> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error('Failed to clear logs'));
      };
    });
  }

  /**
   * 获取日志总数
   */
  async getTotalCount(): Promise<number> {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      const request = store.count();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error('Failed to count logs'));
      };
    });
  }
}

// 导出单例实例
export const networkLogDB = NetworkLogDB.getInstance();
