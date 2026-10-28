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
 * @property {object[]} sets 本地或远端规则集。
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
