import * as fs from 'fs';
import { first, of } from '../config/sections.uc';
import { list, port } from '../config/values.uc';
import { render } from '../generator/render.uc';
import { CORE, core } from '../config/protocol/proxy.uc';
import { resolve } from './network.uc';
import { atomic, checked, command, mkdir, temporary } from './system.uc';
import { reset, remove } from './firewall.uc';
import { geo, update } from './rules.uc';
import { prepare as prepareDNS } from './dns.uc';
import { logger } from './files.uc';

// Instance 为 procd 的输入：id/name（标识），command（argv），env（KEY=VALUE 数组），
// user（进程用户），log（文件路径或空），shunt（是否设置核心/no-file 资源限制）。
// ServicePlan 为 {instances:[Instance]}；所有业务准备完成后才交给 Shell procd 桥接层。
export function plan(sections) {
	let global = first(sections, 'hijpass'), instances = [];
	if (global.enabled != '1') return { instances };
	function instance(section, name, args, shunt) {
		let env = list(section.procd_env);
		for (let entry in env) if (!match(entry, /^[A-Za-z_][A-Za-z0-9_]*=/)) die('invalid procd_env');
		if (shunt) push(env, 'XRAY_LOCATION_ASSET=/usr/share/v2ray');
		return {
			id: section['.name'], name, command: args, env, shunt: !!shunt,
			user: section.nest_proxy == '1' ? 'root' : 'hijpass', log: section.log_path || '',
		};
	}
	let client = global.client_dir || '/etc/hijpass/client';
	for (let section in of(sections, 'proxy_node')) {
		if (section.enabled != '1') continue;
		let name = section.name || section['.name'];
		if (match(name, /[\/\\\r\n]/)) die('invalid proxy filename');
		let path = `${client}/${name}-${section['.name']}.json`;
		let engine = core(section.core || (section.type == 'vless' ? CORE.xray : section.type == 'custom' ? CORE.custom : CORE.singbox));
		let args;
		if (engine == CORE.xray) args = ['xray', '-c', path];
		else if (engine == CORE.singbox) args = ['sing-box', '-c', path, 'run'];
		else if (engine == CORE.custom) {
			if (!section.command) die(`custom node "${name}" has no command`);
			// 自定义节点的 command 本身是用户填写的 Shell 命令；配置路径仍进行引用。
			args = ['/bin/sh', '-c', replace(section.command, '{conf_path}', command([path]))];
		}
		else die(`unsupported core "${engine}"`);
		push(instances, instance(section, name, args));
	}
	let shunt = first(sections, 'shunt');
	if (shunt.enabled != '0' && shunt.type) {
		let engine = core(shunt.type), path = global.shunt_conf || '/etc/hijpass/shunt.json';
		if (engine != CORE.xray && engine != CORE.singbox) die('unsupported shunt core');
		push(instances, instance(shunt, 'shunt', engine == CORE.xray ? ['xray', '-c', path] : ['sing-box', 'run', '-c', path], true));
	}
	return { instances };
};

// ConfigFile：path 为目标路径，data 为已完整生成和解析上游域名的 JSON 文本。
// 单次生成先完成全部转换/DNS，再创建临时文件；已提交的文件在后续错误时恢复。
export function writeConfigs(sections, generated) {
	let global = first(sections, 'hijpass'), client = global.client_dir || '/etc/hijpass/client', files = [];
	for (let section in of(sections, 'proxy_node')) {
		let config = generated.nodes[section['.name']];
		if (!config) continue;
		let name = section.name || section['.name'];
		if (match(name, /[\/\\\r\n]/)) die('invalid proxy filename');
		if (section.upstream_proxy_node && section.server && !iptoarr(section.server)) {
			let address = resolve(section.server), outbound = config.outbounds[0];
			if (outbound.server) outbound.server = address;
			else if (outbound.settings?.address) outbound.settings.address = address;
			else die('unsupported proxy server field');
		}
		push(files, { path: `${client}/${name}-${section['.name']}.json`, data: sprintf('%.2J\n', config) });
	}
	if (generated.shunt) push(files, { path: global.shunt_conf || '/etc/hijpass/shunt.json', data: sprintf('%.2J\n', generated.shunt) });
	let staged = [], committed = [];
	try {
		for (let file in files) {
			let temp = temporary(file.path), original = fs.readfile(file.path), mode = fs.stat(file.path)?.mode;
			atomic(temp, file.data);
			push(staged, { path: file.path, temp, original, mode });
		}
		for (let file in staged) {
			if (!fs.rename(file.temp, file.path)) die(`cannot replace ${file.path}`);
			push(committed, file);
		}
	}
	catch (e) {
		for (let file in reverse(committed)) {
			if (file.original == null) fs.unlink(file.path);
			else atomic(file.path, file.original, file.mode);
		}
		for (let file in staged) fs.unlink(file.temp);
		die(e.message);
	}
	return files;
};
export function prepare(sections) {
	let output = plan(sections);
	if (first(sections, 'hijpass').enabled != '1') return output;
	let log = logger(sections);
	log('INFO', 'Preparing proxy configurations');
	writeConfigs(sections, render(sections));
	let shunt = first(sections, 'shunt');
	if (shunt.enabled != '0' && core(shunt.type) == CORE.singbox && shunt.ruleset_convert == '1') geo('-t', null, [], sections);
	let dns = prepareDNS(sections);
	if (dns) push(output.instances, dns);
	for (let instance in output.instances) if (instance.log) mkdir(fs.dirname(instance.log));
	return output;
};
function hook(sections, action) {
	let path = first(sections, 'hijpass').dns_hook;
	if (path) checked([path, action]);
}
function cron(sections, enabled) {
	let path = '/etc/crontabs/root';
	let entries = filter(split(fs.readfile(path) || '', '\n'), line => line && !match(line, /\/hijpass\/rules[.](sh|uc)/) && !match(line, /\/hijpass\/clean-service-log[.](sh|uc) hijpass/));
	if (enabled) {
		let schedule = first(sections, 'rule').update_schedule;
		if (schedule) {
			if (!match(schedule, /^[A-Za-z0-9*\/,? -]+$/) || length(split(trim(schedule) || '', /[ \t]+/)) != 5) die('invalid update schedule');
			push(entries, `${schedule} /usr/lib/hijpass/rules.uc update`);
		}
		if (length(filter(sections, section => !!section.log_path))) push(entries, '*/10 * * * * /usr/lib/hijpass/clean-service-log.uc hijpass');
	}
	atomic(path, join('\n', entries) + '\n');
	checked(['/etc/init.d/cron', 'restart']);
}
export function deactivate(sections) {
	// 停止时继续执行其它清理步骤，最后统一报告失败，避免单个 hook 留下透明路由。
	let failures = [];
	for (let cleanup in [() => hook(sections, 'stop'), () => checked(['/usr/lib/hijpass/route.sh', 'remove']), () => remove(), () => cron(sections, false)]) {
		try { cleanup(); } catch (e) { push(failures, e.message); }
	}
	fs.unlink('/etc/hijpass/chinadns-ng.conf');
	if (length(failures)) die(join('; ', failures));
	logger(sections)('INFO', 'Service stopped');
};
export function activate(sections) {
	if (first(sections, 'hijpass').enabled != '1') return;
	try {
		reset(sections);
		checked(['/usr/lib/hijpass/route.sh', 'reset']);
		hook(sections, 'start');
		cron(sections, true);
	}
	catch (e) { deactivate(sections); die(e.message); }
	logger(sections)('INFO', 'Service started');
};
export function autoUpdate(sections) {
	let interval = int(first(sections, 'rule').update_interval || '0');
	const last = '/tmp/hijpass_last_update';
	if (interval <= 0 || time() - int(fs.readfile(last) || '0') < interval * 86400) return;
	let result = update(sections, 'all');
	if (!result.success) die('automatic rule update failed');
	atomic(last, `${time()}\n`);
	if (first(sections, 'hijpass').enabled == '1') checked(['/etc/init.d/hijpass', 'restart']);
};

// 服务端配置为用户编辑的原生 JSON，保留原文件；这里只声明进程与开放端口。
// ServerPlan 使用相同的 Instance 字段；ports 为显式 allow_firewall 的监听端口数组。
export function serverPlan(sections) {
	let global = first(sections, 'hijserver'), instances = [], ports = [];
	if (global.enabled != '1') return { instances, ports };
	for (let section in of(sections, 'server_node')) {
		if (section.enabled != '1') continue;
		let name = section.name || section['.name'];
		if (match(name, /[\/\\\r\n]/)) die('invalid server filename');
		if (!section.command) die(`server "${name}" has no command`);
		let env = list(section.procd_env), path = `${global.server_dir || '/etc/hijpass/server'}/${name}-${section['.name']}.json`;
		for (let entry in env) if (!match(entry, /^[A-Za-z_][A-Za-z0-9_]*=/)) die('invalid procd_env');
		push(instances, {
			id: section['.name'], name, command: ['/bin/sh', '-c', replace(section.command, '{conf_path}', command([path]))],
			env, user: 'root', shunt: false, log: section.log_path || '',
		});
		if (section.allow_firewall == '1') push(ports, port(section.listen_port));
	}
	return { instances, ports: uniq(ports) };
};
const SERVER_TABLE = '/usr/share/nftables.d/table-post/hijserver.nft';
const SERVER_CHAIN = '/usr/share/nftables.d/chain-pre/input_wan/hijserver.nft';
export function serverPrepare(sections) {
	let output = serverPlan(sections);
	for (let instance in output.instances) if (instance.log) mkdir(fs.dirname(instance.log));
	return output;
};
function serverCron(instances) {
	let path = '/etc/crontabs/root';
	let entries = filter(split(fs.readfile(path) || '', '\n'), line => line && !match(line, /\/hijpass\/clean-service-log[.](sh|uc) hijserver/));
	if (length(filter(instances, instance => instance.log))) push(entries, '*/10 * * * * /usr/lib/hijpass/clean-service-log.uc hijserver');
	atomic(path, join('\n', entries) + '\n'); checked(['/etc/init.d/cron', 'restart']);
}
export function serverActivate(sections) {
	let output = serverPlan(sections);
	// 只开放明确选中的端口；没有端口时删除旧 include，避免旧服务端仍对 WAN 开放。
	if (length(output.ports)) {
		let ports = join(', ', output.ports);
		atomic(SERVER_TABLE, `chain hijserver {\n    tcp dport { ${ports} } counter accept\n    udp dport { ${ports} } counter accept\n    return\n}\n`, 0o644);
		atomic(SERVER_CHAIN, 'jump hijserver comment "hijserver rule"\n', 0o644);
	}
	else { fs.unlink(SERVER_TABLE); fs.unlink(SERVER_CHAIN); }
	checked(['fw4', 'reload']); serverCron(output.instances);
};
export function serverDeactivate() {
	fs.unlink(SERVER_TABLE); fs.unlink(SERVER_CHAIN);
	let errors = [];
	for (let cleanup in [() => checked(['fw4', 'reload']), () => serverCron([])]) try { cleanup(); } catch (e) { push(errors, e.message); }
	if (length(errors)) die(join('; ', errors));
};
