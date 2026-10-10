import * as fs from 'fs';
import { atomic, mkdir, removeTree, exec } from '../runtime/system.uc';

// TraceTask：目录名是随机 8 位 task ID；pid 为脱离 RPC 后的 worker PID；
// stdout/stderr 保存进度和报告，exit 在完成时原子发布。status 返回
// {running:boolean,code:int|null,stdout:string,stderr:string}，兼容 LuCI 轮询。
const ROOT = '/tmp/hijpass-trace-tasks';
/**
 * @param {string} id
 * @returns {string}
 */
function task(id) {
	if (!match(id || '', /^[A-Za-z0-9]{8}$/)) die('Invalid trace task ID');
	let directory = `${ROOT}/${id}`;
	if (fs.lstat(directory)?.type != 'directory') die('Trace task not found');
	return directory;
}
/**
 * @param {string} directory
 */
function running(directory) {
	if (fs.access(directory + '/exit')) return false;
	let pid = trim(fs.readfile(directory + '/pid') || '');
	return !pid || match(pid, /^[0-9]+$/) && fs.access('/proc/' + pid);
}
/**
 * @param {string[]} args
 * @param {string} worker
 */
export function start(args, worker) {
	mkdir(ROOT, 0o700);
	for (let id in fs.lsdir(ROOT) || []) {
		if (!match(id, /^[A-Za-z0-9]{8}$/)) continue;
		let directory = task(id);
		let stat = fs.stat(directory);
		if (stat && time() - stat.mtime > 600 && !running(directory)) removeTree(directory);
	}
	let random = fs.open('/dev/urandom', 'r'), directory, id;
	if (!random) die('cannot open random source');
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let attempt = 0; attempt < 20; attempt++) {
		let bytes = random.read(8); id = '';
		if (type(bytes) != 'string' || length(bytes) != 8) { random.close(); die('cannot read random source'); }
		for (let i = 0; i < 8; i++) id += substr(alphabet, ord(bytes, i) % length(alphabet), 1);
		directory = `${ROOT}/${id}`;
		if (fs.mkdir(directory, 0o700)) break;
		directory = null;
	}
	random.close();
	if (!directory) die('Cannot create trace task');
	atomic(directory + '/stdout', ''); atomic(directory + '/stderr', '');
	// start-stop-daemon 关闭继承的 RPC pipe；普通后台 fork 会使 20s RPC 一直等待。
	if (exec(['start-stop-daemon', '-S', '-b', '-m', '-p', directory + '/pid', '-x', worker, '--', directory, ...args]).code) {
		removeTree(directory); die('Cannot start trace worker');
	}
	return id;
};
/**
 * @param {string} id
 */
export function status(id) {
	let directory = task(id), active = running(directory), code = null;
	if (!active) {
		if (!fs.access(directory + '/exit')) {
			atomic(directory + '/stderr', (fs.readfile(directory + '/stderr') || '') + 'Trace worker exited without a result\n');
			atomic(directory + '/exit', '1\n');
		}
		code = int(fs.readfile(directory + '/exit'));
	}
	return { running: active, code, stdout: fs.readfile(directory + '/stdout') || '', stderr: fs.readfile(directory + '/stderr') || '' };
};
/**
 * @param {string} id
 */
export function release(id) {
	let directory = task(id);
	if (!fs.access(directory + '/exit')) die('Trace task has not finished');
	removeTree(directory);
};
