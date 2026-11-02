/**
 * 转换后的公共服务端选项；数字已校验，缺失值已填充。
 * @typedef {{
 *   name: string,
 *   type: string,
 *   core: string,
 *   listen: string,
 *   listen_port: integer,
 *   log_level: string,
 *   security: string,
 *   transport: string
 * }} ServerOptionsBase
 */

/**
 * @typedef {{
 *   server_name: string,
 *   certificate_path?: string,
 *   key_path?: string,
 *   reality_server?: string,
 *   reality_port?: integer,
 *   reality_private_key?: string,
 *   reality_short_id?: string
 * }} ServerTLS
 */

/**
 * @typedef {ServerOptionsBase & {
 *   password: string,
 *   method: string
 * }} ShadowsocksServerOptions
 */

/**
 * @typedef {ServerOptionsBase & ServerTLS & {
 *   password: string,
 *   obfs_password?: string,
 *   up_mbps?: integer,
 *   down_mbps?: integer
 * }} Hysteria2ServerOptions
 */

/**
 * @typedef {ServerOptionsBase & ServerTLS & {
 *   uuid: string,
 *   flow: string,
 *   ws_path?: string,
 *   grpc_service_name?: string
 * }} VlessServerOptions
 */

/** @typedef {ShadowsocksServerOptions|Hysteria2ServerOptions|VlessServerOptions} ServerOptions */
