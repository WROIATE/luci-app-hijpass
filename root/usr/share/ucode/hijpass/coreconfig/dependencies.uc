import { of } from '../config/sections.uc';
import { list } from '../config/values.uc';
import { proxy, TYPE, CONFIG_TYPE } from '../config/protocol/proxy.uc';

// ResolvedDependencies：nodes 为按发现顺序排列的节点，byID/byName 为查找索引。
// 每个节点的 upstream/members 直接引用其依赖节点，供核心配置生成使用。
// 解析、连接引用、校验分别执行，查询过程没有隐藏的配置校验副作用。
/**
 * @param {object[]} sections
 * @param {string} [target]
 * @returns {object} 依赖结果 {nodes, byID, byName}；包含目标及依赖，索引与 upstream/members 直接引用同一节点对象。
 */
export function resolve(sections, target) {
	let all = of(sections, 'proxy_node'), enabled = {}, selected = [];
	for (let s in all) {
		if (s.enabled == '1') {
			let name = s.name || s['.name'];
			enabled[name] ||= [];
			push(enabled[name], s);
		}
		if (target && target != 'shunt' ? s['.name'] == target : s.enabled == '1') push(selected, s);
	}
	if (target && target != 'shunt' && !length(selected)) die('node not found');
	let nodes = [], byID = {}, byName = {}, references = {};
	// 按批次展开依赖，保持发现顺序；每个 ID 只展开一次，循环有界。
	let pending = selected;
	while (length(pending)) {
		let next = [];
		for (let s in pending) {
			let id = s['.name'], name = s.name || id;
			if (byID[id]) continue;
			if (length(filter(enabled[name] || [], other => other['.name'] != id))) die(`duplicate proxy name "${name}"`);
			let n;
			try { n = proxy(s); }
			catch (e) { die(`node "${name}": ${e.message}`); }
			byID[id] = n;
			byName[name] = n;
			push(nodes, n);
			let dependencies = [];
			references[id] = dependencies;
			// 自定义命令自行管理出站；忽略切换核心后残留的协议依赖字段。
			if (n.config_type == CONFIG_TYPE.custom) continue;
			if (n.type == TYPE.balance && s.upstream_proxy_node) die(`load balancing node cannot have an upstream: ${name}`);
			let refs = n.type == TYPE.balance ? list(s.member_node) : s.upstream_proxy_node ? [s.upstream_proxy_node] : [];
			for (let ref in refs) {
				let matches = enabled[ref] || [];
				if (!length(matches)) die(`proxy node "${ref}" missing or disabled`);
				if (length(matches) > 1) die(`duplicate proxy name "${ref}"`);
				push(dependencies, matches[0]['.name']);
				push(next, matches[0]);
			}
		}
		pending = next;
	}
	for (let n in nodes) {
		let refs = [];
		for (let id in references[n.id]) push(refs, byID[id]);
		if (n.type == TYPE.balance) n.members = refs;
		else n.upstream = refs[0];
	}
	return { nodes, byID, byName };
};

/**
 * @param {{nodes: object[]}} dependencies
 * @returns {null} 校验通过不返回数据；循环、超过三节点或均衡成员/回退配置无效时抛错。
 */
export function validate(dependencies) {
	let active = {}, heights = {};
	/** @returns {integer} 当前普通节点到末端上游的链长（含自身）；均衡节点返回 1，成员单独校验，链长会缓存。 */
	function visit(n) {
		if (active[n.id]) die(`proxy dependency cycle at "${n.name}"`);
		if (heights[n.id]) return heights[n.id];
		active[n.id] = true;
		let height = 1;
		if (n.type == TYPE.balance) {
			if (!length(n.members)) die(`load balancing node "${n.name}" has no members`);
			let unique = {};
			for (let m in n.members) {
				if (unique[m.name]) die(`duplicate load balancing member "${m.name}"`);
				if (m.type == TYPE.balance) die(`nested load balancing member "${m.name}"`);
				unique[m.name] = true;
				visit(m);
			}
			if (n.fallback_tag && !unique[n.fallback_tag]) die(`fallback "${n.fallback_tag}" is not a load balancing member`);
		}
		else if (n.upstream) height += visit(n.upstream);
		if (height > 3) die(`proxy chain exceeds three nodes at "${n.name}"`);
		delete active[n.id];
		heights[n.id] = height;
		return height;
	}
	for (let n in dependencies.nodes) visit(n);
};
