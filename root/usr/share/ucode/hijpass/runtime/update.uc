import * as fs from 'fs';
import { exec, checked, temporary, removeTree } from './system.uc';

// CoreRelease：tag_name 为官方版本，assets 含 name/state/browser_download_url/digest。
// digest 必须为 sha256，先校验归档，再验证可执行文件，最后原子替换目标。
const repos = { 'sing-box': 'SagerNet/sing-box', xray: 'XTLS/Xray-core' };
/**
 * @param {string} core
 * @param {string} machine
 */
export function architecture(core, machine) {
	const suffixes = {
		'sing-box': { x86_64: 'amd64', aarch64: 'arm64', arm64: 'arm64', armv7l: 'armv7', armv6l: 'armv6', mips: 'mips-softfloat', mipsle: 'mipsle-softfloat', mips64: 'mips64', mips64le: 'mips64le' },
		xray: { x86_64: '64', aarch64: 'arm64-v8a', arm64: 'arm64-v8a', armv7l: 'arm32-v7a', armv6l: 'arm32-v6', mips: 'mips32', mipsle: 'mips32le', mips64: 'mips64', mips64le: 'mips64le' },
	};
	let suffix = suffixes[core]?.[machine];
	if (!suffix) die(`unsupported architecture: ${machine}`);
	return 'linux-' + suffix;
};
/**
 * @param {string} core
 * @param {string} path
 */
function version(core, path) {
	let result = exec([path, 'version'], true);
	let matchVersion = match(result.stdout, core == 'xray' ? /Xray ([0-9]+[.][0-9]+[.][0-9]+[^ \n]*)/ : /sing-box version ([0-9]+[.][0-9]+[.][0-9]+[^ \n]*)/);
	return !result.code && matchVersion ? matchVersion[1] : null;
}
/**
 * @param {string} core
 */
export function release(core) {
	if (!repos[core]) die('unknown core');
	let response = checked(['curl', '-f', '-sS', '-L', '--max-time', '10', `https://api.github.com/repos/${repos[core]}/releases/latest`]);
	try {
		let info = json(response);
		if (type(info) != 'object') die('release response must be an object');
		if (!match(info.tag_name || '', /^v?[0-9]+[.][0-9]+[.][0-9]+[A-Za-z0-9.+-]*$/)) die('invalid release version');
		return info;
	}
	catch (e) { die(`invalid ${core} release response: ${e.message}`); }
};
/**
 * @param {string} action
 * @param {string} core
 */
export function run(action, core) {
	if (!repos[core]) die('unknown core');
	let destination = `/usr/bin/${core}`;
	if (action == 'version') return { core, version: version(core, destination) || 'unknown' };
	if (action != 'latest' && action != 'update') die('unknown core update action');
	let info = release(core);
	if (action == 'latest') return { core, version: info.tag_name };
	let arch = architecture(core, trim(checked(['uname', '-m']))), number = replace(info.tag_name, /^v/, '');
	let candidates = core == 'xray' ? [`Xray-${arch}.zip`] : [`sing-box-${number}-${arch}-musl.tar.gz`, `sing-box-${number}-${arch}.tar.gz`];
	let asset;
	for (let name in candidates) {
		asset = filter(info.assets || [], a => a.name == name && a.state == 'uploaded')[0];
		if (asset) break;
	}
	if (!asset || !match(asset.digest || '', /^sha256:[a-fA-F0-9]{64}$/)) die('release asset or checksum is missing');
	let expectedURL = `https://github.com/${repos[core]}/releases/download/${info.tag_name}/${asset.name}`;
	if (asset.browser_download_url != expectedURL) die('unexpected release asset URL');
	let dir = trim(checked(['mktemp', '-d', '/tmp/hijpass-update-XXXXXX']));
	let temp = temporary(destination);
	try {
		let archive = `${dir}/${asset.name}`;
		checked(['curl', '-f', '-sS', '-L', '--max-time', '120', '-o', archive, expectedURL]);
		let checksum = split(trim(checked(['sha256sum', archive])), /[ \t]+/)[0];
		if (lc(checksum) != lc(substr(asset.digest, 7))) die('archive checksum verification failed');
		let binary;
		if (core == 'xray') {
			checked(['unzip', '-q', archive, 'xray', '-d', dir]);
			binary = dir + '/xray';
		}
		else {
			// 只提取明确的核心路径，不展开归档里的其它文件。
			let entries = split(checked(['tar', '-tzf', archive]), '\n');
			let member = filter(entries, entry => match(entry, /^sing-box-[A-Za-z0-9.+-]+\/sing-box$/))[0];
			if (!member) die('binary not found in archive');
			checked(['tar', '-xzf', archive, '-C', dir, member]);
			binary = `${dir}/${member}`;
		}
		if (!fs.chmod(binary, 0o755) || version(core, binary) != number) die('binary verification failed');
		// cp 流式复制二进制，避免在路由器内存中保存整份核心；同目录 rename 原子安装。
		checked(['cp', binary, temp]);
		if (!fs.chmod(temp, 0o755)) die('cannot chmod new core');
		if (!fs.rename(temp, destination)) die('install failed');
	}
	catch (e) { fs.unlink(temp); removeTree(dir); die(e.message); }
	removeTree(dir);
	return { success: true, version: info.tag_name };
};
