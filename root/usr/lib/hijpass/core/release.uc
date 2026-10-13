import { run, text } from 'hijpass.common';
// CoreRelease：tag_name 为官方版本，assets 含 name/state/browser_download_url/digest。
// 此处只校验发布元数据，归档和可执行文件的验证由 Shell 执行。
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
 */
export function release(core, response) {
	if (!repos[core]) die('unknown core');
	try {
		let info = json(response);
		if (type(info) != 'object') die('release response must be an object');
		if (!match(info.tag_name || '', /^v?[0-9]+[.][0-9]+[.][0-9]+[A-Za-z0-9.+-]*$/)) die('invalid release version');
		return info;
	}
	catch (e) { die(`invalid ${core} release response: ${e.message}`); }
};
export function assetPlan(core, machine, info) {
	let arch = architecture(core, machine), number = replace(info.tag_name, /^v/, '');
	let candidates = core == 'xray' ? [`Xray-${arch}.zip`] : [`sing-box-${number}-${arch}-musl.tar.gz`, `sing-box-${number}-${arch}.tar.gz`];
	let asset;
	for (let name in candidates) {
		asset = filter(info.assets || [], a => a.name == name && a.state == 'uploaded')[0];
		if (asset) break;
	}
	if (!asset || !match(asset.digest || '', /^sha256:[a-fA-F0-9]{64}$/)) die('release asset or checksum is missing');
	let expectedURL = `https://github.com/${repos[core]}/releases/download/${info.tag_name}/${asset.name}`;
	if (asset.browser_download_url != expectedURL) die('unexpected release asset URL');

    let digest = asset.digest;
    if (type(digest) != 'string') die('release checksum is missing');
    return { core, version: info.tag_name, number, name: asset.name, url: expectedURL,
        digest: lc(substr(digest, 7)), destination: `/usr/bin/${core}`, archive: core == 'xray' ? 'zip' : 'tar' };
};
// AssetPlan：core/version/number/name/url/digest/destination/archive，均来自已校验的发布数据。
// Shell 根据这些业务字段下载和安装，不接收拼接好的命令字符串。
export function main() { run(() => {
    let action = shift(ARGV), core = shift(ARGV);
    if (!core || !repos[core]) die('core action and name are required');
    if (action == 'source') return `https://api.github.com/repos/${repos[core]}/releases/latest\n`;
    if (action == 'member') {
        let member = filter(split(text(ARGV[0]), '\n'), entry => match(entry, /^sing-box-[A-Za-z0-9.+-]+\/sing-box$/))[0];
        if (!member) die('binary not found in archive');
        return member + '\n';
    }
    if (action == 'version') {
        let output = text(ARGV[0]), m = match(output, core == 'xray' ? /Xray ([0-9]+[.][0-9]+[.][0-9]+[^ \n]*)/ : /sing-box version ([0-9]+[.][0-9]+[.][0-9]+[^ \n]*)/);
        return { core, version: m ? m[1] : 'unknown' };
    }
    if (action == 'latest' || action == 'plan') {
        let info = release(core, text(ARGV[0]));
        return action == 'latest' ? { core, version: info.tag_name } : assetPlan(core, ARGV[1], info);
    }
    if (action == 'error') return { success: false, error: ARGV[0] || 'core update failed' };
    if (action == 'result') return { success: true, version: ARGV[0] };
    die('unknown core data action');
}, true);
};
