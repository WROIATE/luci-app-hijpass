// 共享类型声明；仅用于编辑器，不创建或导出运行时对象。

/**
 * 节点文件标识：.name 为 UCI section ID，name 为可选的节点名称。
 * @typedef {{
 *   '.name': string,
 *   name: string|null
 * }} NodeSection
 */

/**
 * 日志配置：.type 为 UCI section 类型，log_enabled 为可选的日志开关。
 * 节点日志必须提供 .name，可选 name；主日志和分流日志不需要节点标识。
 * @typedef {{
 *   '.type': string,
 *   '.name': string|null,
 *   name: string|null,
 *   log_enabled: string|null
 * }} LogSection
 */
