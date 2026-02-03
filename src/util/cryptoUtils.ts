/**
 * 数字签名验证工具
 *
 * 提供 Request-Response 协议的签名和验证功能
 * 用于防止中间人攻击，验证消息来源的真实性
 *
 * 功能：
 * - 生成签名数据（对关键字段进行排序和序列化）
 * - 签名消息（使用私钥）
 * - 验证签名（使用对方公钥）
 * - 检查是否应该跳过验证（向后兼容）
 */

import { useUserStore } from '../stores/userStore';
import { useDeviceStore } from '../stores/deviceStore';

/**
 * 需要签名验证的协议类型
 *
 * 这些协议类型涉及安全敏感操作，必须验证签名
 *
 * 注意：discovery_notification_request 被移到可选签名列表中，因为：
 * 1. 首次发现时设备间还没有交换公钥，无法验证签名
 * 2. 公钥会在发现请求的 payload 中传递
 * 3. 接收方保存公钥后，后续通信就可以验证签名
 */
const SIGNATURE_REQUIRED_PROTOCOLS = new Set([
  'key_exchange_request',
  'key_exchange_response',
  'call_request',
  'call_response',
]);

/**
 * 可选签名验证的协议类型
 *
 * 这些协议类型如果提供了签名就验证，没有签名也能正常处理（向后兼容）
 *
 * 注意：discovery_notification_request 是可选签名的，因为：
 * 1. 首次发现时设备间还没有交换公钥，无法验证签名
 * 2. 公钥会在发现请求的 payload 中传递
 * 3. 接收方保存公钥后，后续通信就可以验证签名
 */
const SIGNATURE_OPTIONAL_PROTOCOLS = new Set([
  'chat_message_request',
  'chat_message_response',
  'online_check_request',
  'online_check_response',
  'user_info_request',
  'user_info_response',
  'device_list_request',
  'device_list_response',
  'discovery_notification_request',
  'discovery_notification_response',
]);

/**
 * 从消息中提取用于签名的关键数据
 *
 * 签名数据包含：
 * - type: 协议类型
 * - requestId: 请求ID
 * - from: 发送者
 * - to: 接收者
 * - payload: 主要载荷（如果存在）
 *
 * 不包含：
 * - timestamp（时间戳会变化）
 * - signature（签名字段本身）
 *
 * @param message - 请求或响应消息
 * @returns 用于签名的规范化字符串
 */
export function extractSignatureData(message: any): string {
  const signatureData: Record<string, unknown> = {
    type: message.type,
    requestId: message.requestId,
    from: message.from,
    to: message.to,
  };

  // 如果有 payload，添加到签名数据中
  if (message.payload !== undefined) {
    signatureData.payload = message.payload;
  }

  // 如果有 data（响应数据），添加到签名数据中
  if (message.data !== undefined) {
    signatureData.data = message.data;
  }

  // 如果有 success，添加到签名数据中
  if (message.success !== undefined) {
    signatureData.success = message.success;
  }

  // 规范化：按键排序并序列化为 JSON
  return JSON.stringify(signatureData, Object.keys(signatureData).sort());
}

/**
 * 对消息进行签名
 *
 * @param message - 要签名的消息
 * @returns 签名字符串
 */
export async function signMessage(message: any): Promise<string> {
  const userStore = useUserStore();

  try {
    // 提取签名数据
    const signatureData = extractSignatureData(message);

    // 使用 userStore 的 signData 方法签名
    const signature = await userStore.signData(signatureData);

    console.log('[Signature] Message signed:', {
      type: message.type,
      from: message.from?.substring(0, 8) + '...',
      signatureLength: signature.length,
    });

    return signature;
  } catch (error) {
    console.error('[Signature] Failed to sign message:', error);
    throw error;
  }
}

/**
 * 验证消息签名
 *
 * @param message - 要验证的消息
 * @param peerId - 发送者 PeerId
 * @returns 验证是否通过（true: 通过, false: 失败, null: 跳过验证）
 */
export async function verifyMessageSignature(
  message: any,
  peerId: string
): Promise<boolean | null> {
  const userStore = useUserStore();
  const deviceStore = useDeviceStore();

  // 检查消息是否包含签名
  if (!message.signature) {
    // 没有签名的处理逻辑
    if (SIGNATURE_REQUIRED_PROTOCOLS.has(message.type)) {
      // 必须签名的协议，没有签名则验证失败
      console.warn('[Signature] Missing required signature:', {
        type: message.type,
        from: peerId.substring(0, 8) + '...',
      });
      return false;
    } else {
      // 可选签名或不支持签名的协议，跳过验证
      console.log('[Signature] No signature in message, skipping verification:', {
        type: message.type,
        from: peerId.substring(0, 8) + '...',
      });
      return null;
    }
  }

  // 获取对方公钥
  const device = deviceStore.getDevice(peerId);
  if (!device) {
    console.warn('[Signature] Unknown device:', peerId.substring(0, 8) + '...');
    return null; // 未知设备，跳过验证（向后兼容）
  }

  if (!device.publicKey) {
    // 没有公钥的处理逻辑
    if (SIGNATURE_REQUIRED_PROTOCOLS.has(message.type)) {
      // 必须签名的协议，没有公钥则验证失败
      console.warn('[Signature] No public key for required protocol:', {
        type: message.type,
        from: peerId.substring(0, 8) + '...',
      });
      return false;
    } else {
      // 可选签名或不支持签名的协议，跳过验证
      console.log('[Signature] No public key for device, skipping verification:', {
        type: message.type,
        from: peerId.substring(0, 8) + '...',
      });
      return null;
    }
  }

  try {
    // 提取签名数据
    const signatureData = extractSignatureData(message);

    // 使用 userStore 的 verifySignature 方法验证
    const isValid = await userStore.verifySignature(
      signatureData,
      message.signature,
      device.publicKey
    );

    if (isValid) {
      console.log('[Signature] Verification passed:', {
        type: message.type,
        from: peerId.substring(0, 8) + '...',
      });

      // 更新设备的最后签名记录
      device.lastSignature = message.signature;
      await deviceStore.addOrUpdateDevice(device);
    } else {
      console.warn('[Signature] Verification failed:', {
        type: message.type,
        from: peerId.substring(0, 8) + '...',
      });

      // 签名验证失败，可能是中间人攻击
      if (SIGNATURE_REQUIRED_PROTOCOLS.has(message.type)) {
        // 对于必须验证签名的协议，标记设备为被攻击
        console.error('[Signature] Signature verification failed for required protocol, possible MITM attack:', {
          type: message.type,
          from: peerId.substring(0, 8) + '...',
        });

        device.keyExchangeStatus = 'compromised';
        await deviceStore.addOrUpdateDevice(device);

        // 触发安全警告事件
        window.dispatchEvent(
          new CustomEvent('signature-verification-failed', {
            detail: {
              peerId,
              type: message.type,
              reason: 'Signature verification failed',
            },
          })
        );
      }
    }

    return isValid;
  } catch (error) {
    console.error('[Signature] Verification error:', error);
    return false;
  }
}

/**
 * 检查是否应该跳过签名验证
 *
 * @param protocolType - 协议类型
 * @returns 是否跳过验证
 */
function shouldSkipSignatureVerification(protocolType: string): boolean {
  // 如果协议类型不在需要或可选签名列表中，跳过验证
  return (
    !SIGNATURE_REQUIRED_PROTOCOLS.has(protocolType) &&
    !SIGNATURE_OPTIONAL_PROTOCOLS.has(protocolType)
  );
}

/**
 * 检查协议是否必须签名
 *
 * @param protocolType - 协议类型
 * @returns 是否必须签名
 */
export function isSignatureRequired(protocolType: string): boolean {
  return SIGNATURE_REQUIRED_PROTOCOLS.has(protocolType);
}

/**
 * 检查协议是否可以签名
 *
 * @param protocolType - 协议类型
 * @returns 是否可以签名
 */
export function isSignatureSupported(protocolType: string): boolean {
  return (
    SIGNATURE_REQUIRED_PROTOCOLS.has(protocolType) ||
    SIGNATURE_OPTIONAL_PROTOCOLS.has(protocolType)
  );
}
