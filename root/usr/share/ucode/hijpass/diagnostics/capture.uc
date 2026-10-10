import * as fs from 'fs';
import { read } from '../uci/config.uc';
import { resolve } from '../runtime/network.uc';
import { exec, quote, atomic, mkdir, removeTree, lines } from '../runtime/system.uc';
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
		let arg = args[i];
		if (options[arg]) { if (args[i + 1] == null) die(`missing value for ${arg}`); c[options[arg]] = args[++i]; }
		else if (arg == '-p') c.tcpdump = true;
		else if (arg == '-v') c.verbose = true;
		else if (arg == '-K') c.keep = true;
		else if (arg == '-h') { print('trace-url.uc [-t 1..120] [-X HEAD|GET] [-p] [-i iface] [-v] [-K] URL\ntrace-url.uc -c IP [-n all|tcp|udp] [-P port|all] [-t 1..120] [-p] [-i iface] [-v] [-K]\n'); exit(0); }
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
		if (!iptoarr(c.client)) die('invalid client IP');
		if (length(urls)) die('client mode does not take a URL');
		c.filter = c.port == 'all' ? `host ${c.client}` : `((src host ${c.client} and dst port ${c.port}) or (dst host ${c.client} and src port ${c.port}))`;
		if (c.protocol != 'all') c.filter += ` and ${c.protocol}`;
		else if (c.port != 'all') c.filter += ' and (tcp or udp)';
	}
	else {
		if (length(urls) != 1) die('router mode requires one URL');
		c.url = urls[0];
		let m = match(c.url, /^(https?):\/\/(\[[A-Fa-f0-9:.]+\]|[A-Za-z0-9_.-]+)(:([0-9]+))?([/?#]|$)/);
		if (!m) die('invalid HTTP URL');
		c.host = replace(m[2], /^\[|\]$/g, ''); c.targetPort = int(m[4] || (m[1] == 'https' ? '443' : '80'));
		if (c.targetPort < 1 || c.targetPort > 65535) die('invalid URL port');
		c.filter = `tcp port ${c.targetPort}`;
	}
	pid ||= fs.readlink('/proc/self'); c.chain = `trace-${pid}`; c.comment = `hijpass-trace-${pid}`;
	return c;
};

/**
 * @param {string} name
 */
function available(name) { return exec(['/bin/sh', '-c', 'command -v ' + quote(name)], true).code == 0; }
function positions() {
	let sections;
	// 诊断本身不依赖服务已配置；缺少 UCI 时仍可提供 nft/系统日志报告。
	try { sections = read(); } catch (e) { return []; }
	return filter(map(uniq(map(sections, s => s.log_path)), path => {
		let stat = path && fs.stat(path);
		return stat?.type == 'file' ? { path, offset: stat.size, inode: stat.inode } : null;
	}), entry => entry != null);
}
function deleteRules(c) {
	if (c.mode == 'client') {
		exec(['nft', 'flush', 'chain', 'inet', 'hijpass', c.chain], true);
		exec(['nft', 'delete', 'chain', 'inet', 'hijpass', c.chain], true);
		return;
	}
	for (let chain in ['pre-filter', 'out-route']) for (let line in lines(exec(['nft', '-a', 'list', 'chain', 'inet', 'hijpass', chain], true).stdout)) {
		if (index(line, `comment "${c.comment}"`) < 0) continue;
		let handle = match(line, /# handle ([0-9]+)/);
		if (handle) exec(['nft', 'delete', 'rule', 'inet', 'hijpass', chain, 'handle', handle[1]], true);
	}
}
function addRules(c, directory) {
	function nft(args) {
		let result = exec(['nft', ...args], true);
		if (result.code) { atomic(directory + '/nft.setup', `nft ${join(' ', args)} failed (${result.code})\n`); die('cannot install trace rule'); }
	}
	function insert(chain, args) { nft(['insert', 'rule', 'inet', 'hijpass', chain, ...args, 'meta', 'nftrace', 'set', '1', 'comment', c.comment]); }
	if (c.mode == 'client') {
		// priority -301 捕获 NAT 改写前的目的地址；独立链不会修改现有规则顺序。
		nft(['add', 'chain', 'inet', 'hijpass', c.chain, '{ type filter hook prerouting priority -301; policy accept; }']);
		let args = [length(iptoarr(c.client)) == 4 ? 'ip' : 'ip6', 'saddr', c.client];
		if (c.protocol != 'all') push(args, 'meta', 'l4proto', c.protocol);
		else if (c.port != 'all') push(args, 'meta', 'l4proto', '{ tcp, udp }');
		if (c.port != 'all') push(args, 'th', 'dport', c.port);
		insert(c.chain, args);
	}
	else {
		for (let address in c.addresses) insert('out-route', [length(iptoarr(address)) == 4 ? 'ip' : 'ip6', 'daddr', address, 'tcp', 'dport', `${c.targetPort}`]);
		insert('out-route', ['tcp', 'dport', `${c.targetPort}`]);
	}
}

// PreparedCapture：包含所有已校验的 Capture 字段及 directory（任务目录）。
// metadata.json 额外保存日志位置快照；Shell 无需解析 UCI 或拼装 nft 表达式。
/**
 * @param {string} pid
 * @param {string[]} args
 */
export function prepare(pid, args) {
    if (!match(pid || '', /^[0-9]+$/)) die('invalid capture PID');
    let c = parse(args, pid);
    if (trim(exec(['id', '-u']).stdout) != '0') die('must run as root');
    for (let name in ['nft', ...(c.mode == 'router' ? ['curl'] : []), ...(c.tcpdump ? ['tcpdump'] : [])]) if (!available(name)) die(`${name} is required`);
    if (exec(['nft', 'list', 'table', 'inet', 'hijpass'], true).code) die('nft table inet hijpass not found');
    if (c.mode == 'router') { try { c.addresses = [resolve(c.host)]; } catch (e) { warn(`${e.message}\n`); } }
    c.directory = `/tmp/hijpass-trace.${pid}`;
    mkdir(c.directory, 0o700);
    try {
        for (let name in ['nft.trace', 'nft.setup', 'system.log', 'tcpdump.log', 'tcpdump.err', 'curl.out', 'curl.err']) atomic(`${c.directory}/${name}`, '');
        atomic(c.directory + '/metadata.json', sprintf('%J', { capture: c, positions: positions() }));
        addRules(c, c.directory);
    }
    catch (e) { deleteRules(c); removeTree(c.directory); die(e.message); }
    return c;
};
/**
 * @param {string} directory 捕获目录 /tmp/hijpass-trace.PID。
 */
export function finish(directory) {
    if (!match(directory || '', /^\/tmp\/hijpass-trace[.][0-9]+$/)) die('invalid capture directory');
    // 清理标识来自已校验的目录名，metadata 缺失或损坏也能删除本次捕获规则。
    let pid = substr(directory, length('/tmp/hijpass-trace.'));
    let identity = { chain: `trace-${pid}`, comment: `hijpass-trace-${pid}` };
    deleteRules({ ...identity, mode: 'client' });
    deleteRules({ ...identity, mode: 'router' });
    let error, keep = false;
    try {
        let text = fs.readfile(directory + '/metadata.json');
        if (type(text) != 'string') die('cannot read capture metadata');
        let metadata = json(text);
        if (type(metadata) != 'object' || type(metadata.capture) != 'object') die('invalid capture metadata');
        let c = metadata.capture;
        if (c.chain != identity.chain || c.comment != identity.comment || (c.mode != 'client' && c.mode != 'router')) die('invalid capture identity');
        keep = c.keep === true;
        print(report(c, directory, metadata.positions));
    }
    catch (e) { error = e.message; }
    if (keep) print(`Temporary files kept: ${directory}\n`);
    else removeTree(directory);
    if (error) die(error);
};
