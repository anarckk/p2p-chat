/**
 * 文件传输管理器
 *
 * 支持大文件分片传输，通过 Request-Response 协议实现可靠传输
 *
 * @module util/fileTransfer
 */

import type { FileTransferRequest, FileTransferResponse } from '../types';
import { commLog } from './logger';

// ==================== 类型定义 ====================

/**
 * 文件元信息
 */
export interface FileMeta {
  name: string;
  size: number;
  type: string;
  chunks: number;
}

/**
 * 文件传输进度回调
 */
export type FileTransferProgressCallback = (progress: number) => void;

/**
 * 文件接收完成回调
 */
export type FileReceiveCompleteCallback = (fileId: string, fileName: string, blob: Blob) => void;

/**
 * 文件传输错误回调
 */
export type FileTransferErrorCallback = (error: string) => void;

/**
 * 接收中的文件状态
 */
interface ReceivingFile {
  meta: FileMeta;
  chunks: Map<number, string>; // chunkIndex -> base64 data
  receivedAt: number;
}

// ==================== 配置 ====================

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
  CHUNK_SIZE: 64 * 1024, // 64KB per chunk
  CHUNK_TIMEOUT: 15000, // 每个分片的超时时间（毫秒）
  MAX_CONCURRENT_CHUNKS: 3, // 最大并发发送分片数
};

// ==================== FileTransferManager ====================

/**
 * 文件传输管理器
 *
 * 支持大文件分片传输：
 * - 发送方：将文件切分为固定大小的分片，逐个发送
 * - 接收方：接收所有分片后组装成完整文件并触发下载
 */
export class FileTransferManager {
  private peerHttpUtil: any;
  private receivedChunks: Map<string, ReceivingFile> = new Map();
  private config: typeof DEFAULT_CONFIG;

  // 回调函数
  private onReceiveComplete?: FileReceiveCompleteCallback;
  private onTransferError?: FileTransferErrorCallback;

  /**
   * 构造函数
   * @param peerHttpUtil - PeerHttpUtil 实例
   * @param config - 配置选项
   */
  constructor(peerHttpUtil: any, config?: Partial<typeof DEFAULT_CONFIG>) {
    this.peerHttpUtil = peerHttpUtil;
    this.config = { ...DEFAULT_CONFIG, ...config };
    console.log('[FileTransfer] Initialized with config:', JSON.stringify(this.config));
  }

  /**
   * 设置接收完成回调
   */
  setOnReceiveComplete(callback: FileReceiveCompleteCallback): void {
    this.onReceiveComplete = callback;
  }

  /**
   * 设置传输错误回调
   */
  setOnTransferError(callback: FileTransferErrorCallback): void {
    this.onTransferError = callback;
  }

  /**
   * 发送文件
   * @param peerId - 接收者 PeerId
   * @param file - 要发送的文件
   * @param onProgress - 进度回调（0-100）
   * @returns Promise<boolean> 是否发送成功
   */
  async sendFile(
    peerId: string,
    file: File,
    onProgress?: FileTransferProgressCallback
  ): Promise<boolean> {
    const chunks = Math.ceil(file.size / this.config.CHUNK_SIZE);
    const fileId = crypto.randomUUID();

    console.log('[FileTransfer] Starting file transfer:', {
      fileId: fileId.substring(0, 8),
      fileName: file.name,
      fileSize: file.size,
      chunks,
      to: peerId.substring(0, 8) + '...',
    });

    commLog.info(`[FileTransfer] Starting file transfer: ${file.name}`, {
      fileId: fileId.substring(0, 8),
      size: file.size,
      chunks,
    });

    // 文件元信息
    const fileMeta: FileMeta = {
      name: file.name,
      size: file.size,
      type: file.type,
      chunks,
    };

    // 逐个发送分片
    for (let i = 0; i < chunks; i++) {
      const start = i * this.config.CHUNK_SIZE;
      const end = Math.min(start + this.config.CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      try {
        const chunkData = await this.fileChunkToBase64(chunk);

        await this.sendChunk(peerId, fileId, fileMeta, i, chunkData);

        // 更新进度
        if (onProgress) {
          const progress = ((i + 1) / chunks) * 100;
          onProgress(progress);
        }

        console.log('[FileTransfer] Chunk sent:', {
          fileId: fileId.substring(0, 8),
          chunkIndex: i,
          totalChunks: chunks,
          progress: Math.round(((i + 1) / chunks) * 100) + '%',
        });
      } catch (error) {
        const errorMessage = `[FileTransfer] Chunk ${i} send failed: ${error}`;
        console.error(errorMessage);

        if (this.onTransferError) {
          this.onTransferError(`Failed to send chunk ${i + 1}/${chunks}: ${error}`);
        }

        commLog.error(errorMessage, { fileId: fileId.substring(0, 8), chunkIndex: i });
        return false;
      }
    }

    console.log('[FileTransfer] File transfer completed:', {
      fileId: fileId.substring(0, 8),
      fileName: file.name,
    });

    commLog.info(`[FileTransfer] File transfer completed: ${file.name}`, {
      fileId: fileId.substring(0, 8),
    });

    return true;
  }

  /**
   * 发送单个分片
   * @param peerId - 接收者 PeerId
   * @param fileId - 文件唯一ID
   * @param fileMeta - 文件元信息
   * @param chunkIndex - 分片索引
   * @param chunkData - base64 编码的分片数据
   */
  private async sendChunk(
    peerId: string,
    fileId: string,
    fileMeta: FileMeta,
    chunkIndex: number,
    chunkData: string
  ): Promise<void> {
    if (!this.peerHttpUtil?.rrManager) {
      throw new Error('PeerHttpUtil or RRManager not initialized');
    }

    await this.peerHttpUtil.rrManager.sendRequest(
      peerId,
      'file_transfer_request',
      {
        file: fileMeta,
        fileId,
        chunkIndex,
        chunkData,
      },
      this.config.CHUNK_TIMEOUT
    );
  }

  /**
   * 接收文件分片
   * @param request - 文件传输请求
   * @param from - 发送者 PeerId
   */
  async receiveFileChunk(request: FileTransferRequest, from: string): Promise<FileTransferResponse> {
    const { fileId, chunkIndex, chunkData, file } = request;

    console.log('[FileTransfer] Received chunk:', {
      fileId: fileId.substring(0, 8),
      fileName: file.name,
      chunkIndex,
      totalChunks: file.chunks,
      from: from.substring(0, 8) + '...',
    });

    // 检查是否是该文件的第一个分片
    const isFirstChunk = chunkIndex === 0;

    if (isFirstChunk) {
      commLog.info(`[FileTransfer] Starting to receive file: ${file.name}`, {
        fileId: fileId.substring(0, 8),
        from: from.substring(0, 8) + '...',
        chunks: file.chunks,
      });
    }

    // 获取或创建接收文件状态
    if (!this.receivedChunks.has(fileId)) {
      this.receivedChunks.set(fileId, {
        meta: file,
        chunks: new Map(),
        receivedAt: Date.now(),
      });
    }

    const receivingFile = this.receivedChunks.get(fileId)!;
    receivingFile.chunks.set(chunkIndex, chunkData);

    // 检查是否接收完成
    const isComplete = receivingFile.chunks.size === file.chunks;

    if (isComplete) {
      console.log('[FileTransfer] All chunks received, assembling file:', {
        fileId: fileId.substring(0, 8),
        fileName: file.name,
      });

      await this.assembleFile(fileId, file);
    }

    // 返回响应数据（实际的 response 结构由 RRManager 构建）
    const responseData = {
      receivedChunk: chunkIndex,
    };

    return responseData as any;
  }

  /**
   * 组装文件
   * @param fileId - 文件唯一ID
   * @param fileInfo - 文件信息
   */
  private async assembleFile(fileId: string, fileInfo: FileMeta): Promise<void> {
    const receivingFile = this.receivedChunks.get(fileId);
    if (!receivingFile) {
      console.error('[FileTransfer] File not found for assembly:', fileId.substring(0, 8));
      return;
    }

    try {
      // 按顺序组装分片
      const sortedChunks = Array.from(receivingFile.chunks.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, data]) => data);

      const base64 = sortedChunks.join('');
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);

      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: fileInfo.type });

      console.log('[FileTransfer] File assembled successfully:', {
        fileId: fileId.substring(0, 8),
        fileName: fileInfo.name,
        size: blob.size,
      });

      commLog.info(`[FileTransfer] File assembled: ${fileInfo.name}`, {
        fileId: fileId.substring(0, 8),
        size: blob.size,
      });

      // 触发下载
      this.triggerDownload(blob, fileInfo.name);

      // 回调通知
      if (this.onReceiveComplete) {
        this.onReceiveComplete(fileId, fileInfo.name, blob);
      }

      // 清理
      this.receivedChunks.delete(fileId);
    } catch (error) {
      console.error('[FileTransfer] Failed to assemble file:', error);

      if (this.onTransferError) {
        this.onTransferError(`Failed to assemble file: ${error}`);
      }

      commLog.error('[FileTransfer] Failed to assemble file', {
        fileId: fileId.substring(0, 8),
        error: String(error),
      });
    }
  }

  /**
   * 触发浏览器下载
   * @param blob - 文件 Blob
   * @param fileName - 文件名
   */
  private triggerDownload(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);

    console.log('[FileTransfer] Download triggered:', fileName);
  }

  /**
   * 文件分片转 Base64
   * @param chunk - 文件分片 Blob
   * @returns Promise<string> base64 编码的数据
   */
  private async fileChunkToBase64(chunk: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const result = reader.result as string;
          // 去掉 data URL 前缀（如 "data:application/octet-stream;base64,"）
          const parts = result.split(',');
          const base64 = parts[1];
          if (base64 === undefined) {
            reject(new Error('Invalid data URL format'));
          } else {
            resolve(base64);
          }
        } catch (error) {
          reject(new Error(`Failed to parse FileReader result: ${error}`));
        }
      };
      reader.onerror = () => {
        reject(new Error('FileReader error'));
      };
      reader.readAsDataURL(chunk);
    });
  }

  /**
   * 清理所有接收中的文件
   */
  clear(): void {
    const count = this.receivedChunks.size;
    this.receivedChunks.clear();
    console.log('[FileTransfer] Cleared', count, 'receiving files');
  }

  /**
   * 清理指定的接收文件
   * @param fileId - 文件唯一ID
   */
  clearFile(fileId: string): void {
    const deleted = this.receivedChunks.delete(fileId);
    if (deleted) {
      console.log('[FileTransfer] Cleared file:', fileId.substring(0, 8));
    }
  }

  /**
   * 获取接收中的文件列表
   */
  getReceivingFiles(): Array<{ fileId: string; meta: FileMeta; progress: number }> {
    return Array.from(this.receivedChunks.entries()).map(([fileId, receivingFile]) => ({
      fileId,
      meta: receivingFile.meta,
      progress: (receivingFile.chunks.size / receivingFile.meta.chunks) * 100,
    }));
  }

  /**
   * 检查是否有文件正在接收
   */
  hasReceivingFiles(): boolean {
    return this.receivedChunks.size > 0;
  }

  /**
   * 清理超时的接收文件
   * @param timeoutMs - 超时时间（毫秒）
   */
  cleanupTimeout(timeoutMs: number = 300000): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [fileId, receivingFile] of this.receivedChunks.entries()) {
      if (now - receivingFile.receivedAt > timeoutMs) {
        toDelete.push(fileId);
      }
    }

    toDelete.forEach((fileId) => {
      this.receivedChunks.delete(fileId);
      console.log('[FileTransfer] Cleaned up timeout file:', fileId.substring(0, 8));
    });

    if (toDelete.length > 0) {
      console.log('[FileTransfer] Cleaned up', toDelete.length, 'timeout files');
    }
  }
}

// ==================== 默认导出 ====================

/**
 * 默认文件传输管理器实例（延迟初始化 */
let defaultFileTransferManager: FileTransferManager | null = null;

/**
 * 获取默认文件传输管理器实例
 */
export function getFileTransferManager(): FileTransferManager {
  if (!defaultFileTransferManager) {
    // 创建一个临时实例，等待后续通过 initFileTransferManager 初始化
    defaultFileTransferManager = new FileTransferManager(null);
  }
  return defaultFileTransferManager;
}

/**
 * 初始化默认文件传输管理器
 * @param peerHttpUtil - PeerHttpUtil 实例
 */
export function initFileTransferManager(peerHttpUtil: any): void {
  defaultFileTransferManager = new FileTransferManager(peerHttpUtil);
  console.log('[FileTransfer] Default manager initialized');
}

/**
 * 导出默认实例获取器
 */
export { getFileTransferManager as fileTransferManager };
