import * as fs from 'fs';
import { read, first, port } from '../uci/config.uc';
import { geo, domain } from './rules.uc';
import { lines, atomic } from './system.uc';

// ChinadnsOptions：direct_dns/proxy_dns 为上游（custom/system/dnsmasq/地址），
// cdg_port 为监听端口，use_chn/use_gfw 决定域名列表及默认 tag。
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
	if (length(tags)) push(result, ...lines(geo('-e', 'geosite', [join(',', tags)])));
	atomic(output, join('\n', uniq(result)) + '\n', 0o644);
}
/**
 * @param {object[]} sections
 */
export function prepare(sections) {
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
	let direct = upstream('direct_dns'), proxy = upstream('proxy_dns'), config = [];
	domains(global.domain_proxy, '/tmp/hijpass/domain-proxy.txt');
	domains(global.domain_direct, '/tmp/hijpass/domain-direct.txt');
	push(config, 'bind-addr ::', `bind-port ${port(dns.cdg_port)}`, `china-dns ${direct}`, `trust-dns ${proxy}`);
	if (dns.use_chn == '1') push(config, `chnlist-file ${global.chn_list}`);
	if (dns.use_gfw == '1') push(config, `gfwlist-file ${global.gfw_list}`);
	if (dns.use_chn == '1' && dns.use_gfw != '1') push(config, 'default-tag gfw');
	if (dns.use_gfw == '1' && dns.use_chn != '1') push(config, 'default-tag chn');
	push(config,
		'group userdirect', 'group-dnl /tmp/hijpass/domain-direct.txt', `group-upstream ${direct}`,
		'group-ipset inet@hijpass@dnsbypass4list,inet@hijpass@dnsbypass6list',
		'group userproxy', 'group-dnl /tmp/hijpass/domain-proxy.txt', `group-upstream ${proxy}`,
		'group-ipset inet@hijpass@dnsproxy4list,inet@hijpass@dnsproxy6list',
		'add-tagchn-ip inet@hijpass@chn4list,inet@hijpass@chn6list', 'add-taggfw-ip inet@hijpass@gfw4list,inet@hijpass@gfw6list',
		'ipset-name4 inet@hijpass@chnroute4list', 'ipset-name6 inet@hijpass@chnroute6list', 'verdict-cache 4096');
	atomic('/etc/hijpass/chinadns-ng.conf', join('\n', config) + '\n', 0o644);
	return { id: dns['.name'], name: 'chinadns-ng', command: ['chinadns-ng', '-C', '/etc/hijpass/chinadns-ng.conf'], env: [], user: 'hijpass' };
};
