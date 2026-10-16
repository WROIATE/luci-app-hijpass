import * as fs from 'fs';
import { first, of } from 'hijpass.config.sections';
import { list, port } from 'hijpass.config.values';
import { render as renderCore } from 'hijpass.coreconfig.render';
import { CORE, core, CONFIG_TYPE, configType } from 'hijpass.config.protocol.proxy';
import { resolve } from '../network/network.uc';
import { atomic, command, temporary, run, sections, renderTemplate } from 'hijpass.common';
import { prepare as prepareDNS } from './dns.uc';
import { logger } from '../maintenance/logs.uc';

/**
 * @typedef {object} ServicePlan
 * @property {object[]} instances procd 的进程描述数组。
 * @property {number[]} [ports] 服务端允许开放的端口数组。
 */
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
		let args;
		if (configType(section.config_type) == CONFIG_TYPE.custom) {
			if (!trim(section.command || '')) die(`custom node "${name}" has no command`);
			// 自定义节点的 command 本身是用户填写的 Shell 命令；配置路径仍进行引用。
			args = ['/bin/sh', '-c', replace(section.command, '{conf_path}', command([path]))];
		}
		else {
			let engine = core(section.core);
			if (engine == CORE.xray) args = ['xray', '-c', path];
			else if (engine == CORE.singbox) args = ['sing-box', '-c', path, 'run'];
			else die(`unsupported core "${engine}"`);
		}
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
function cron(sections, enabled) {
	let path = '/etc/crontabs/root';
	let entries = filter(split(fs.readfile(path) || '', '\n'), line => line && !match(line, /\/hijpass\/(rules[.](sh|uc)|rules\/update[.]sh)/) && !match(line, /\/hijpass\/(clean-service-log[.](sh|uc)|maintenance\/logs[.]sh) hijpass/));
	if (enabled) {
		let schedule = first(sections, 'rule').update_schedule;
		if (schedule) {
			if (!match(schedule, /^[A-Za-z0-9*\/,? -]+$/) || length(split(trim(schedule) || '', /[ \t]+/)) != 5) die('invalid update schedule');
			push(entries, `${schedule} /usr/lib/hijpass/rules/update.sh update`);
		}
		if (length(filter(sections, section => !!section.log_path))) push(entries, '*/10 * * * * /usr/lib/hijpass/maintenance/logs.sh hijpass');
	}
	atomic(path, join('\n', entries) + '\n');
}
// 服务端配置为用户编辑的原生 JSON，保留原文件；这里只声明进程与开放端口。
// ServerPlan 使用相同的 Instance 字段；ports 为显式 allow_firewall 的监听端口数组。
/**
 * @param {object[]} sections
 * @returns {ServicePlan}
 */
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
function serverCron(instances) {
	let path = '/etc/crontabs/root';
	let entries = filter(split(fs.readfile(path) || '', '\n'), line => line && !match(line, /\/hijpass\/(clean-service-log[.](sh|uc)|maintenance\/logs[.]sh) hijserver/));
	if (length(filter(instances, instance => instance.log))) push(entries, '*/10 * * * * /usr/lib/hijpass/maintenance/logs.sh hijserver');
	atomic(path, join('\n', entries) + '\n');
}
function writeServerRules(sections) {
	let output = serverPlan(sections);
	// 只开放明确选中的端口；没有端口时删除旧 include，避免旧服务端仍对 WAN 开放。
	if (length(output.ports)) {
		atomic(SERVER_TABLE, renderTemplate('/usr/lib/hijpass/service/server.ut', { ports: output.ports }), 0o644);
		atomic(SERVER_CHAIN, 'jump hijserver comment "hijserver rule"\n', 0o644);
	}
	else { fs.unlink(SERVER_TABLE); fs.unlink(SERVER_CHAIN); }
};

// ServiceSettings 是执行层需要的业务值；不包含可执行的通用动作列表。
// enabled 控制启停，geo_convert 控制 Geo 准备，dns_hook 是用户配置的 hook，
// update_interval 为自动更新间隔天数，log_paths 为需要准备目录的日志位置。
/**
 * @param {object[]} config
 * @param {boolean} server
 */
function settings(config, server) {
    let global = first(config, server ? 'hijserver' : 'hijpass'), shunt = first(config, 'shunt');
    return { enabled: global.enabled == '1', dns_hook: global.dns_hook || '',
        geo_convert: !server && shunt.enabled != '0' && core(shunt.type) == CORE.singbox && shunt.ruleset_convert == '1',
        update_interval: int(first(config, 'rule').update_interval || '0'),
        log_paths: filter(map(config, item => item.log_path), path => !!path) };
};
export function main() { run(() => {
    let server = ARGV[0] == 'server';
    if (server) shift(ARGV);
    let config = sections(server ? 'hijserver' : 'hijpass'), action = shift(ARGV);
    if (action == 'settings') return settings(config, server);
    if (action == 'delay') return `${int(first(config, 'hijpass').delay_time || '0')}\n`;
    if (action == 'configs') {
        if (first(config, 'hijpass').enabled == '1') {
            // 先生成进程描述，确认自定义命令、环境变量和文件名有效，再替换配置。
            plan(config);
            logger(config)('INFO', 'Preparing proxy configurations');
            writeConfigs(config, renderCore(config));
        }
        return;
    }
    if (action == 'plan') return server ? serverPlan(config) : plan(config);
    if (action == 'prepare') {
        if (server) return serverPlan(config);
        let result = plan(config);
        if (first(config, 'hijpass').enabled == '1') {
            let dns = prepareDNS(config);
            if (dns) push(result.instances, dns);
        }
        return result;
    }
    if (action == 'cron') {
        if (server) return serverCron(ARGV[0] == 'enable' ? serverPlan(config).instances : []);
        return cron(config, ARGV[0] == 'enable');
    }
    if (action == 'server-files') return writeServerRules(config);
    die('unknown service data action');
});
};
