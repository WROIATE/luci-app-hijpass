import * as fs from 'fs';
import { read } from 'hijpass.uci.read';
import { first } from 'hijpass.config.sections';
import { atomic } from 'hijpass.common';
import { definitions } from '../firewall/generate.uc';

// 编辑器只传资源名、section ID 和可选的新名称；目录和文件命名始终由后端决定。
const resources = {
    ip_direct: '/etc/hijpass/rules/ip-direct.txt', ip_proxy: '/etc/hijpass/rules/ip-proxy.txt',
    domain_direct: '/etc/hijpass/rules/domain-direct.txt', domain_proxy: '/etc/hijpass/rules/domain-proxy.txt',
    nft_hook: '/etc/hijpass/hook/nft-hook.sh', dns_hook: '/etc/hijpass/hook/dns-hook.sh',
    shunt_conf: '/etc/hijpass/shunt.json',
};
/** @param {string|null} value @returns {string} */
function identifier(value) {
    if (type(value) != 'string') die('invalid section ID');
    if (!match(value, /^[A-Za-z0-9_-]+$/)) die('invalid section ID');
    return value;
}
/** @param {string} value @returns {string} */
function filename(value) {
    if (!length(value) || match(value, /[\/\\\r\n]/) || index(value, sprintf('%c', 0)) >= 0) die('invalid node name');
    return value;
}
/** @param {object} request @returns {string} */
function editorPath(request) {
    let kind = request.resource;
    let packageName = kind == 'server_config' ? 'hijserver' : 'hijpass';
    let config = read(packageName), global = first(config, packageName);
    if (exists(resources, kind)) return global[kind] || resources[kind];
    if (kind == 'firewall_rule') {
        if (!length(filter(definitions, chain => chain.name == request.section))) die('unknown firewall chain');
        return `${global.firewall_rules || '/etc/hijpass/firewall'}/${request.section}.ut`;
    }
    if (kind != 'proxy_config' && kind != 'server_config') die('unknown editor resource');
    let id = identifier(request.section), section = filter(config, item => item['.name'] == id)[0];
    let name = filename(request.name || section?.name || id);
    let directory = kind == 'proxy_config' ? global.client_dir || '/etc/hijpass/client' : global.server_dir || '/etc/hijpass/server';
    return `${directory}/${name}-${id}.json`;
}
/** @param {{resource: string, section: string, name: string, content: string}} request @param {boolean} write @returns {object} */
export function editor(request, write) {
    let path = editorPath(request);
    if (!write) {
        let content = fs.readfile(path);
        // 节点配置在首次保存前不存在；规则和 hook 的读取错误不能伪装为空内容。
        if (content == null && index(['proxy_config', 'server_config', 'shunt_conf'], request.resource) < 0)
            die(`cannot read editor resource: ${request.resource}`);
        return { content: content || '' };
    }
    let content = replace(trim(request.content), /\r\n/g, '\n');
    atomic(path, content ? content + '\n' : '', fs.stat(path)?.mode || 0o600);
    return { ok: true };
};

// Log：id 为 package:section 的业务标识；客户端不能提交任意日志路径。
export function logs() {
    let result = [];
    for (let packageName in ['hijpass', 'hijserver']) for (let section in read(packageName)) {
        if (!section.log_path) continue;
        let kind = section['.type'] == 'proxy_node' ? 'proxy' : section['.type'] == 'server_node' ? 'server'
            : section['.type'] == 'shunt' ? 'shunt' : 'main';
        push(result, { id: `${packageName}:${section['.name']}`, kind, name: section.name || section['.name'] });
    }
    return { logs: result };
};
/** @param {{id: string, action: string, lines: string}} request @returns {object} */
export function log(request) {
    let parts = split(request.id, ':'), packageName = parts[0];
    if (length(parts) != 2 || index(['hijpass', 'hijserver'], packageName) < 0) die('invalid log ID');
    let id = identifier(parts[1]), section = filter(read(packageName), item => item['.name'] == id)[0];
    let path = section?.log_path;
    if (!path) die('logging is disabled');
    if (request.action == 'clear') {
        if (fs.writefile(path, '') == null) die('cannot clear log');
        return { ok: true };
    }
    let file = fs.open(path, 'r');
    if (!file) die('cannot open log');
    try {
        if (request.action == 'download') {
            let content = file.read('all') || ''; file.close();
            return { content, name: fs.basename(path) };
        }
        if (request.action != 'read' || !match(request.lines, /^[0-9]+$/)) die('invalid log request');
        let count = int(request.lines);
        if (count < 1 || count > 1000) die('log line count must be between 1 and 1000');
        // 环形缓冲只保留尾部所需的行数，避免为预览加载整份日志。
        let buffer = [], total = 0, line;
        while ((line = file.read('line')) != null) buffer[total++ % count] = line;
        let content = '';
        for (let i = max(0, total - count); i < total; i++) content += buffer[i % count];
        file.close();
        return { content };
    }
    catch (e) { file.close(); die(e.message); }
};
/** @param {object} request @returns {object} */
export function logSettings(request) {
    if (index(['hijpass', 'hijserver'], request.package) < 0) die('invalid configuration package');
    let config = read(request.package), global = first(config, request.package);
    let id = identifier(request.section), section = filter(config, item => item['.name'] == id)[0];
    let name = request.name || section?.name;
    let file = name ? `${filename(name)}-${id}.log` : 'shunt.log';
    return { path: `${global.log_dir || (request.package == 'hijpass' ? '/tmp/hijpass/log' : '/tmp/hijserver/log')}/${file}` };
};
