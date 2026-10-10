import * as uci from '../uci/config.uc';
import { resolve, validateGraph, validatePorts } from './graph.uc';
import { CORE } from './constants.uc';
import { build as singbox } from './singbox/config.uc';
import { build as xray } from './xray/config.uc';
import { prepare as prepareRouting, build as buildRouting } from './routing.uc';

// Generated：nodes 为 section ID -> 核心 JSON 对象；shunt 只在模板分流开启时出现。
// render 是纯转换：不写 UCI/文件，不启动进程，失败时不会返回半份配置。
export function render(sections, target) {
	uci.validate(sections);
	let graph = resolve(sections, target);
	validateGraph(graph);
	let shunt = uci.first(sections, 'shunt'), routing = null;
	if (target == 'shunt' || !target && shunt.enabled != '0' && shunt.config_type == 'tmpl')
		routing = prepareRouting(sections, graph);
	validatePorts(graph.nodes, routing);
	let result = { nodes: {} };
	for (let n in graph.nodes) {
		if (n.core == CORE.custom || n.type == 'custom') continue;
		try { result.nodes[n.id] = n.core == CORE.xray ? xray(n) : singbox(n); }
		catch (e) { die(`node "${n.name}": ${e.message}`); }
	}
	if (routing) result.shunt = buildRouting(routing, graph);
	if (!target) return result;
	if (target == 'shunt') return result.shunt;
	if (!result.nodes[target]) die('custom node configuration is not generated');
	return result.nodes[target];
};
export function validate(sections) {
	// 服务关闭时允许保存未完成表单，但输入的 UCI 结构仍必须有效。
	if (uci.first(sections, 'hijpass').enabled == '0') uci.validate(sections);
	else render(sections);
	return { ok: true };
};
