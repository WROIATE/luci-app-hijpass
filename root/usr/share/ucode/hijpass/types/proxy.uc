// 共享类型声明；仅用于编辑器，不创建或导出运行时对象。

/**
 * @typedef {object} Hysteria2Options
 * @property {string} password 远端认证密码。
 * @property {integer|null} up_mbps 上行 Mbps；null 表示未设置。
 * @property {integer|null} down_mbps 下行 Mbps；null 表示未设置。
 * @property {string[]} server_ports 跳跃端口或范围，缺省为空数组。
 * @property {string} hop_interval 跳跃间隔，保留时长字符串。
 * @property {string} obfs_type QUIC 混淆类型。
 * @property {string} obfs_password 混淆密码。
 */

/**
 * @typedef {object} TransportOptions
 * @property {string} transport_type 传输类型；空值使用协议默认传输。
 * @property {string} transport_xhttp_host XHTTP Host 头。
 * @property {string} transport_xhttp_path XHTTP 路径。
 * @property {string} transport_xhttp_mode XHTTP 模式。
 * @property {string} transport_xhttp_method XHTTP 上行请求方法；空值由核心决定。
 * @property {string} transport_httpupgrade_host HTTPUpgrade Host 头。
 * @property {string} transport_httpupgrade_path HTTPUpgrade 路径。
 * @property {string} transport_ws_host WebSocket Host 头。
 * @property {string} transport_ws_path WebSocket 路径，空值使用 /。
 * @property {integer|null} transport_ws_max_early_data early data 字节数；null 表示未设置。
 * @property {string} transport_grpc_service_name gRPC 服务名称。
 * @property {string} transport_grpc_idle_timeout 空闲时长，生成时转换为秒。
 * @property {string} transport_grpc_ping_timeout ping 等待时长，生成时转换为秒。
 * @property {boolean} transport_grpc_permit_without_stream 没有活动流时是否发送 ping。
 */
