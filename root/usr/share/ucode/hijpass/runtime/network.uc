import * as fs from 'fs';
import { query } from 'resolv';
import { exec } from './system.uc';
import { port } from '../uci/config.uc';

// 地址解析返回 IP 字符串，不改动 TLS 的 server_name，代理链仍可验证原始域名证书。
/**
 * @param {string} host
 * @returns {string}
 */
export function resolve(host) {
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
 */
export function ports(values) {
	let occupied = {};
	// /proc 的 TCP 表由内核提供，避免为每个端口重复执行 netstat 和 jq。
	for (let path in ['/proc/net/tcp', '/proc/net/tcp6']) {
		for (let line in split(fs.readfile(path) || '', '\n')) {
			let fields = split(trim(line), /[ \t]+/);
			if (fields[3] != '0A') continue;
			occupied[hex(split(fields[1], ':')[1])] = true;
		}
	}
	let result = {};
	for (let value in values) { port(value); result[value] = !!occupied[int(value)]; }
	return result;
};

// CurlReport：success/exit_code/http_code/remote_ip/remote_port/url，
// 所有 *_time_ms 均为毫秒整数。connect/ping 共用同一份安全的 curl 输出解析。
/**
 * @param {string} url
 * @param {string} [timeout]
 * @param {string} [socks]
 */
export function connect(url, timeout, socks) {
	if (!match(url || '', /^https?:\/\//)) die('only http:// and https:// URLs are supported');
	if (!match(timeout || '5', /^[0-9]+$/)) die('timeout must be an integer');
	let seconds = int(timeout || '5');
	if (seconds < 1 || seconds > 120) die('timeout must be between 1 and 120');
	let format = '%{http_code}\n%{remote_ip}\n%{remote_port}\n%{time_namelookup}\n%{time_connect}\n%{time_appconnect}\n%{time_starttransfer}\n%{time_total}\n';
	let args = ['curl', '-I', '-sS', '-o', '/dev/null', '--max-time', `${seconds}`, '-w', format];
	if (socks) push(args, '--socks5', `127.0.0.1:${port(socks)}`);
	push(args, '--', url);
	let response = exec(args, true), fields = split(response.stdout, '\n');
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
/**
 * @param {string} socks
 * @param {string} [host]
 */
export function ping(socks, host) {
	let result = connect(`https://${host || 'www.google.com'}`, '5', socks);
	if (!result.success && result.exit_code != 56) return { error: 'timeout' };
	return { ms: result.first_byte_time_ms - result.dns_lookup_time_ms, total_ms: result.total_time_ms };
};

// IPv4/IPv6 CIDR 比较使用内建字节地址，不需要 Lua/luci.ip。
/**
 * @param {string} address
 * @param {string} cidr
 */
export function contains(address, cidr) {
	let parts = split(cidr, '/'), host = iptoarr(address), range = iptoarr(parts[0]);
	if (!host || !range || length(host) != length(range)) return false;
	let bits = parts[1] == null ? length(host) * 8 : int(parts[1]);
	if (bits < 0 || bits > length(host) * 8 || parts[1] != null && !match(parts[1], /^[0-9]+$/)) return false;
	for (let i = 0; i < length(host) && bits > 0; i++, bits -= 8) {
		let mask = (0xff << (8 - min(bits, 8))) & 0xff;
		if ((host[i] & mask) != (range[i] & mask)) return false;
	}
	return true;
};
