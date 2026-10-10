import * as fs from 'fs';
import { read, first } from '../uci/config.uc';
import * as network from '../runtime/network.uc';
import * as firewall from '../runtime/firewall.uc';
import * as rules from '../runtime/rules.uc';
import * as service from '../runtime/service.uc';
import * as files from '../runtime/files.uc';
import { prepare as prepareDNS } from '../runtime/dns.uc';
import { run as coreUpdate } from '../runtime/update.uc';
import { exec } from '../runtime/system.uc';

// 每个可执行 .uc 只指定自己的工具名；参数校验、错误协议和功能分派集中在这里。
// --configdir 可对独立 UCI 目录离线运行，默认直接使用系统 /etc/config。
/**
 * @param {string} tool 工具名。
 * @param {string[]} args 命令行参数；由解释器 ARGV 提供。
 */
export function main(tool, args) {
	let directory, sections;
	function config(packageName) { return read(packageName || 'hijpass', directory); }
	let result, jsonOutput = index(['net', 'connect', 'core-update'], tool) >= 0 || tool == 'rules' && args[0] == 'update';
	try {
		// 参数错误也交给下面的命令错误边界处理，保持 JSON 工具的返回格式。
		let position = index(args, '--configdir');
		if (position != null && position >= 0) {
			directory = args[position + 1];
			if (!directory) die('missing --configdir');
			splice(args, position, 2);
		}
		switch (tool) {
		case 'net':
			if (args[0] == 'resolve') result = { address: network.resolve(args[1]) };
			else if (args[0] == 'port') result = network.ports(slice(args, 1));
			else if (args[0] == 'ping') result = network.ping(args[1], args[2]);
			else die('unknown network action');
			break;
		case 'connect': result = network.connect(args[0], args[1]); break;
		case 'iptype':
			let bytes = iptoarr(split(args[0] || '', '/')[0] || '');
			if (!bytes) exit(1);
			result = `${length(bytes) == 4 ? 4 : 6}\n`; break;
		case 'core-update': result = coreUpdate(args[0], args[1]); break;
		case 'route': firewall.route(args[0]); break;
		case 'nft':
			if (args[0] == 'show') {
				result = exec(['nft', 'list', 'table', 'inet', 'hijpass'], true).stdout;
			}
			else if (args[0] == 'remove') firewall.remove();
			else if (args[0] == 'reset') firewall.reset(config());
			else die('unknown firewall action');
			break;
		case 'fw4': firewall.apply(config()); break;
		case 'gen-nft':
			sections = config();
			result = firewall.generate(sections, firewall.networkState(sections), fs.readfile(first(sections, 'hijpass').nft || '/etc/hijpass/fw4-template.nft'));
			break;
		case 'rules':
			if (args[0] == 'query') result = rules.queryFiles(args[1]);
			else result = rules.update(config(), args[0]);
			break;
		case 'geo': result = rules.update(config(), 'geo'); break;
		case 'geoview': result = rules.geo(args[0], args[1], slice(args, 2), args[0] == '-t' || args[0] == '--convert' ? config() : null); break;
		case 'route-match': result = rules.routeMatch(config(), args[0]); break;
		case 'chinadns-ng': prepareDNS(config()); break;
		case 'auto-update-rules': service.autoUpdate(config()); break;
		case 'rm': files.cleanup(config(args[0] == 'server' ? 'hijserver' : 'hijpass'), args[0], args[1], args[2]); break;
		case 'clean-service-log':
			sections = args[0] == 'clean' ? [] : config(args[0] == 'hijserver' ? 'hijserver' : 'hijpass');
			files.cleanLogs(sections, args[0], args[1]); break;
		case 'app-logger': files.logger(config())(args[0], join(' ', slice(args, 1))); break;
		case 'service':
			let server = args[0] == 'server';
			if (server) shift(args);
			sections = config(server ? 'hijserver' : 'hijpass');
			if (server) {
				if (args[0] == 'prepare' || args[0] == 'plan') { result = args[0] == 'plan' ? service.serverPlan(sections) : service.serverPrepare(sections); jsonOutput = true; }
				else if (args[0] == 'activate') service.serverActivate(sections);
				else if (args[0] == 'deactivate') service.serverDeactivate();
				else die('unknown server service action');
				break;
			}
			if (args[0] == 'prepare' || args[0] == 'plan') { result = args[0] == 'plan' ? service.plan(sections) : service.prepare(sections); jsonOutput = true; }
			else if (args[0] == 'activate') service.activate(sections);
			else if (args[0] == 'deactivate') service.deactivate(sections);
			else if (args[0] == 'delay') result = `${int(first(sections, 'hijpass').delay_time || '0')}\n`;
			else die('unknown service action');
			break;
		default: die(`unknown tool ${tool}`);
		}
		if (result != null) {
			if (jsonOutput || type(result) == 'object') printf('%J\n', result);
			else print(result);
			// 文本工具没有 success 字段；ucode 不允许读取字符串的对象属性。
			if (type(result) == 'object' && result.success === false) exit(result.exit_code || 1);
		}
	}
	catch (e) {
		if (jsonOutput) printf('%J\n', { success: false, error: e.message });
		else warn(`${e.message}\n`);
		exit(1);
	}
};
