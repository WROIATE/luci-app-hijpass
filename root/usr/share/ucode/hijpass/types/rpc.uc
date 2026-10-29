// 共享类型声明；仅用于编辑器，不创建或导出运行时对象。

/**
 * 后端可编辑资源的业务标识；不接受客户端提供的任意文件路径。
 * @typedef {{
 *   resource: string,
 *   section: string|null,
 *   name: string|null
 * }} EditorResource
 */

/**
 * 读取只需要资源标识，保存时 content 必须为字符串。
 * @typedef {EditorResource & {
 *   content: string|null
 * }} EditorRequest
 */

/**
 * 日志 ID 为 package:section；只有 read 动作需要 lines。
 * @typedef {{
 *   id: string,
 *   action: string,
 *   lines: string|null
 * }} LogRequest
 */

/**
 * @typedef {{
 *   content: string
 * }} EditorContent
 */

/** @typedef {EditorContent|{ok: boolean}} EditorResponse */

/**
 * @typedef {{
 *   id: string,
 *   kind: string,
 *   name: string
 * }} LogEntry
 */

/**
 * @typedef {{
 *   logs: LogEntry[]
 * }} LogList
 */

/** @typedef {(EditorContent & {name: string|null})|{ok: boolean}} LogResponse */
