import * as fs from 'fs';
import { first } from '../uci/config.uc';
import { mkdir } from './system.uc';

/**
 * @param {object[]} sections
 * @param {string} kind
 * @param {string} id
 * @param {string} [keep]
 */
export function cleanup(sections, kind, id, keep) {
	if (!match(id || '', /^[A-Za-z0-9_-]+$/)) die('invalid section ID');
	let directory = kind == 'proxy' ? first(sections, 'hijpass').client_dir || '/etc/hijpass/client'
		: kind == 'server' ? first(sections, 'hijserver').server_dir || '/etc/hijpass/server' : null;
	if (!directory) die('unknown node kind');
	if (keep && (fs.dirname(keep) != directory || substr(keep, -length(id) - 6) != `-${id}.json`)) die('invalid keep path');
	for (let name in fs.lsdir(directory) || []) {
		let path = `${directory}/${name}`;
		if (substr(name, -length(id) - 6) == `-${id}.json` && path != keep && fs.lstat(path)?.type != 'directory')
			if (!fs.unlink(path)) die(`cannot remove ${path}`);
	}
};

// Logger 返回一个 (level, message) 函数，保留应用日志级别与多行排版。
// global.log_path 为目标，global.log_level 为 DEBUG/INFO/WARN/ERROR。
/**
 * @param {object[]} sections
 */
export function logger(sections) {
	let global = first(sections, 'hijpass');
	const levels = { DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4 };
	return (level, message) => {
		level = uc(level);
		if ((levels[level] || 2) < (levels[uc(global.log_level || 'INFO')] || 2)) return;
		if (!global.log_path) { warn(`${level}: ${message}\n`); return; }
		mkdir(fs.dirname(global.log_path));
		let file = fs.open(global.log_path, 'a');
		if (!file) die(`cannot open log ${global.log_path}`);
		let date = localtime(time());
		if (!date) { file.close(); die('cannot format log timestamp'); }
		let stamp = sprintf('%04d-%02d-%02d %02d:%02d:%02d', date.year, date.mon, date.mday, date.hour, date.min, date.sec);
		file.write(sprintf('[%s]   %-8s%s\n', stamp, level, replace(message, '\n', '\n                               ')));
		file.close();
	};
};
/**
 * @param {string} path
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
 * @param {string} [path]
 */
export function cleanLogs(sections, action, path) {
	if (action == 'clean') { if (fs.writefile(path, '') == null) die(`cannot clear ${path}`); return; }
	for (let s in sections) if (s.log_path) trimLog(s.log_path);
};
