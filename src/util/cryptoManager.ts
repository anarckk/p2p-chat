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

  /**
   * 初始化：生成或加载密钥对
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // 初始化 IndexedDB
    await this.initIndexedDB();

    // 尝试从 IndexedDB 加载
    const loaded = await this.loadFromStorage();
    if (loaded) {
      this.initialized = true;
      console.log('[Crypto] Keys loaded from storage');
      return;
    }

    // 生成新的密钥对
    await this.generateKeyPair();
    this.initialized = true;
    console.log('[Crypto] New key pair generated');
  }

  /**
   * 初始化 IndexedDB（添加 security_keys store）
   */
  private async initIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => {
        console.error('[Crypto] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 创建 security_keys store (存储密钥对)
        if (!db.objectStoreNames.contains(this.SECURITY_KEYS_STORE)) {
          db.createObjectStore(this.SECURITY_KEYS_STORE, {
            keyPath: 'id',
          });
          console.log('[Crypto] Created security_keys store');
        }
      };
    });
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
            resolve(true);
          } catch (error) {
            console.error('[Crypto] Failed to load keys:', error);
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
