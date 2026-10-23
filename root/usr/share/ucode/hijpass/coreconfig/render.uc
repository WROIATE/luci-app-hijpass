import { first, validateSections } from '../config/sections.uc';
import { CORE, CONFIG_TYPE } from '../config/protocol/proxy.uc';
import { resolve as resolveDependencies, validate as validateDependencies } from './dependencies.uc';
import { clean } from './json.uc';
import { build as singbox } from './singbox/config.uc';
import { build as xray } from './xray/config.uc';
import { prepare as prepareRouting, build as buildRouting } from './routing.uc';

// 配置生成前统一检查节点和分流监听端口，避免多个入口绑定同一端口。
/**
 * @param {object[]} nodes
 * @param {object|null} shunt
 * @returns {null} 校验节点及分流监听端口是否重复；通过时不修改节点，重复时抛错。
 */
function validatePorts(nodes, shunt) {
	let owners = {};
	/** @returns {null} 登记当前端口的占用者；端口已被登记时抛错。 */
	function add(port, owner) {
		if (owners[port]) die(`port ${port} is shared by ${owners[port]} and ${owner}`);
		owners[port] = owner;
	}
	for (let n in nodes) {
		add(n.listen_port, `${n.name}.listen_port`);
		add(n.socks_port, `${n.name}.socks_port`);
	}
	if (shunt) {
		add(shunt.listen, 'shunt.shunt_listen_port');
		add(shunt.dnsPort, 'shunt.dns_listen_port');
	}
};

// Generated：nodes 为 section ID -> 核心 JSON 对象；shunt 只在模板分流开启时出现。
// render 是纯转换：不写 UCI/文件，不启动进程，失败时不会返回半份配置。
/**
 * 返回：未指定 target 时为 {nodes, shunt?} 对象，nodes 按 section ID 索引；指定节点 ID 或 shunt 时为对应的核心 JSON 对象。
 * @param {object[]} sections
 * @param {string} [target]
 */
export function render(sections, target) {
	validateSections(sections);
	let dependencies = resolveDependencies(sections, target);
	validateDependencies(dependencies);
	let shunt = first(sections, 'shunt'), routing = null;
	if (target == 'shunt' || !target && shunt.enabled != '0' && shunt.config_type == 'tmpl')
		routing = prepareRouting(sections, dependencies);
	validatePorts(dependencies.nodes, routing);
	let result = { nodes: {} };
	for (let n in dependencies.nodes) {
		if (n.config_type == CONFIG_TYPE.custom) continue;
		try { result.nodes[n.id] = clean(n.core == CORE.xray ? xray(n) : singbox(n)); }
		catch (e) { die(`node "${n.name}": ${e.message}`); }
	}
	if (routing) result.shunt = clean(buildRouting(routing, dependencies));
	if (!target) return result;
	if (target == 'shunt') return result.shunt;
	if (!result.nodes[target]) die('custom node configuration is not generated');
	return result.nodes[target];
};
/**
 * @param {object[]} sections
 * @returns {object} 成功返回 {ok: true}；服务禁用时只校验快照结构，启用时也验证完整配置生成。
 */
export function validate(sections) {
	// 服务关闭时允许保存未完成表单，但输入的 UCI 结构仍必须有效。
	if (first(sections, 'hijpass').enabled == '0') validateSections(sections);
	else render(sections);
	return { ok: true };
};
