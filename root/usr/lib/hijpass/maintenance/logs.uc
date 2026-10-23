import * as fs from 'fs';
import { logPath } from 'hijpass.config.paths';
import { first } from 'hijpass.config.sections';
import { mkdir, run, sections } from 'hijpass.common';

// Logger 返回一个 (level, message) 函数，保留应用日志级别与多行排版。
// 主日志位置由后端确定，global.log_level 为 DEBUG/INFO/WARN/ERROR。
/**
 * @param {object[]} sections
 * @returns {function} 接受 (level, message) 的日志函数，按配置级别过滤后，将带时间戳的消息追加到主日志。
 */
export function logger(sections) {
	let global = first(sections, 'hijpass'), path = logPath({ '.type': 'hijpass' });
	const levels = { DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4 };
	return (level, message) => {
		level = uc(level);
		if ((levels[level] || 2) < (levels[uc(global.log_level || 'INFO')] || 2)) return;
		mkdir(fs.dirname(path));
		let file = fs.open(path, 'a');
		if (!file) die(`cannot open log ${path}`);
		let date = localtime(time());
		if (!date) { file.close(); die('cannot format log timestamp'); }
		let stamp = sprintf('%04d-%02d-%02d %02d:%02d:%02d', date.year, date.mon, date.mday, date.hour, date.min, date.sec);
		file.write(sprintf('[%s]   %-8s%s\n', stamp, level, replace(message, '\n', '\n                               ')));
		file.close();
	};
};
/**
 * @param {string} path
 * @returns {null} 原地保留日志最后 30000 行；文件无法打开或行数未超限时不修改。
 */
function trimLog(path) {
	let file = fs.open(path, 'r');
	if (!file) return;
	let buffer = [], count = 0, line;
	// 环形缓冲只保留最后 30000 行，日志很大时也不会完整载入内存。
	while ((line = file.read('line')) != null) { buffer[count % 30000] = line; count++; }
	file.close();
	if (count <= 30000) return;
	file = fs.open(path, 'w');
	if (!file) die(`cannot trim ${path}`);
	for (let i = count - 30000; i < count; i++) file.write(buffer[i % 30000]);
	file.close();
}
/**
 * @param {object[]} sections
 * @param {string} action
 * @param {string|null} [path]
 * @returns {null} clean 动作清空指定文件，其余动作裁剪对应服务日志的旧行；只修改文件，不返回日志内容。
 */
export function cleanLogs(sections, action, path) {
	if (action == 'clean') { if (type(path) != 'string') die('missing log path'); if (fs.writefile(path, '') == null) die(`cannot clear ${path}`); return; }
	for (let s in sections) { let target = logPath(s, action == 'hijserver'); if (target) trimLog(target); }
};

/** @returns {null} 执行日志追加、清空或按服务轮转；不输出正常结果，错误由 stderr 和退出状态报告。 */
export function main() { run(() => {
    let action = shift(ARGV);
    if (action == 'append') { let config = sections(); return logger(config)(ARGV[0], join(' ', slice(ARGV, 1))); }
    if (action == 'clean') return cleanLogs([], 'clean', ARGV[0] || '');
    if (action == 'hijpass' || action == 'hijserver') return cleanLogs(sections(action), action || '');
    die('unknown log action');
});
};
