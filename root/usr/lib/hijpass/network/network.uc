import * as fs from 'fs';
import { query } from 'resolv';
import { port } from 'hijpass.config.values';
import { run, text } from 'hijpass.common';

// 地址解析返回 IP 字符串，不改动 TLS 的 server_name，代理链仍可验证原始域名证书。
/**
 * @param {string|null} host
 * @returns {string} 首个可用 IPv4 地址，无 A 记录时回退 IPv6；传入 IP 原样返回，解析失败抛错。
 */
export function resolve(host) {
	if (type(host) != 'string') die('invalid argument');
	if (iptoarr(host)) return host;
	if (!match(host || '', /^[A-Za-z0-9.-]+$/)) die('invalid argument');
	let answer = query(host, { type: ['A', 'AAAA'], timeout: 5000 });
	let addresses = answer?.[host]?.A || answer?.A || [];
	if (!length(addresses)) addresses = answer?.[host]?.AAAA || answer?.AAAA || [];
	if (!length(addresses)) die(`resolve failed: ${host}`);
	let address = addresses[0];
	if (type(address) != 'string' || !iptoarr(address)) die(`invalid DNS answer: ${host}`);
	return address;
};
/**
 * @param {string[]} values
 * @returns {object} 按输入端口字符串索引的 TCP 监听状态；true 表示 IPv4/IPv6 任一 TCP 表中正在监听。
 */
export function ports(values) {
	let occupied = {};
	// /proc 的 TCP 表由内核提供，避免为每个端口重复执行 netstat 和 jq。
	for (let path in ['/proc/net/tcp', '/proc/net/tcp6']) {
		for (let line in split(fs.readfile(path) || '', '\n')) {
			let fields = split(trim(line), /[ \t]+/);
			if (fields[3] != '0A') continue;
			occupied[hex(split(fields[1] || '', ':')[1])] = true;
		}
	}
	let result = {};
	for (let value in values) { port(value); result[value] = !!occupied[int(value)]; }
	return result;
};

/**
 * @param {{stdout: string, code: integer}} response Shell 提供的标准输出及真实退出状态。
 * @param {string} url 原始 URL，用于报告。
 * @returns {object} 探测报告：含 url/success/exit_code；curl 输出完整时补充 HTTP 状态、远端地址/端口及各阶段耗时（毫秒）。
 */
export function curlReport(response, url) {
	let fields = split(response.stdout, '\n');
	let result = { url, success: response.code == 0, exit_code: response.code };
	if (length(fields) >= 8) {
		result.http_code = int(fields[0]); result.remote_ip = fields[1]; result.remote_port = int(fields[2]);
		for (let key, value in {
			dns_lookup_time_ms: +fields[3], tcp_connect_time_ms: +fields[4], tls_handshake_time_ms: +fields[5],
			server_processing_time_ms: +fields[6], total_time_ms: +fields[7], first_byte_time_ms: +fields[6],
		}) result[key] = int(value * 1000);
	}
	return result;
};

// ProbeRequest：url 是 HTTP(S) 地址，timeout 为秒，socks 为本地 SOCKS 端口或空。
/**
 * @param {string|null} url
 * @param {string} [timeout]
 * @param {string} [socks]
 * @returns {object} 已校验的探测参数 {url, timeout, socks}；timeout 为秒，未指定代理时 socks 为空字符串。
 */
export function request(url, timeout, socks) {
    if (type(url) != 'string') die('only http:// and https:// URLs are supported');
    if (!match(url || '', /^https?:\/\//)) die('only http:// and https:// URLs are supported');
    if (!match(timeout || '5', /^[0-9]+$/)) die('timeout must be an integer');
    let seconds = int(timeout || '5');
    if (seconds < 1 || seconds > 120) die('timeout must be between 1 and 120');
    if (socks) port(socks);
    return { url, timeout: seconds, socks: socks || '' };
};
// Shell 提供 curl 原始输出及真实退出码；这里仅解析和计算测速数据。
/**
 * @param {object} response
 * @param {string} url
 * @returns {object} 测速成功时返回 {ms, total_ms}（毫秒）；失败且非 curl 退出码 56 时返回 {error: "timeout"}。
 */
export function pingReport(response, url) {
    let result = curlReport(response, url);
    if (!result.success && result.exit_code != 56) return { error: 'timeout' };
    return { ms: result.first_byte_time_ms - result.dns_lookup_time_ms, total_ms: result.total_time_ms };
};
// IPv4/IPv6 CIDR 比较使用内建字节地址，不需要 Lua/luci.ip。
/**
 * @param {string} address
 * @param {string} cidr
 * @returns {boolean} 地址位于 CIDR 内时为 true；地址无效、地址族不同或前缀无效时为 false。
 */
export function contains(address, cidr) {
	let parts = split(cidr, '/'), host = iptoarr(address), range = iptoarr(parts[0] || '');
	let prefix = parts[1] || '';
	if (!host || !range || length(host) != length(range)) return false;
	let bits = parts[1] == null ? length(host) * 8 : int(parts[1]);
	if (bits < 0 || bits > length(host) * 8 || parts[1] != null && !match(prefix, /^[0-9]+$/)) return false;
	for (let i = 0; i < length(host) && bits > 0; i++, bits -= 8) {
		let mask = (0xff << (8 - min(bits, 8))) & 0xff;
		if ((host[i] & mask) != (range[i] & mask)) return false;
	}
	return true;
};

/** @returns {null} 不返回业务数据；向 stdout 输出解析地址、监听状态、探测参数/报告或地址族文本，失败输出 JSON 错误并退出。 */
export function main() { run(() => {
    let action = shift(ARGV);
    if (action == 'resolve') return { address: resolve(ARGV[0]) };
    if (action == 'port') return ports(ARGV);
    if (action == 'iptype') {
        let bytes = iptoarr(split(ARGV[0] || '', '/')[0] || '');
        if (!bytes) exit(1);
        return `${length(bytes) == 4 ? 4 : 6}\n`;
    }
    if (action == 'request') return request(ARGV[0], ARGV[1], ARGV[2]);
    if (action == 'report' || action == 'ping-report') {
        let response = { stdout: text(ARGV[0]), code: int(ARGV[1]) };
        return action == 'report' ? curlReport(response, ARGV[2] || '') : pingReport(response, ARGV[2] || '');
    }
    die('unknown network data action');
}, true);
};
