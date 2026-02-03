/**
 * 数字签名管理器
 * 使用 Web Crypto API 实现身份验证
 *
 * 功能：
 * - 生成 SHA-256 RSA 密钥对（2048 位）
 * - 导出/导入密钥
 * - 数据签名
 * - 签名验证
 * - 密钥持久化（IndexedDB 加密存储）
 */
class CryptoManager {
  private keyPair: CryptoKeyPair | null = null;
  private publicKeyExport: string | null = null;
  private privateKeyExport: string | null = null;
  private initialized: boolean = false;

  // IndexedDB 配置
  private DB_NAME = 'p2p-chat';
  private DB_VERSION = 2; // 升级版本以添加新的 store
  private db: IDBDatabase | null = null;

  // Store 名称常量
  private readonly SECURITY_KEYS_STORE = 'security_keys';

  // 共享的数据库实例（通过 indexedDBStorage）
  private static sharedDB: IDBDatabase | null = null;
  private static sharedDBInit: Promise<IDBDatabase> | null = null;

  /**
   * 初始化：生成或加载密钥对
   */
  async init(): Promise<void> {
    console.log('[Crypto] init: Starting...');
    // 更严格的检查：确保所有状态都正确
    if (this.initialized && this.keyPair && this.publicKeyExport && this.privateKeyExport) {
      console.log('[Crypto] init: Already initialized, validating...');
      // 验证密钥是否仍然有效（通过签名测试）
      try {
        await this.sign('validation-test');
        console.log('[Crypto] init: Existing keys are valid');
        return;
      } catch (error) {
        console.log('[Crypto] Existing keys are invalid, reinitializing...', error);
        this.initialized = false;
      }
    }

    // 如果 initialized 为 true 但任何状态为 null，重置并重新初始化
    if (this.initialized && (!this.keyPair || !this.publicKeyExport || !this.privateKeyExport)) {
      console.log('[Crypto] Initialized flag is true but keys are incomplete, reinitializing...');
      this.initialized = false;
    }

    console.log('[Crypto] init: Initializing IndexedDB...');
    // 初始化 IndexedDB
    await this.initIndexedDB();
    console.log('[Crypto] init: IndexedDB initialized');

    console.log('[Crypto] init: Loading from storage...');
    // 尝试从 IndexedDB 加载
    const loaded = await this.loadFromStorage();
    console.log('[Crypto] init: Load from storage result =', loaded);
    if (loaded) {
      // 再次验证加载的密钥是否有效
      if (this.keyPair && this.publicKeyExport && this.privateKeyExport) {
        this.initialized = true;
        console.log('[Crypto] Keys loaded from storage');
        return;
      } else {
        console.log('[Crypto] Load reported success but keys are incomplete, regenerating...');
      }
    }

    console.log('[Crypto] init: Generating new key pair...');
    // 生成新的密钥对
    await this.generateKeyPair();

    // 验证新生成的密钥
    if (this.keyPair && this.publicKeyExport && this.privateKeyExport) {
      this.initialized = true;
      console.log('[Crypto] New key pair generated');
    } else {
      throw new Error('[Crypto] Failed to generate key pair: state incomplete after generation');
    }
  }

  /**
   * 初始化 IndexedDB（添加 security_keys store）
   * 使用共享数据库实例模式，避免版本冲突
   */
  private async initIndexedDB(): Promise<void> {
    // 如果已经有共享的数据库初始化在进行中，等待它完成
    if (CryptoManager.sharedDBInit) {
      console.log('[Crypto] initIndexedDB: Waiting for shared DB initialization...');
      this.db = await CryptoManager.sharedDBInit;
      console.log('[Crypto] initIndexedDB: Shared DB ready');
      return;
    }

    // 如果已经有共享的数据库实例，直接使用
    if (CryptoManager.sharedDB) {
      console.log('[Crypto] initIndexedDB: Using existing shared DB');
      this.db = CryptoManager.sharedDB;
      return;
    }

    // 创建新的初始化 Promise
    console.log('[Crypto] initIndexedDB: Creating new shared DB initialization');
    CryptoManager.sharedDBInit = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      // 设置超时
      const timeout = setTimeout(() => {
        console.error('[Crypto] initIndexedDB: Timeout after 10 seconds');
        CryptoManager.sharedDBInit = null; // 重置以便重试
        reject(new Error('IndexedDB initialization timeout'));
      }, 10000);

      request.onerror = () => {
        clearTimeout(timeout);
        console.error('[Crypto] Failed to open database:', request.error);
        CryptoManager.sharedDBInit = null; // 重置以便重试
        reject(request.error);
      };

      request.onsuccess = () => {
        clearTimeout(timeout);
        console.log('[Crypto] initIndexedDB: Database opened successfully');
        this.db = request.result;
        CryptoManager.sharedDB = this.db;
        resolve(this.db);
      };

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        console.log('[Crypto] initIndexedDB: onupgradeneeded triggered, oldVersion =', event.oldVersion);
        const db = (event.target as IDBOpenDBRequest).result;

        // 创建所有必要的 stores（确保与 indexedDBStorage 保持一致）
        const stores = ['avatars', 'messages', 'devices', 'security_keys'];
        for (const storeName of stores) {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: 'id' });
            console.log('[Crypto] Created store:', storeName);
            // 为特定的 store 创建索引
            if (storeName === 'avatars') {
              store.createIndex('peerId', 'peerId', { unique: false });
            } else if (storeName === 'messages') {
              store.createIndex('toPeerId', 'toPeerId', { unique: false });
              store.createIndex('timestamp', 'timestamp', { unique: false });
            } else if (storeName === 'devices') {
              store.createIndex('username', 'username', { unique: false });
            }
          }
        }
        console.log('[Crypto] initIndexedDB: All stores created/verified');
      };

      request.onblocked = () => {
        console.log('[Crypto] initIndexedDB: Database open blocked - waiting for other connections to close');
      };
    });

    await CryptoManager.sharedDBInit;
    console.log('[Crypto] initIndexedDB: Initialization complete');
  }

  /**
   * 生成 SHA-256 RSA 密钥对
   */
  private async generateKeyPair(): Promise<void> {
    this.keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify']
    );

    await this.exportAndStoreKeys();
  }

  /**
   * 导出并存储密钥
   */
  private async exportAndStoreKeys(): Promise<void> {
    if (!this.keyPair) {
      throw new Error('Key pair not initialized');
    }

    try {
      // 导出公钥 (SPKI 格式)
      const publicKeyBuffer = await window.crypto.subtle.exportKey(
        'spki',
        this.keyPair.publicKey
      );
      this.publicKeyExport = this.arrayBufferToBase64(publicKeyBuffer);

      // 导出私钥 (PKCS8 格式)
      const privateKeyBuffer = await window.crypto.subtle.exportKey(
        'pkcs8',
        this.keyPair.privateKey
      );
      this.privateKeyExport = this.arrayBufferToBase64(privateKeyBuffer);

      // 存储到 IndexedDB（私钥需要加密）
      await this.storeToIndexedDB();
    } catch (error) {
      console.error('[Crypto] Failed to export keys:', error);
      throw error;
    }
  }

  /**
   * 从 IndexedDB 加载密钥
   */
  private async loadFromStorage(): Promise<boolean> {
    try {
      if (!this.db) {
        await this.initIndexedDB();
      }

      const transaction = this.db!.transaction(
        [this.SECURITY_KEYS_STORE],
        'readonly'
      );
      const store = transaction.objectStore(this.SECURITY_KEYS_STORE);
      const request = store.get('my_keys');

      return new Promise((resolve) => {
        request.onsuccess = async () => {
          const data = request.result;
          if (!data) {
            resolve(false);
            return;
          }

          try {
            // 加载公钥
            this.publicKeyExport = data.publicKey;

            // 解密并加载私钥
            this.privateKeyExport = await this.decryptPrivateKey(
              data.privateKey
            );

            // 导入密钥为 CryptoKey 对象
            await this.importKeys();

            // 只有在成功导入密钥后，才标记为成功
            if (this.keyPair) {
              resolve(true);
            } else {
              console.error('[Crypto] importKeys succeeded but keyPair is null');
              // 清空部分状态
              this.publicKeyExport = null;
              this.privateKeyExport = null;
              resolve(false);
            }
          } catch (error) {
            console.error('[Crypto] Failed to load keys:', error);
            // 清空部分状态
            this.publicKeyExport = null;
            this.privateKeyExport = null;
            this.keyPair = null;
            resolve(false);
          }
        };

        request.onerror = () => {
          console.error('[Crypto] Failed to read keys:', request.error);
          resolve(false);
        };
      });
    } catch (error) {
      console.error('[Crypto] Failed to load from storage:', error);
      return false;
    }
  }

  /**
   * 导入密钥为 CryptoKey 对象
   */
  private async importKeys(): Promise<void> {
    if (!this.publicKeyExport || !this.privateKeyExport) {
      throw new Error('No exported keys to import');
    }

    try {
      // 导入公钥
      const publicKeyBuffer = this.base64ToArrayBuffer(this.publicKeyExport);
      const publicKey = await window.crypto.subtle.importKey(
        'spki',
        publicKeyBuffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        true,
        ['verify']
      );

      // 导入私钥
      const privateKeyBuffer = this.base64ToArrayBuffer(this.privateKeyExport);
      const privateKey = await window.crypto.subtle.importKey(
        'pkcs8',
        privateKeyBuffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        true,
        ['sign']
      );

      this.keyPair = { publicKey, privateKey };
    } catch (error) {
      console.error('[Crypto] Failed to import keys:', error);
      throw error;
    }
  }

  /**
   * 存储到 IndexedDB
   */
  private async storeToIndexedDB(): Promise<void> {
    if (!this.publicKeyExport || !this.privateKeyExport) {
      throw new Error('No keys to store');
    }

    try {
      if (!this.db) {
        await this.initIndexedDB();
      }

      // 加密私钥
      const encryptedPrivateKey = await this.encryptPrivateKey(
        this.privateKeyExport
      );

      const transaction = this.db!.transaction(
        [this.SECURITY_KEYS_STORE],
        'readwrite'
      );
      const store = transaction.objectStore(this.SECURITY_KEYS_STORE);
      const request = store.put({
        id: 'my_keys',
        publicKey: this.publicKeyExport,
        privateKey: encryptedPrivateKey,
        createdAt: Date.now(),
      });

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          console.log('[Crypto] Keys stored to IndexedDB');
          resolve();
        };

        request.onerror = () => {
          console.error('[Crypto] Failed to store keys:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('[Crypto] Failed to store to IndexedDB:', error);
      throw error;
    }
  }

  /**
   * 加密私钥
   * 使用用户 PeerId 作为密钥进行 XOR 加密
   * 注意：这只是基础加密，生产环境应使用更强的加密方式
   */
  private async encryptPrivateKey(privateKey: string): Promise<string> {
    const userInfoMeta = localStorage.getItem('p2p_user_info_meta');
    if (!userInfoMeta) {
      return privateKey;
    }

    try {
      const meta = JSON.parse(userInfoMeta);
      const key: string = meta.peerId || 'default-key';
      const keyLength: number = key.length;
      let result = '';
      for (let i = 0; i < privateKey.length; i++) {
        result += String.fromCharCode(
          privateKey.charCodeAt(i) ^ key.charCodeAt(i % keyLength)
        );
      }
      return window.btoa(result);
    } catch {
      return privateKey;
    }
  }

  /**
   * 解密私钥
   */
  private async decryptPrivateKey(encrypted: string): Promise<string> {
    const userInfoMeta = localStorage.getItem('p2p_user_info_meta');
    if (!userInfoMeta) {
      return encrypted;
    }

    try {
      const meta = JSON.parse(userInfoMeta);
      const key: string = meta.peerId || 'default-key';
      const keyLength: number = key.length;
      const decoded = window.atob(encrypted);
      let result = '';
      for (let i = 0; i < decoded.length; i++) {
        result += String.fromCharCode(
          decoded.charCodeAt(i) ^ key.charCodeAt(i % keyLength)
        );
      }
      return result;
    } catch {
      return encrypted;
    }
  }

  /**
   * 签名数据
   */
  async sign(data: string): Promise<string> {
    if (!this.keyPair) {
      throw new Error('Key pair not initialized');
    }

    try {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);

      const signature = await window.crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        this.keyPair.privateKey,
        dataBuffer
      );

      return this.arrayBufferToBase64(signature);
    } catch (error) {
      console.error('[Crypto] Failed to sign data:', error);
      throw error;
    }
  }

  /**
   * 验证签名
   */
  async verify(
    data: string,
    signature: string,
    publicKeyBase64: string
  ): Promise<boolean> {
    try {
      const publicKeyBuffer = this.base64ToArrayBuffer(publicKeyBase64);
      const publicKey = await window.crypto.subtle.importKey(
        'spki',
        publicKeyBuffer,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );

      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      const signatureBuffer = this.base64ToArrayBuffer(signature);

      return await window.crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        publicKey,
        signatureBuffer,
        dataBuffer
      );
    } catch (error) {
      console.error('[Crypto] Verify failed:', error);
      return false;
    }
  }

  /**
   * 获取公钥
   */
  getPublicKey(): string {
    if (!this.publicKeyExport) {
      throw new Error('Public key not available');
    }
    return this.publicKeyExport;
  }

  /**
   * 获取私钥（仅用于展示）
   */
  getPrivateKey(): string {
    if (!this.privateKeyExport) {
      throw new Error('Private key not available');
    }
    return this.privateKeyExport;
  }

  /**
   * 重新生成密钥对
   */
  async regenerate(): Promise<void> {
    this.keyPair = null;
    this.publicKeyExport = null;
    this.privateKeyExport = null;
    await this.generateKeyPair();
    console.log('[Crypto] Key pair regenerated');
  }

  /**
   * 清除密钥
   */
  async clear(): Promise<void> {
    try {
      if (!this.db) {
        await this.initIndexedDB();
      }

      const transaction = this.db!.transaction(
        [this.SECURITY_KEYS_STORE],
        'readwrite'
      );
      const store = transaction.objectStore(this.SECURITY_KEYS_STORE);
      const request = store.delete('my_keys');

      return new Promise((resolve) => {
        request.onsuccess = () => {
          this.keyPair = null;
          this.publicKeyExport = null;
          this.privateKeyExport = null;
          this.initialized = false;
          console.log('[Crypto] Keys cleared');
          resolve();
        };

        request.onerror = () => {
          console.error('[Crypto] Failed to clear keys:', request.error);
          resolve();
        };
      });
    } catch (error) {
      console.error('[Crypto] Failed to clear keys:', error);
    }
  }

  /**
   * ArrayBuffer 转 Base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      const byte = bytes[i];
      if (byte !== undefined) {
        binary += String.fromCharCode(byte);
      }
    }
    return window.btoa(binary);
  }

  /**
   * Base64 转 ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('[Crypto] Database closed');
    }
  }
}

// 创建单例
export const cryptoManager = new CryptoManager();
