// 共享类型声明；仅用于编辑器，不创建或导出运行时对象。

/**
 * @typedef {object} CommandOutput
 * @property {string} stdout 外部命令输出的原始 JSON 文本。
 * @property {integer} code 命令的退出状态，0 表示成功。
 */

/**
 * @typedef {object} NetworkSnapshot
 * @property {string} wan fw4 返回的 WAN 设备名，每行一个。
 * @property {CommandOutput} addresses ip -j address 的输出与退出状态。
 * @property {CommandOutput} interfaces ubus network.interface dump 的输出与退出状态。
 */
