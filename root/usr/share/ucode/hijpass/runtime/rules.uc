import * as fs from 'fs';
import { first, of, list } from '../uci/config.uc';
import { exec, checked, lines, atomic, temporary, mkdir } from './system.uc';
import { contains } from './network.uc';
import { parse } from '../generator/rules.uc';

// RuleSource：key 为 UCI 下载地址字段，path 为目标文件，kind 为 domain/ip4/ip6/geo。
// 同类多个 URL 分别下载后合并去重；至少一个完整、有效来源成功后才替换旧文件。
function sources(sections) {
	let g = first(sections, 'hijpass');
	return {
		gfw_list: { path: g.gfw_list, kind: 'domain' }, chn_domain_list: { path: g.chn_list, kind: 'domain' },
		chn_v4_route: { path: g.chn_route, kind: 'ip4' }, chn_v6_route: { path: g.chn_route6, kind: 'ip6' },
		geoip: { path: '/usr/share/v2ray/geoip.dat', kind: 'geo' }, geosite: { path: '/usr/share/v2ray/geosite.dat', kind: 'geo' },
	};
}
export function domain(line) {
	line = lc(trim(line));
	if (!line || substr(line, 0, 1) == '#' || substr(line, 0, 1) == '!') return null;
	let m = match(line, /^server=\/([^/]+)\//);
	if (m) line = m[1];
	else if (substr(line, 0, 2) == '+.') line = substr(line, 2);
	else if (substr(line, 0, 4) == '@@||') line = split(substr(line, 4), '^')[0];
	else line = replace(line, /^(domain|full):/, '');
	return match(line, /^[a-z0-9.-]+[.][a-z]{2,}$/) ? line : null;
};
export function normalize(text, kind) {
	let result = [];
	for (let line in lines(text)) {
		if (kind == 'domain') { let value = domain(line); if (value) push(result, value); }
		else {
			let parts = split(line, '/'), bytes = iptoarr(parts[0]);
			if (bytes && length(bytes) == (kind == 'ip4' ? 4 : 16) && (parts[1] == null || match(parts[1], /^[0-9]+$/) && int(parts[1]) <= length(bytes) * 8)) push(result, line);
		}
	}
	return sort(uniq(result));
};
function download(url, path, timeout) {
	if (!match(url || '', /^https?:\/\//)) die(`invalid download URL: ${url}`);
	return !exec(['curl', '-f', '-sS', '-L', '--connect-timeout', `${timeout}`, '--max-time', `${timeout * 2}`, '-o', path, '--', url]).code;
}
export function update(sections, action) {
	let settings = first(sections, 'rule'), catalog = sources(sections);
	let groups = { chnlist: ['chn_domain_list'], gfw: ['gfw_list'], chnroute: ['chn_v4_route', 'chn_v6_route'], geo: ['geoip', 'geosite'] };
	let selected = groups[action] || (action == 'all' || action == 'update' ? keys(catalog) : null);
	if (!selected) die('unknown rule action');
	let timeout = int(settings.download_timeout || '30'), retries = int(settings.retry_count || '3');
	if (timeout < 1 || timeout > 600 || retries < 1 || retries > 10) die('invalid download timeout or retry count');
	let failed = [];
	for (let key in selected) {
		let source = catalog[key], urls = list(settings[key]), temp;
		try {
			if (!source.path || !length(urls)) die(`${key} path or URLs not configured`);
			mkdir(fs.dirname(source.path));
			temp = temporary(source.path);
			let merged = [], binary = null;
			for (let url in urls) {
				let downloaded = false;
				for (let attempt = 0; attempt < retries; attempt++) {
					if (download(url, temp, timeout) && fs.stat(temp)?.size > 100) { downloaded = true; break; }
					if (attempt + 1 < retries) sleep(2000);
				}
				if (!downloaded) continue;
				if (source.kind == 'geo') {
					// 验证 protobuf 数据库而非只检查大小；错误页不会覆盖现有 Geo 文件。
					if (!exec(['geoview', '-type', key, '-action', 'lookup', '-input', temp, '-value', key == 'geoip' ? '1.1.1.1' : 'example.org'], true).code) { binary = true; break; }
				}
				else push(merged, ...normalize(fs.readfile(temp), source.kind));
			}
			if (source.kind == 'geo' ? binary == null : !length(merged)) die(`${key}: no valid download`);
			// Geo 数据库通常很大；验证后同目录 rename，避免把整份二进制载入 ucode 内存。
			if (source.kind == 'geo') {
				if (!fs.chmod(temp, 0o644) || !fs.rename(temp, source.path)) die(`cannot replace ${source.path}`);
			}
			else atomic(source.path, join('\n', sort(uniq(merged))) + '\n', 0o644);
		}
		catch (e) { push(failed, key); warn(`${e.message}\n`); }
		if (temp) fs.unlink(temp);
	}
	if (action == 'update' && first(sections, 'hijpass').enabled == '1') {
		if (exec(['/etc/init.d/hijpass', 'restart']).code) push(failed, 'restart');
	}
	return { success: !length(failed), ...(length(failed) ? { failed } : {}) };
};
export function geo(action, kind, args, sections) {
	if (action == '-t' || action == '--convert') {
		mkdir('/etc/hijpass/ruleset');
		// 直接编辑 /etc/config 也能启动：标签来自启用的规则，不依赖前端写回缓存字段。
		let tags = { geoip: [], geosite: [] };
		for (let rule in of(sections, 'shunt_route_rule')) if (rule.enabled == '1') {
			let match = parse(rule);
			push(tags.geoip, ...map(match.geoip, value => substr(value, 6)));
			push(tags.geosite, ...map(match.geosite, value => substr(value, 8)));
		}
		for (let type in ['geoip', 'geosite']) for (let tag in uniq(tags[type])) {
			if (!match(tag, /^[A-Za-z0-9_.:@!-]+$/)) die('invalid Geo tag');
			checked(['geoview', '-type', type, '-action', 'convert', '-format', 'ruleset', '-input', `/usr/share/v2ray/${type}.dat`, '-regex', '-list', tag, '-output', `/etc/hijpass/ruleset/${type}-${tag}.srs`]);
		}
		return '';
	}
	if (index(['geoip', 'geosite'], kind) < 0 || !length(args)) die('invalid geo type or argument');
	for (let arg in args) if (!match(arg, /^[A-Za-z0-9_.:@,\/!-]+$/)) die('invalid Geo argument');
	let extract = action == '-e' || action == '--extract';
	if (!extract && action != '-l' && action != '--lookup') die('unknown Geo action');
	return lc(checked(['geoview', '-type', kind, '-action', extract ? 'extract' : 'lookup', '-input', `/usr/share/v2ray/${kind}.dat`, extract ? '-list' : '-value', ...args]));
};
function suffix(host, rule) { return host == rule || substr(host, -length(rule) - 1) == '.' + rule; }
export function queryFiles(target) {
	if (!match(target || '', /^[A-Za-z0-9._:\/-]{1,255}$/)) die('invalid query');
	let ip = iptoarr(target), matched = [];
	for (let path in fs.glob('/etc/hijpass/rules/*') || []) {
		if (fs.stat(path)?.type != 'file') continue;
		let name = fs.basename(path);
		if (ip ? !match(name, /^(chn-route|ip)/) : !match(name, /(list[.]txt$|^domain)/)) continue;
		if (length(filter(lines(fs.readfile(path)), line => ip ? contains(target, line) : suffix(lc(target), lc(line))))) push(matched, name);
	}
	return join('\n', sort(uniq(matched))) + '\n';
};
export function routeMatch(sections, target) {
	if (!match(target || '', /^[A-Za-z0-9._:\/-]{1,255}$/)) die('invalid query');
	let ip = !!iptoarr(target), tags = null;
	for (let rule in of(sections, 'shunt_route_rule')) {
		if (rule.enabled != '1') continue;
		for (let line in lines(rule[ip ? 'ip_list' : 'domain_list'])) {
			if (substr(line, 0, 9) == 'rule-set:') continue;
			let matched = false, kind = ip ? 'geoip' : 'geosite';
			if (substr(line, 0, length(kind) + 1) == kind + ':') {
				if (tags == null) tags = split(trim(geo('-l', kind, [target])), /[ \t\n]+/);
				matched = index(tags, substr(line, length(kind) + 1)) >= 0;
			}
			else if (ip) matched = contains(target, line);
			else if (substr(line, 0, 5) == 'full:') matched = lc(target) == lc(substr(line, 5));
			else if (substr(line, 0, 7) == 'domain:') matched = suffix(lc(target), lc(substr(line, 7)));
			else if (substr(line, 0, 7) == 'regexp:') matched = !!match(target, regexp(substr(line, 7), 'i'));
			else matched = index(lc(target), lc(line)) >= 0;
			if (matched) return `规则名称 (Name) : ${rule.name || 'Unnamed'}\n匹配类型 (Type) : ${ip ? 'IP' : '域名'}\n匹配内容 (Item) : ${line}\n代理策略 (Node) : ${rule.proxy_node || 'default'}\n`;
		}
	}
	return `未匹配到任何自定义规则，除去协议、端口等规则外，将使用全局默认策略\n\n规则名称 (Name) : 全局默认\n匹配类型 (Type) : ${ip ? 'IP' : '域名'}\n匹配内容 (Item) : * (全部)\n代理策略 (Node) : ${first(sections, 'shunt').default_proxy_node || ''}\n`;
};
