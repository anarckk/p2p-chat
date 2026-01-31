/**
 * PeerJS 服务器配置
 *
 * 本地测试环境：使用本地搭建的 peer server (localhost:9000)
 * 生产环境：使用 PeerJS 官方 cloud server
 */

export interface PeerServerConfig {
  debug?: number;
  host?: string;
  port?: number;
  path?: string;
}

/**
 * 获取 PeerJS 服务器配置
 *
 * @returns PeerJS 服务器配置对象
 *
 * 说明：
 * - 开发环境 (import.meta.env.DEV): 使用本地 localhost:9000
 * - 生产环境: 不传 host/port，使用 PeerJS 默认的官方 cloud server
 */
export function getPeerServerConfig(): PeerServerConfig {
  const baseConfig: PeerServerConfig = {
    debug: 1
  };

  // 本地开发环境使用本地 peer server
  if (import.meta.env.DEV) {
    return {
      ...baseConfig,
      host: 'localhost',
      port: 9000,
      path: '/peerjs',
    };
  }

  // 生产环境不传 host/port，使用 PeerJS 官方 cloud server
  return baseConfig;
}
