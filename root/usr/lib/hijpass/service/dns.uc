import * as fs from 'fs';
import { sections as read } from 'hijpass.common';
import { first } from 'hijpass.config.sections';
import { port } from 'hijpass.config.values';
import { domain } from '../rules/rules.uc';
import { lines, atomic, renderTemplate } from 'hijpass.common';

// ChinadnsOptions：listenPort 为监听端口，direct/proxy 为解析后的上游地址，
// useChn/useGfw 为列表开关，chnList/gfwList 为对应列表路径。
// 自定义域名文件可以包含 geosite: 标签，启动时提取为 chinadns 的纯域名文件。
/**
 * @param {string} path
 * @param {string} output
 */
function domains(path, output) {
	let result = [], tags = [];
	for (let line in lines(fs.readfile(path))) {
		if (substr(line, 0, 8) == 'geosite:') push(tags, substr(line, 8));
		else { let value = domain(line); if (value) push(result, value); }
	}
	// Geo 提取由 Shell 完成；此处只合并提取结果与用户域名。
	if (length(tags)) push(result, ...map(lines(fs.readfile(replace(output, /[.]txt$/, '-geo.txt'))), lc));
	atomic(output, join('\n', uniq(result)) + '\n', 0o644);
}
/**
 * @param {object[]} sections
 */
export function options(sections) {
	let dns = first(sections, 'dns'), global = first(sections, 'hijpass');
	if (dns.dns_service != 'chinadns-ng') return null;
	function upstream(key) {
		let value = dns[key];
		if (value == 'custom') value = dns[`${key}_custom`];
		if (value == 'system' || value == 'dnsmasq') {
			value = `127.0.0.1#${first(read('dhcp'), 'dnsmasq').port || '53'}`;
		}
		if (!value || match(value, /[\r\n]/)) die(`invalid ${key}`);
		return value;
	}
	return {
		listenPort: port(dns.cdg_port), direct: upstream('direct_dns'), proxy: upstream('proxy_dns'),
		useChn: dns.use_chn == '1', useGfw: dns.use_gfw == '1',
		chnList: global.chn_list, gfwList: global.gfw_list,
	};
};
/**
 * @param {object[]} sections
 */
export function prepare(sections) {
	let settings = options(sections);
	if (!settings) return null;
	let dns = first(sections, 'dns'), global = first(sections, 'hijpass');
	domains(global.domain_proxy, '/tmp/hijpass/domain-proxy.txt');
	domains(global.domain_direct, '/tmp/hijpass/domain-direct.txt');
	atomic('/etc/hijpass/chinadns-ng.conf', renderTemplate('/usr/lib/hijpass/service/chinadns.ut', { options: settings }), 0o644);
	return { id: dns['.name'], name: 'chinadns-ng', command: ['chinadns-ng', '-C', '/etc/hijpass/chinadns-ng.conf'], env: [], user: 'hijpass' };
};
