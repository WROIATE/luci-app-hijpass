import * as fs from 'fs';
import { read } from 'hijpass.uci.read';
import { resolve } from '../network/network.uc';
import { atomic, lines, run, text } from 'hijpass.common';
import { report } from './report.uc';

// Capture 字段：mode 为 client/router；client 为客户端 IP，protocol 为 all/tcp/udp，
// port 为目标端口或 all，seconds 为捕获时长。router 模式的 url/method/host/targetPort
// 描述 curl 请求；addresses 为解析结果。tcpdump/iface/verbose/keep 控制报告与文件保留。
// chain/comment 以当前 PID 隔离 nft 规则；filter 为已校验字段生成的 BPF 表达式。
/**
 * @param {string[]} args
 * @param {string} [pid]
 * @returns {object} 已校验的捕获参数。
 */
export function parse(args, pid) {
	let c = { mode: 'router', client: '', protocol: 'all', port: 'all', seconds: '8', method: 'HEAD',
		tcpdump: false, iface: 'any', verbose: false, keep: false, addresses: [] }, urls = [];
	const options = { '-c': 'client', '-n': 'protocol', '-P': 'port', '-t': 'seconds', '-X': 'method', '-i': 'iface' };
	for (let i = 0; i < length(args); i++) {
		let arg = args[i] || '';
		if (options[arg]) { if (args[i + 1] == null) die(`missing value for ${arg}`); c[options[arg]] = args[++i]; }
		else if (arg == '-p') c.tcpdump = true;
		else if (arg == '-v') c.verbose = true;
		else if (arg == '-K') c.keep = true;
		else if (arg == '-h') { print('capture.sh [-t 1..120] [-X HEAD|GET] [-p] [-i iface] [-v] [-K] URL\ncapture.sh -c IP [-n all|tcp|udp] [-P port|all] [-t 1..120] [-p] [-i iface] [-v] [-K]\n'); exit(0); }
		else if (substr(arg, 0, 1) == '-') die(`unknown option ${arg}`);
		else push(urls, arg);
	}
	if (!match(c.seconds, /^[0-9]+$/)) die('timeout must be an integer');
	c.seconds = int(c.seconds);
	if (c.seconds < 1) die('timeout must be >= 1');
	if (c.seconds > 120) die('timeout must be <= 120');
	if (index(['all', 'tcp', 'udp'], c.protocol) < 0) die('protocol must be all, tcp or udp');
	if (c.port != 'all' && (!match(c.port, /^[0-9]+$/) || int(c.port) < 1 || int(c.port) > 65535)) die('invalid destination port');
	if (!match(c.iface, /^[A-Za-z0-9_.:@-]+$/)) die('invalid tcpdump interface');
	c.method = uc(c.method);
	if (index(['HEAD', 'GET'], c.method) < 0) die('method must be HEAD or GET');
	if (c.client) {
		c.mode = 'client';
		if (!iptoarr(c.client || '')) die('invalid client IP');
		if (length(urls)) die('client mode does not take a URL');
		c.filter = c.port == 'all' ? `host ${c.client}` : `((src host ${c.client} and dst port ${c.port}) or (dst host ${c.client} and src port ${c.port}))`;
		if (c.protocol != 'all') c.filter += ` and ${c.protocol}`;
		else if (c.port != 'all') c.filter += ' and (tcp or udp)';
	}
	else {
		if (length(urls) != 1) die('router mode requires one URL');
		let url = urls[0];
		if (type(url) != 'string') die('invalid HTTP URL');
		c.url = url;
		let m = match(url, /^(https?):\/\/(\[[A-Fa-f0-9:.]+\]|[A-Za-z0-9_.-]+)(:([0-9]+))?([/?#]|$)/);
		if (!m) die('invalid HTTP URL');
		c.host = replace(m[2], /^\[|\]$/g, ''); c.targetPort = int(m[4] || (m[1] == 'https' ? '443' : '80'));
		if (c.targetPort < 1 || c.targetPort > 65535) die('invalid URL port');
		c.filter = `tcp port ${c.targetPort}`;
	}
	pid ||= fs.readlink('/proc/self'); c.chain = `trace-${pid}`; c.comment = `hijpass-trace-${pid}`;
	return c;
};

function positions() {
	let sections = [];
	// 诊断本身不依赖服务已配置；缺少 UCI 时仍可提供 nft/系统日志报告。
	try { sections = read(); } catch (e) { return []; }
	return filter(map(uniq(map(sections, s => s.log_path)), path => {
		let stat = path && fs.stat(path);
		return stat?.type == 'file' ? { path, offset: stat.size, inode: stat.inode } : null;
	}), entry => entry != null);
}
// PreparedCapture：包含所有已校验的 Capture 字段及 directory（任务目录）。
// metadata.json 额外保存日志位置快照；Shell 无需解析 UCI 或拼装 nft 表达式。
/**
 * @param {string|null} pid 命令参数，可缺失；入口拒绝空值。
 * @param {string[]} args
 */
export function prepare(pid, args) {
    if (!match(pid || '', /^[0-9]+$/)) die('invalid capture PID');
    let c = parse(args, pid);
    if (c.mode == 'router') { try { c.addresses = [resolve(c.host)]; } catch (e) { warn(`${e.message}\n`); } }
    c.directory = `/tmp/hijpass-trace.${pid}`;
    return c;
};

/**
 * @typedef {object} Capture
 * @property {string} mode client 或 router，决定报告布局。
 * @property {string|null} client 客户端 IP，client 模式使用。
 * @property {string} protocol all/tcp/udp，client 模式的网络过滤。
 * @property {string} port 目标端口或 all。
 * @property {integer} seconds 捕获时长，秒。
 * @property {string|null} url router 模式的请求 URL。
 * @property {string|null} method HEAD/GET，router 模式使用。
 * @property {string|null} host router 模式的目标域名或 IP。
 * @property {integer|null} targetPort router 模式的目标端口。
 * @property {string[]} addresses 解析后的目标 IP，空数组表示没有解析结果。
 * @property {boolean|null} verbose 是否输出原始日志。
 * @property {boolean|null} tcpdump 是否包含抓包报告。
 * @property {string|null} iface tcpdump 接口。
 * @property {string|null} filter tcpdump BPF 过滤表达式。
 * @property {string} chain 任务专属 nft 链名。
 * @property {string} comment 任务专属 nft 注释，用于区分规则。
 */
// 这里只生成 nft 文本；Shell 负责真正加载规则以及处理失败清理。
/**
 * @param {Capture} c
 * @returns {string}
 */
export function ruleText(c) {
    let result = [];
    function insert(chain, fields) {
        push(result, `insert rule inet hijpass ${chain} ${fields} meta nftrace set 1 comment "${c.comment}"`);
    }
    if (c.mode == 'client') {
        push(result, `add chain inet hijpass ${c.chain} { type filter hook prerouting priority -301; policy accept; }`);
        let fields = `${length(iptoarr(c.client || '')) == 4 ? 'ip' : 'ip6'} saddr ${c.client}`;
        if (c.protocol != 'all') fields += ` meta l4proto ${c.protocol}`;
        else if (c.port != 'all') fields += ' meta l4proto { tcp, udp }';
        if (c.port != 'all') fields += ` th dport ${c.port}`;
        insert(c.chain, fields);
    }
    else {
        for (let address in c.addresses) insert('out-route', `${length(iptoarr(address)) == 4 ? 'ip' : 'ip6'} daddr ${address} tcp dport ${c.targetPort}`);
        insert('out-route', `tcp dport ${c.targetPort}`);
    }
    return join('\n', result) + '\n';
};
/**
 * @param {string|null} directory
 * @returns {object}
 */
function identity(directory) {
    if (type(directory) != 'string' || !match(directory, /^\/tmp\/hijpass-trace[.][0-9]+$/)) die('invalid capture directory');
    let pid = substr(directory, length('/tmp/hijpass-trace.'));
    return { chain: `trace-${pid}`, comment: `hijpass-trace-${pid}` };
}
/**
 * @param {string|null} directory
 * @returns {object}
 */
function metadata(directory) {
    let expected = identity(directory), data;
    try { data = json(text(directory + '/metadata.json')); }
    catch (e) { die(`invalid capture metadata: ${e.message}`); }
    if (type(data) != 'object' || type(data.capture) != 'object') die('invalid capture metadata');
    let c = data.capture;
    if (c.chain != expected.chain || c.comment != expected.comment || (c.mode != 'client' && c.mode != 'router')) die('invalid capture identity');
    return data;
}
// CleanupPlan：rules 为 chain/handle 数组；标识从目录提取，不依赖损坏的 metadata。
/**
 * @param {string|null} directory
 * @param {string} raw
 * @returns {object}
 */
export function cleanupPlan(directory, raw) {
    let expected = identity(directory), rules = [];
    for (let line in lines(raw)) {
        let m = match(line, /^(pre-filter|out-route) (.*)$/);
        if (!m || index(m[2], `comment "${expected.comment}"`) < 0) continue;
        let handle = match(m[2], /# handle ([0-9]+)/);
        if (handle) push(rules, { chain: m[1], handle: handle[1] });
    }
    return { ...expected, rules };
};
export function main() { run(() => {
    let action = shift(ARGV);
    if (action == 'prepare') { let pid = shift(ARGV); return prepare(pid, ARGV); }
    if (action == 'rules') {
        let raw = ARGV[0];
        if (type(raw) != 'string') die('missing capture data');
        let c;
        try { c = json(raw); } catch (e) { die(`invalid capture data: ${e.message}`); }
        if (type(c) != 'object') die('invalid capture data');
        identity(c.directory);
        atomic(c.directory + '/metadata.json', sprintf('%J', { capture: c, positions: positions() }));
        return ruleText(c);
    }
    if (action == 'cleanup') return cleanupPlan(ARGV[0], text(ARGV[1]));
    if (action == 'report') {
        let directory = ARGV[0];
        if (type(directory) != 'string') die('invalid capture directory');
        let data = metadata(directory), c = data.capture;
        return report(c, directory, data.positions) + (c.keep === true ? `Temporary files kept: ${ARGV[0]}\n` : '');
    }
    if (action == 'keep') return metadata(ARGV[0]).capture.keep === true ? '1\n' : '0\n';
    if (action == 'task-status') {
        let directory = ARGV[0], active = ARGV[1] == '1';
        return { running: active, code: active ? null : int(fs.readfile(directory + '/exit')),
            stdout: fs.readfile(directory + '/stdout') || '', stderr: fs.readfile(directory + '/stderr') || '' };
    }
    die('unknown capture data action');
});
};
