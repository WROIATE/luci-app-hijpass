import * as fs from 'fs';

// ProcessResult：code 为进程退出状态，stdout 为完整输出；stderr 直接保留给调用者。
// 参数统一作为独立 argv 引用，UCI/URL/文件名不会被解释成 shell 代码。
export function quote(value) { return "'" + replace(`${value}`, "'", "'\\''") + "'"; }
export function command(args) { return join(' ', map(args, quote)); }
export function exec(args, quiet) {
	let proc = fs.popen(command(args) + (quiet ? ' 2>/dev/null' : ''), 'r');
	if (!proc) die(`cannot start ${args[0]}: ${fs.error()}`);
	let stdout = proc.read('all');
	let code = proc.close();
	return { code, stdout: stdout || '' };
}
export function checked(args) {
	let result = exec(args);
	if (result.code) die(`${args[0]} failed (${result.code})`);
	return result.stdout;
}
export function lines(text) {
	return filter(map(split(text || '', '\n'), line => trim(line)), line => line && substr(line, 0, 1) != '#' && substr(line, 0, 1) != '!');
}
export function mkdir(path, mode) {
	if (fs.stat(path)?.type == 'directory') return;
	let parent = fs.dirname(path);
	if (parent != path && parent != '.') mkdir(parent, mode);
	if (!fs.mkdir(path, mode || 0o755) && fs.stat(path)?.type != 'directory') die(`cannot create ${path}: ${fs.error()}`);
}
let serial = 0;
export function temporary(path) { return `${path}.new-${fs.readlink('/proc/self')}-${++serial}`; }
export function atomic(path, data, mode) {
	mkdir(fs.dirname(path));
	let temp = temporary(path), file = fs.open(temp, 'wx');
	if (!file) die(`cannot create ${temp}: ${fs.error()}`);
	try {
		if (!fs.chmod(temp, mode || 0o600)) die(`cannot chmod ${temp}`);
		if (file.write(data) != length(data) || !file.flush()) die(`cannot write ${temp}`);
		file.close();
		if (!fs.rename(temp, path)) die(`cannot replace ${path}: ${fs.error()}`);
	}
	catch (e) { file.close(); fs.unlink(temp); die(e.message); }
}
export function removeTree(path) {
	// 不跟随软链接，避免临时目录清理跨越到外部文件。
	if (fs.lstat(path)?.type == 'directory') {
		for (let name in fs.lsdir(path) || []) removeTree(`${path}/${name}`);
		if (!fs.rmdir(path)) die(`cannot remove ${path}`);
	}
	else if (fs.lstat(path) && !fs.unlink(path)) die(`cannot remove ${path}`);
}
