/** @typedef {import('../../../share/ucode/hijpass/types/config.uc').UciSection} UciSection */
import { read } from 'hijpass.uci.read';
import * as fs from 'fs';
import { logPath } from 'hijpass.config.paths';
import { findFirstSectionByType } from 'hijpass.config.sections';
import { mkdir } from 'hijpass.common';
import { run } from 'hijpass.command.runtime';

// Logger 返回一个 (level, message) 函数，保留应用日志级别与多行排版。
// 主日志位置由后端确定，global.log_level 为 DEBUG/INFO/WARN/ERROR。
/**
 * 根据配置创建主日志写入函数，并按日志级别过滤消息。
 * @param {UciSection[]} sections
 * @returns {function} 接受 (level, message) 的日志函数。
 */
export function logger(sections) {
	let global = findFirstSectionByType(sections, 'hijpass'), path = logPath({ '.type': 'hijpass' });
	const levels = { DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4 };
	return (level, message) => {
		level = uc(level);
		if ((levels[level] || 2) < (levels[uc(global?.log_level || 'INFO')] || 2)) {
			return;
		}
		mkdir(fs.dirname(path));
		let file = fs.open(path, 'a');
		if (!file) {
			die(`cannot open log ${path}`);
		}
		let date = localtime(time());
		if (!date) {
			file.close();
			die('cannot format log timestamp');
		}
		let stamp = sprintf('%04d-%02d-%02d %02d:%02d:%02d', date.year, date.mon, date.mday, date.hour, date.min, date.sec);
		file.write(sprintf('[%s]   %-8s%s\n', stamp, level, replace(message, '\n', '\n                               ')));
		file.close();
	};
};
/**
 * 裁剪过长日志，只保留最后 30000 行。
 * @param {string} path
 * @returns {null} 无业务返回值；文件打不开或未超限时跳过。
 */
function trimLog(path) {
	let file = fs.open(path, 'r');
	if (!file) {
		return;
	}
	let buffer = [], count = 0, line;
	// 环形缓冲只保留最后 30000 行，日志很大时也不会完整载入内存。
	while ((line = file.read('line')) != null) {
		buffer[count % 30000] = line;
		count++;
	}
	file.close();
	if (count <= 30000) {
		return;
	}
	file = fs.open(path, 'w');
	if (!file) {
		die(`cannot trim ${path}`);
	}
	for (let i = count - 30000; i < count; i++) file.write(buffer[i % 30000]);
	file.close();
}
/**
 * 清空指定日志，或裁剪当前服务的全部日志。
 * @param {UciSection[]} sections
 * @param {string} action
 * @param {string|null} [path]
 * @returns {null} 无业务返回值，直接更新日志文件。
 */
export function cleanLogs(sections, action, path) {
	if (action == 'clean') {
		if (type(path) != 'string') {
			die('missing log path');
		}
		if (fs.writefile(path, '') == null) {
			die(`cannot clear ${path}`);
		}
		return;
	}
	for (let s in sections) {
		let target = logPath(s, action == 'hijserver');
		if (target) {
			trimLog(target);
		}
	}
};

/**
 * 处理日志追加、清空和裁剪命令。
 * @returns {null} 正常执行不输出数据，错误通过 stderr 和退出码报告。
 */
export function main() { run(ARGV,
    /**
     * @param {string[]} args
     * @param {string|null} configDirectory
     */
    function(args, configDirectory) {
    let action = shift(args);
    if (action == 'append') {
        let config = read('hijpass', configDirectory);
        return logger(config)(args[0], join(' ', slice(args, 1)));
    }
    if (action == 'clean') {
        return cleanLogs([], 'clean', args[0] || '');
    }
    if (action == 'hijpass' || action == 'hijserver') {
        return cleanLogs(read(action, configDirectory), action || '');
    }
    die('unknown log action');
});
};
