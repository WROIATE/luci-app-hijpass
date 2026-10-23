import * as fs from 'fs';
import { read } from './uci/read.uc';

/**
 * @param {string} path 模板文件的绝对路径。
 * @param {object} scope 只传入模板需要的已校验字段。
 * @returns {string} 使用 scope 渲染后的模板文本；模板失败时抛出带模板路径的错误。
 */
export function renderTemplate(path, scope) {
	try {
		let output = render(path, scope);
		if (type(output) != 'string') die('template did not return text');
		return output;
	}
	catch (e) { die(`template "${path}": ${e.message}`); }
};

/** @returns {string} 按 POSIX Shell 单引号规则转义后的单个参数，包含外围引号，不执行命令。 */
export function quote(value) { return "'" + replace(`${value}`, "'", "'\\''") + "'"; };
/**
 * @param {array} args 作为独立 argv 引用的参数数组。
 * @returns {string} 将各 argv 独立转义并以空格连接的 Shell 命令片段，不执行命令。
 */
export function command(args) { return join(' ', map(args, quote)); };
/**
 * @param {string|null} text
 * @returns {string[]} 去掉空行、# / ! 注释并修剪首尾空白后的文本行，保持原顺序。
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
 * @returns {null} 确保目录及父目录存在；已存在时不修改，路径无效或创建失败时抛错。
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
 * @returns {string} 目标文件旁包含当前 PID 和递增序号的临时路径；只生成名字，不创建文件。
 */
export function temporary(path) { return `${path}.new-${fs.readlink('/proc/self')}-${++serial}`; };
/**
 * @param {string} path
 * @param {string} data
 * @param {integer} [mode]
 * @returns {null} 将完整数据写入临时文件后原子替换目标；失败清理临时文件并抛错，不返回文件路径。
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

let configDirectory;

// CLI 数据边界：stdout 只返回数据，错误由 stderr/退出状态或既有 JSON 契约表达。
/**
 * @param {function} handler
 * @param {boolean} [jsonErrors]
 * @returns {null} 不传递 handler 返回值；非 null 结果写入 stdout（字符串原样，其余编码为 JSON），异常报告错误并退出。
 */
export function run(handler, jsonErrors) {
    try {
        // 所有数据入口使用同一份可选配置目录，缺失参数在执行前失败。
        let position = index(ARGV, '--configdir');
        if (position != null && position >= 0) {
            configDirectory = ARGV[position + 1];
            if (!configDirectory) die('missing --configdir');
            splice(ARGV, position, 2);
        }
        let result = handler();
        if (result != null) {
            if (type(result) == 'string') print(result);
            else printf('%J\n', result);
            if (type(result) == 'object' && result.success === false) exit(result.exit_code || 1);
        }
    }
    catch (e) {
        if (jsonErrors) printf('%J\n', { success: false, error: e.message });
        else warn(`${e.message}\n`);
        exit(1);
    }
};
/**
 * @param {string} [packageName]
 * @returns {object[]} 指定 UCI 包的原始 section 数组，保留元数据和读取顺序，使用当前 CLI 的可选配置目录。
 */
export function sections(packageName) {
    return read(packageName || 'hijpass', configDirectory);
};
/**
 * @param {string|null} path
 * @returns {string} 指定文件的完整原始文本，包含已有空白与换行；路径无效或读取失败时抛错。
 */
export function text(path) {
    if (type(path) != 'string') die('missing input path');
    let data = fs.readfile(path);
    if (type(data) != 'string') die(`cannot read ${path}`);
    return data;
};
