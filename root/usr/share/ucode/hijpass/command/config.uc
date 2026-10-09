import * as fs from 'fs';
import { read } from '../uci/config.uc';
import { render, validate } from '../generator/render.uc';

// RPC Request：sections 为可选的 JSON 快照字符串，target 为可选 section ID。
// 未给 sections 时直接读取 /etc/config/hijpass，支持脱离 LuCI 的命令行运行。
// RPC Response：render 返回 {nodes, shunt?} 或 {config}；validate 返回 {ok:true}；
// 错误统一为 {error}，供 LuCI 展示；CLI 错误输出到 stderr 并返回非零状态。
function stdinJSON() {
	let data = fs.stdin.read('all');
	if (length(data) > 4 * 1024 * 1024) die('input exceeds 4 MiB');
	return json(data);
}
export function main(args) {
	if (args[0] == 'list') {
		printf('%J\n', { render: { sections: '', target: '' }, validate: { sections: '' } });
		return;
	}
	let rpc = args[0] == 'call';
	try {
		let method = rpc ? args[1] : args[0];
		if (method != 'render' && method != 'validate') die(`unknown ${rpc ? 'method' : 'command'} "${method}"`);
		let sections, target = '';
		if (rpc) {
			let request = stdinJSON();
			if (type(request) != 'object') die('request must be an object');
			if (request.sections != null && type(request.sections) != 'string') die('sections must be a string');
			if (request.target != null && type(request.target) != 'string') die('target must be a string');
			sections = request.sections != null ? json(request.sections) : read();
			target = request.target || '';
		}
		else {
			let useStdin = false, directory;
			for (let i = 1; i < length(args); i++) {
				if (args[i] == '--stdin') useStdin = true;
				else if (args[i] == '--target' && args[i + 1]) target = args[++i];
				else if (args[i] == '--configdir' && args[i + 1]) directory = args[++i];
				else die(`unknown argument "${args[i]}"`);
			}
			sections = useStdin ? stdinJSON() : read('hijpass', directory);
		}
		let result = method == 'validate' ? validate(sections) : render(sections, target);
		printf('%.2J\n', rpc && target && method == 'render' ? { config: result } : result);
	}
	catch (e) {
		if (rpc) printf('%J\n', { error: e.message });
		else { fs.stderr.write(`${e.message}\n`); exit(1); }
	}
}
