import * as fs from 'fs';
import { read } from './uci/read.uc';

/**
 * @param {string} path 模板文件的绝对路径。
 * @param {object} scope 只传入模板需要的已校验字段。
 * @returns {string}
 */
export function renderTemplate(path, scope) {
	try {
		let output = render(path, scope);
		if (type(output) != 'string') die('template did not return text');
		return output;
	}
	catch (e) { die(`template "${path}": ${e.message}`); }
};

export function quote(value) { return "'" + replace(`${value}`, "'", "'\\''") + "'"; };
/**
 * @param {array} args 作为独立 argv 引用的参数数组。
 * @returns {string}
 */
export function command(args) { return join(' ', map(args, quote)); };
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

let configDirectory;

// CLI 数据边界：stdout 只返回数据，错误由 stderr/退出状态或既有 JSON 契约表达。
/**
 * @param {function} handler
 * @param {boolean} [jsonErrors]
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
 * @returns {object[]}
 */
export function sections(packageName) {
    return read(packageName || 'hijpass', configDirectory);
};
/**
 * @param {string|null} path
 * @returns {string}
 */
export function text(path) {
    if (type(path) != 'string') die('missing input path');
    let data = fs.readfile(path);
    if (type(data) != 'string') die(`cannot read ${path}`);
    return data;
};
