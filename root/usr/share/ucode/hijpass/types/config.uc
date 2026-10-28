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

/**
 * 原生 UCI 或已验证快照中的 section；业务 option/list 保留原始字符串，元数据使用原生类型。
 * @typedef {{
 *   '.name': string,
 *   '.type': string,
 *   '.index': integer|null,
 *   '.anonymous': boolean|null,
 *   [option: string]: string|string[]|integer|boolean|null
 * }} UciSection
 */

/**
 * 字段声明依次为转换种类、缺失值默认值、可选整数上限；duration 的结果仍是字符串。
 * @typedef {[string, string|string[]|integer|double|boolean|null, integer?]} FieldDeclaration
 */

/**
 * @typedef {{
 *   [field: string]: FieldDeclaration
 * }} FieldDeclarations
 */

/**
 * @typedef {{
 *   [field: string]: string|string[]|integer|double|boolean|null
 * }} DecodedValues
 */

/**
 * 原始 DNS 上游选项；缺失字段保持 null，custom 从对应的 _custom 字段取值。
 * @typedef {{
 *   direct_dns: string|null,
 *   proxy_dns: string|null,
 *   direct_dns_custom: string|null,
 *   proxy_dns_custom: string|null
 * }} DnsUpstreams
 */
