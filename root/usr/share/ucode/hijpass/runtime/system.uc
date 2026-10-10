import * as fs from 'fs';

/**
 * @typedef {object} ProcessResult
 * @property {integer} code 进程退出状态；信号终止时为负数。
 * @property {string} stdout 完整标准输出；stderr 直接保留给调用者。
 */
// 参数统一作为独立 argv 引用，UCI/URL/文件名不会被解释成 shell 代码。
export function quote(value) { return "'" + replace(`${value}`, "'", "'\\''") + "'"; };
/**
 * @param {array} args 作为独立 argv 引用的参数数组。
 * @returns {string}
 */
export function command(args) { return join(' ', map(args, quote)); };
/**
 * @param {array} args 命令及参数数组。
 * @param {boolean} [quiet] 是否隐藏标准错误。
 * @returns {ProcessResult}
 */
export function exec(args, quiet) {
	let proc = fs.popen(command(args) + (quiet ? ' 2>/dev/null' : ''), 'r');
	if (!proc) die(`cannot start ${args[0]}: ${fs.error()}`);
	let stdout = proc.read('all');
	let code = proc.close();
	if (type(stdout) != 'string') die(`cannot read ${args[0]} output: ${fs.error()}`);
	if (code == null) die(`cannot wait for ${args[0]}: ${fs.error()}`);
	return { code, stdout };
};
/**
 * @param {array} args
 * @param {boolean} [quiet] 是否隐藏标准错误。
 * @returns {string} 非零退出状态抛异常，成功时返回输出。
 */
export function checked(args, quiet) {
	let result = exec(args, quiet);
	if (result.code) die(`${args[0]} failed (${result.code})`);
	// exec 已校验读取成功；空标准输出也应作为有效字符串返回。
	return result.stdout || '';
};
/**
 * @param {string|null} text
 * @returns {string[]} 去掉空行、注释并修剪空白的文本行。
 */
export function lines(text) {
	let result = [];
	for (let line in split(text || '', '\n')) {
		line = trim(line);
		if (line && substr(line, 0, 1) != '#' && substr(line, 0, 1) != '!') push(result, line);
	}
	return result;
};
/**
 * @param {string|null} path 路径解析失败返回 null；拒绝无效目录。
 * @param {integer} [mode]
 */
export function mkdir(path, mode) {
	if (type(path) != 'string' || !length(path)) die('directory path is empty or invalid');
	if (fs.stat(path)?.type == 'directory') return;
	let parent = fs.dirname(path);
	if (parent != path && parent != '.') mkdir(parent, mode);
	if (!fs.mkdir(path, mode || 0o755) && fs.stat(path)?.type != 'directory') die(`cannot create ${path}: ${fs.error()}`);
};
let serial = 0;
/**
 * @param {string} path
 * @returns {string}
 */
export function temporary(path) { return `${path}.new-${fs.readlink('/proc/self')}-${++serial}`; };
/**
 * @param {string} path
 * @param {string} data
 * @param {integer} [mode]
 */
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
};
/**
 * @param {string} path
 */
export function removeTree(path) {
	// 不跟随软链接，避免临时目录清理跨越到外部文件。
	if (fs.lstat(path)?.type == 'directory') {
		for (let name in fs.lsdir(path) || []) removeTree(`${path}/${name}`);
		if (!fs.rmdir(path)) die(`cannot remove ${path}`);
	}
	else if (fs.lstat(path) && !fs.unlink(path)) die(`cannot remove ${path}`);
};
