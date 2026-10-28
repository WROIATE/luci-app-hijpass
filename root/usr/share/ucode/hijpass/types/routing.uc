// 共享类型声明；仅用于编辑器，不创建或导出运行时对象。

/**
 * @typedef {object} Match
 * @property {string[]} domain 完整域名。
 * @property {string[]} suffix 域名后缀。
 * @property {string[]} keyword 域名关键字。
 * @property {string[]} regex 域名正则表达式。
 * @property {string[]} ip IP 或 CIDR。
 * @property {string[]} geoip GeoIP 标签。
 * @property {string[]} geosite GeoSite 标签。
 * @property {RuleSet[]} sets 本地或远端规则集。
 * @property {string[]} network 传输层协议。
 * @property {string[]} protocol 应用层协议。
 * @property {integer[]} ports 目标端口。
 * @property {string[]} ranges 目标端口范围，使用冒号分隔。
 */

/**
 * @typedef {object} RuleOptions
 * @property {string|string[]|null} network 传输层协议，兼容 option 和 list。
 * @property {string|string[]|null} protocol 应用层协议，兼容 option 和 list。
 * @property {string|string[]|null} port 目标端口，解码时校验 1–65535。
 * @property {string|string[]|null} port_range 目标端口范围，UCI 使用横线分隔。
 * @property {string|null} domain_list 按行填写的域名、GeoSite 或规则集。
 * @property {string|null} ip_list 按行填写的 IP/CIDR、GeoIP 或规则集。
 */

/**
 * remote 使用 url，local 使用 path；format 为 source/binary。
 * @typedef {{
 *   type: string,
 *   tag: string,
 *   format: string,
 *   url: string|null,
 *   path: string|null
 * }} RuleSet
 */

/**
 * @typedef {{
 *   tag: string,
 *   type: string,
 *   address: string,
 *   port: integer|null
 * }} DNSServer
 */

/**
 * @typedef {{
 *   name: string,
 *   split: boolean,
 *   exit: string,
 *   v4: string,
 *   v6: string,
 *   dnsExit: string,
 *   dns: DNSServer,
 *   strategy: string,
 *   match: Match
 * }} RoutingEntry
 */

/**
 * 分流准备阶段的纯数据；出口已解析为标签，端口已转换成整数。
 * @typedef {{
 *   core: string,
 *   listen: integer,
 *   dnsPort: integer,
 *   log: string,
 *   strategy: string,
 *   cache: boolean,
 *   convert: boolean,
 *   final: string,
 *   dns: DNSServer,
 *   rulesetExit: string,
 *   rulesetDNS: DNSServer|null,
 *   entries: RoutingEntry[]
 * }} RoutingSettings
 */
