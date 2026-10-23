import { of } from '../config/sections.uc';
import { list } from '../config/values.uc';
import { proxy, TYPE, CONFIG_TYPE } from '../config/protocol/proxy.uc';

// ResolvedDependencies：nodes 为按发现顺序排列的节点，byID/byName 为查找索引。
// 每个节点的 upstream/members 直接引用其依赖节点，供核心配置生成使用。
// 解析、连接引用、校验分别执行，查询过程没有隐藏的配置校验副作用。
/**
 * 收集目标节点及其依赖，并连接上游和均衡成员。
 * @param {object[]} sections
 * @param {string} [target] 节点 section ID；shunt 或未指定时解析全部启用节点。
 * @returns {object} {nodes, byID, byName}，索引和依赖直接引用节点对象。
 */
export function resolve(sections, target) {
	let proxySections = of(sections, 'proxy_node');
	let enabledProxySectionsByName = {};
	let rootProxySections = [];
	for (let section in proxySections) {
		if (section.enabled == '1') {
			let name = section.name || section['.name'];
			enabledProxySectionsByName[name] ||= [];
			push(enabledProxySectionsByName[name], section);
		}
		// 单节点生成从目标开始；全量生成和分流预览从全部启用节点开始。
		if (target && target != 'shunt' ? section['.name'] == target : section.enabled == '1')
			push(rootProxySections, section);
	}
	if (target && target != 'shunt' && !length(rootProxySections)) die('node not found');
	let nodes = [], byID = {}, byName = {}, dependencyIDsByNodeID = {};
	// 按批次展开依赖，保持发现顺序；每个 ID 只展开一次，循环有界。
	let pendingProxySections = rootProxySections;
	while (length(pendingProxySections)) {
		let nextProxySections = [];
		for (let section in pendingProxySections) {
			let id = section['.name'], name = section.name || id;
			if (byID[id]) continue;
			if (length(filter(enabledProxySectionsByName[name] || [], other => other['.name'] != id)))
				die(`duplicate proxy name "${name}"`);
			let node;
			try { node = proxy(section); }
			catch (e) { die(`node "${name}": ${e.message}`); }
			byID[id] = node;
			byName[name] = node;
			push(nodes, node);
			let dependencyIDs = [];
			dependencyIDsByNodeID[id] = dependencyIDs;
			// 自定义命令自行管理出站；忽略切换核心后残留的协议依赖字段。
			if (node.config_type == CONFIG_TYPE.custom) continue;
			if (node.type == TYPE.balance && section.upstream_proxy_node)
				die(`load balancing node cannot have an upstream: ${name}`);
			let dependencyNames = node.type == TYPE.balance
				? list(section.member_node)
				: section.upstream_proxy_node ? [section.upstream_proxy_node] : [];
			for (let dependencyName in dependencyNames) {
				let matchingSections = enabledProxySectionsByName[dependencyName] || [];
				if (!length(matchingSections)) die(`proxy node "${dependencyName}" missing or disabled`);
				if (length(matchingSections) > 1) die(`duplicate proxy name "${dependencyName}"`);
				push(dependencyIDs, matchingSections[0]['.name']);
				push(nextProxySections, matchingSections[0]);
			}
		}
		pendingProxySections = nextProxySections;
	}
	for (let node in nodes) {
		let dependencyNodes = [];
		for (let id in dependencyIDsByNodeID[node.id]) push(dependencyNodes, byID[id]);
		if (node.type == TYPE.balance) node.members = dependencyNodes;
		else node.upstream = dependencyNodes[0];
	}
	return { nodes, byID, byName };
};

/**
 * 检查代理链的循环、长度和负载均衡成员设置。
 * @param {{nodes: object[]}} dependencies
 * @returns {null} 无业务返回值；依赖无效时抛错。
 */
export function validate(dependencies) {
	let active = {}, heights = {};
	/**
	 * 递归检查节点依赖，并计算和缓存代理链长度。
	 * @returns {integer} 含自身的链长；均衡节点为 1，其成员分别检查。
	 */
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
