import * as fs from 'fs';
import { FILES, nodeConfig, logPath } from 'hijpass.config.paths';
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
/**
 * 整理客户端节点和分流服务的 procd 启动计划。
 * @returns {ServicePlan} {instances}；服务禁用时 instances 为空数组。
 */
export function plan(sections) {
	let global = first(sections, 'hijpass'), instances = [];
	if (global.enabled != '1') {
		return { instances };
	}
	/**
	 * 组装单个服务实例的命令、环境和日志设置。
	 * @returns {object} procd 实例对象，含 command、env、user、log 等字段。
	 */
	function instance(section, name, args, shunt) {
		let env = list(section.procd_env);
		for (let entry in env) {
			if (!match(entry, /^[A-Za-z_][A-Za-z0-9_]*=/)) {
				die('invalid procd_env');
			}
		}
		if (shunt) {
			push(env, 'XRAY_LOCATION_ASSET=/usr/share/v2ray');
		}
		return {
			id: section['.name'], name, command: args, env, shunt: !!shunt,
			user: section.nest_proxy == '1' ? 'root' : 'hijpass', log: logPath(section),
		};
	}
	for (let section in of(sections, 'proxy_node')) {
		if (section.enabled != '1') {
			continue;
		}
		let name = section.name || section['.name'];
		let path = nodeConfig(section);
		let args;
		if (configType(section.config_type) == CONFIG_TYPE.custom) {
			if (!trim(section.command || '')) {
				die(`custom node "${name}" has no command`);
			}
			// 自定义节点的 command 本身是用户填写的 Shell 命令；配置路径仍进行引用。
			args = ['/bin/sh', '-c', replace(section.command, '{conf_path}', command([path]))];
		}
		else {
			let engine = core(section.core);
			if (engine == CORE.xray) {
				args = ['xray', '-c', path];
			}
			else if (engine == CORE.singbox) {
				args = ['sing-box', '-c', path, 'run'];
			}
			else {
				die(`unsupported core "${engine}"`);
			}
		}
		push(instances, instance(section, name, args));
	}
	let shunt = first(sections, 'shunt');
	if (shunt.enabled != '0' && shunt.type) {
		let engine = core(shunt.type), path = FILES.shunt_conf;
		if (engine != CORE.xray && engine != CORE.singbox) {
			die('unsupported shunt core');
		}
		push(instances, instance(shunt, 'shunt', engine == CORE.xray ? ['xray', '-c', path] : ['sing-box', 'run', '-c', path], true));
	}
	return { instances };
};

// ConfigFile：path 为目标路径，data 为已完整生成和解析上游域名的 JSON 文本。
// 单次生成先完成全部转换/DNS，再创建临时文件；已提交的文件在后续错误时恢复。
/**
 * 生成配置文件内容，全部准备成功后再替换现有文件。
 * @returns {object[]} 已写入的 {path, data} 数组；失败时恢复已替换文件。
 */
export function writeConfigs(sections, generated) {
	let files = [];
	for (let section in of(sections, 'proxy_node')) {
		let config = generated.nodes[section['.name']];
		if (!config) {
			continue;
		}
		if (section.upstream_proxy_node && section.server && !iptoarr(section.server)) {
			let address = resolve(section.server), outbound = config.outbounds[0];
			if (outbound.server) {
				outbound.server = address;
			}
			else if (outbound.settings?.address) {
				outbound.settings.address = address;
			}
			else {
				die('unsupported proxy server field');
			}
		}
		push(files, { path: nodeConfig(section), data: sprintf('%.2J\n', config) });
	}
	if (generated.shunt) {
		push(files, { path: FILES.shunt_conf, data: sprintf('%.2J\n', generated.shunt) });
	}
	let staged = [], committed = [];
	try {
		for (let file in files) {
			let temp = temporary(file.path), original = fs.readfile(file.path), mode = fs.stat(file.path)?.mode;
			atomic(temp, file.data);
			push(staged, { path: file.path, temp, original, mode });
		}
		for (let file in staged) {
			if (!fs.rename(file.temp, file.path)) {
				die(`cannot replace ${file.path}`);
			}
			push(committed, file);
		}
	}
	catch (e) {
		for (let file in reverse(committed)) {
			if (file.original == null) {
				fs.unlink(file.path);
			}
			else {
				atomic(file.path, file.original, file.mode);
			}
		}
		for (let file in staged) fs.unlink(file.temp);
		die(e.message);
	}
	return files;
};
// 启停只替换当前服务注册的任务，保留其他命令及参数中的同名文本。
/**
 * 筛选 crontab 内容，排除当前服务的已有任务。
 * @returns {string[]} 保留下来的非空任务行数组。
 */
function cronEntries(path, packageName) {
    let entries = [];
    for (let line in split(fs.readfile(path) || '', '\n')) {
        if (!line) {
            continue;
        }
        let fields = split(trim(line) || '', /[ \t]+/);
        let position = substr(fields[0] || '', 0, 1) == '@' ? 1 : 5;
        if (fields[position] == '/usr/lib/hijpass/maintenance/logs.sh' && fields[position + 1] == packageName) {
            continue;
        }
        if (packageName == 'hijpass' && fields[position] == '/usr/lib/hijpass/rules/update.sh') {
            continue;
        }
        push(entries, line);
    }
    return entries;
}
/**
 * 按服务状态注册或移除客户端更新和日志清理任务。
 * @returns {null} 无业务返回值，原子更新 crontab。
 */
function cron(sections, enabled) {
    let path = '/etc/crontabs/root';
    let entries = cronEntries(path, 'hijpass');
	if (enabled) {
		let schedule = first(sections, 'rule').update_schedule;
		if (schedule) {
			if (!match(schedule, /^[A-Za-z0-9*\/,? -]+$/) || length(split(trim(schedule) || '', /[ \t]+/)) != 5) {
				die('invalid update schedule');
			}
			push(entries, `${schedule} /usr/lib/hijpass/rules/update.sh update`);
		}
		if (length(filter(sections, section => !!logPath(section)))) {
			push(entries, '*/10 * * * * /usr/lib/hijpass/maintenance/logs.sh hijpass');
		}
	}
	atomic(path, join('\n', entries) + '\n');
}
// 服务端配置为用户编辑的原生 JSON，保留原文件；这里只声明进程与开放端口。
// ServerPlan 使用相同的 Instance 字段；ports 为显式 allow_firewall 的监听端口数组。
/**
 * 整理服务端节点的启动计划和需开放的端口。
 * @param {object[]} sections
 * @returns {ServicePlan} {instances, ports}；禁用时两个数组均为空。
 */
export function serverPlan(sections) {
	let global = first(sections, 'hijserver'), instances = [], ports = [];
	if (global.enabled != '1') {
		return { instances, ports };
	}
	for (let section in of(sections, 'server_node')) {
		if (section.enabled != '1') {
			continue;
		}
		let name = section.name || section['.name'];
		if (!section.command) {
			die(`server "${name}" has no command`);
		}
		let env = list(section.procd_env), path = nodeConfig(section, true);
		for (let entry in env) {
			if (!match(entry, /^[A-Za-z_][A-Za-z0-9_]*=/)) {
				die('invalid procd_env');
			}
		}
		push(instances, {
			id: section['.name'], name, command: ['/bin/sh', '-c', replace(section.command, '{conf_path}', command([path]))],
			env, user: 'root', shunt: false, log: logPath(section, true),
		});
		if (section.allow_firewall == '1') {
			push(ports, port(section.listen_port));
		}
	}
	return { instances, ports: uniq(ports) };
};
const SERVER_TABLE = '/usr/share/nftables.d/table-post/hijserver.nft';
const SERVER_CHAIN = '/usr/share/nftables.d/chain-pre/input_wan/hijserver.nft';
/**
 * 按服务端日志开关注册或移除日志清理任务。
 * @returns {null} 无业务返回值，更新 crontab 并保留其他服务任务。
 */
function serverCron(instances) {
	let path = '/etc/crontabs/root';
    let entries = cronEntries(path, 'hijserver');
	if (length(filter(instances, instance => instance.log))) {
		push(entries, '*/10 * * * * /usr/lib/hijpass/maintenance/logs.sh hijserver');
	}
	atomic(path, join('\n', entries) + '\n');
}
/**
 * 生成服务端端口放行规则，没有端口时删除旧规则文件。
 * @returns {null} 无业务返回值，只更新 nft include 文件。
 */
function writeServerRules(sections) {
	let output = serverPlan(sections);
	// 只开放明确选中的端口；没有端口时删除旧 include，避免旧服务端仍对 WAN 开放。
	if (length(output.ports)) {
		atomic(SERVER_TABLE, renderTemplate('/usr/lib/hijpass/service/server.ut', { ports: output.ports }), 0o644);
		atomic(SERVER_CHAIN, 'jump hijserver comment "hijserver rule"\n', 0o644);
	}
	else {
		fs.unlink(SERVER_TABLE);
		fs.unlink(SERVER_CHAIN);
	}
};

// ServiceSettings 是执行层需要的业务值；不包含可执行的通用动作列表。
// enabled 控制启停，geo_convert 控制 Geo 准备，dns_hook 是后端固定的 Hook 位置，
// update_interval 为自动更新间隔天数，log_paths 为需要准备目录的日志位置。
/**
 * 为 Shell 执行脚本整理服务开关和维护参数。
 * @param {object[]} config
 * @param {boolean} server
 * @returns {object} 含 enabled、dns_hook、geo_convert、update_interval（天）及 log_paths 的对象。
 */
function settings(config, server) {
    let global = first(config, server ? 'hijserver' : 'hijpass'), shunt = first(config, 'shunt');
    return { enabled: global.enabled == '1', dns_hook: server ? '' : FILES.dns_hook,
        geo_convert: !server && shunt.enabled != '0' && core(shunt.type) == CORE.singbox && shunt.ruleset_convert == '1',
        update_interval: int(first(config, 'rule').update_interval || '0'),
        log_paths: filter(map(config, item => logPath(item, server)), path => !!path) };
};
/**
 * 为服务启停准备配置、进程参数和定时任务。
 * @returns {null} 查询结果写入 stdout；写入类动作直接更新对应文件。
 */
export function main() { run(() => {
    let server = ARGV[0] == 'server';
    if (server) {
        shift(ARGV);
    }
    let config = sections(server ? 'hijserver' : 'hijpass'), action = shift(ARGV);
    if (action == 'settings') {
        return settings(config, server);
    }
    if (action == 'delay') {
        return `${int(first(config, 'hijpass').delay_time || '0')}\n`;
    }
    if (action == 'configs') {
        if (first(config, 'hijpass').enabled == '1') {
            // 先生成进程描述，确认自定义命令、环境变量和文件名有效，再替换配置。
            plan(config);
            logger(config)('INFO', 'Preparing proxy configurations');
            writeConfigs(config, renderCore(config));
        }
        return;
    }
    if (action == 'plan') {
        return server ? serverPlan(config) : plan(config);
    }
    if (action == 'prepare') {
        if (server) {
            return serverPlan(config);
        }
        let result = plan(config);
        if (first(config, 'hijpass').enabled == '1') {
            let dns = prepareDNS(config);
            if (dns) {
                push(result.instances, dns);
            }
        }
        return result;
    }
    if (action == 'cron') {
        if (server) {
            return serverCron(ARGV[0] == 'enable' ? serverPlan(config).instances : []);
        }
        return cron(config, ARGV[0] == 'enable');
    }
    if (action == 'server-files') {
        return writeServerRules(config);
    }
    die('unknown service data action');
});
};
