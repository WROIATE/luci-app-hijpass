/** @typedef {import('./json.uc').JsonObject} JsonObject */
// 核心原生 JSON 的稳定边界；协议专用扩展保留 JSON 字典。

/**
 * @typedef {{
 *   host: string,
 *   path: string,
 *   mode: string,
 *   uplinkHTTPMethod: string
 * }} XhttpSettings
 */

/**
 * @typedef {{
 *   host: string,
 *   path: string
 * }} HttpupgradeSettings
 */

/**
 * @typedef {{
 *   host: string,
 *   path: string
 * }} WebsocketSettings
 */

/**
 * @typedef {{
 *   serviceName: string,
 *   idle_timeout: integer|null,
 *   health_check_timeout: integer|null,
 *   permit_without_stream: boolean|null
 * }} GrpcSettings
 */

/**
 * Xray streamSettings；apply() 原地填充传输字段，未选择的子对象可以缺省。
 * @typedef {{
 *   network: string|null,
 *   security: string|null,
 *   xhttpSettings: XhttpSettings|null,
 *   httpupgradeSettings: HttpupgradeSettings|null,
 *   wsSettings: WebsocketSettings|null,
 *   grpcSettings: GrpcSettings|null,
 *   tlsSettings: JsonObject|null,
 *   realitySettings: JsonObject|null,
 *   sockopt: JsonObject|null
 * }} StreamSettings
 */

/**
 * @typedef {JsonObject & {
 *   address: string|null
 * }} OutboundSettings
 */

/**
 * @typedef {JsonObject & {
 *   server: string|null,
 *   settings: OutboundSettings|null
 * }} OutboundConfig
 */

/**
 * @typedef {{
 *   log: JsonObject,
 *   inbounds: JsonObject[],
 *   outbounds: OutboundConfig[],
 *   dns: JsonObject|null,
 *   route: JsonObject|null,
 *   routing: JsonObject|null,
 *   burstObservatory: JsonObject|null
 * }} CoreConfig
 */

/**
 * 未指定 target 时的生成结果；nodes 以 section ID 索引，自定义节点没有生成结果。
 * @typedef {{
 *   nodes: Object<string, CoreConfig>,
 *   shunt: CoreConfig|null
 * }} GeneratedConfigs
 */

/**
 * @typedef {{
 *   ok: boolean
 * }} ValidationResult
 */
