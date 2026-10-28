// 共享类型声明；仅用于编辑器，不创建或导出运行时对象。

/**
 * @typedef {object} ServicePlan
 * @property {object[]} instances procd 的进程描述数组。
 * @property {number[]} [ports] 服务端允许开放的端口数组。
 */

/**
 * @typedef {object} ChinadnsOptions
 * @property {integer} listenPort 监听端口。
 * @property {string} direct 国内上游地址。
 * @property {string} proxy 代理上游地址。
 * @property {boolean} useChn 国内列表开关。
 * @property {boolean} useGfw 代理列表开关。
 * @property {string|null} chnList 国内列表路径，启用列表时提供。
 * @property {string|null} gfwList 代理列表路径，启用列表时提供。
 */
