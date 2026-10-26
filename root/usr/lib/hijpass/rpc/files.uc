import * as fs from 'fs';
import { read } from 'hijpass.uci.read';
import { atomic } from 'hijpass.common';
import { RULE_FILES, FILES, nodeConfig, logPath } from 'hijpass.config.paths';

// 编辑器只传资源名、section ID 和可选的新名称；目录和文件命名始终由后端决定。
const resources = {
    ip_direct: RULE_FILES.ip_direct, ip_proxy: RULE_FILES.ip_proxy,
    domain_direct: RULE_FILES.domain_direct, domain_proxy: RULE_FILES.domain_proxy,
    ...FILES,
};
/**
 * 校验前端传入的 UCI section ID，拒绝非法字符。
 * @param {string|null} value
 * @returns {string} 有效的 section ID；无效时抛错。
 */
function identifier(value) {
    if (type(value) != 'string') {
        die('invalid section ID');
    }
    if (!match(value, /^[A-Za-z0-9_-]+$/)) {
        die('invalid section ID');
    }
    return value;
}
/**
 * 根据资源名和节点标识定位后端文件。
 * @param {object} request
 * @returns {string} 资源或节点配置的绝对路径。
 */
function editorPath(request) {
    let kind = request.resource;
    let packageName = kind == 'server_config' ? 'hijserver' : 'hijpass';
    if (exists(resources, kind)) {
        return resources[kind];
    }
    let config = read(packageName);
    if (kind != 'proxy_config' && kind != 'server_config') {
        die('unknown editor resource');
    }
    let id = identifier(request.section), section = filter(config, item => item['.name'] == id)[0];
    return nodeConfig({ '.name': id, name: request.name || section?.name }, kind == 'server_config');
}
/**
 * 按资源名读取或保存编辑器内容。
 * @param {{resource: string, section: string, name: string, content: string}} request
 * @param {boolean} write
 * @returns {object} 读取返回 {content}，保存返回 {ok: true}；尚未创建的节点或分流文件内容为空。
 */
export function editor(request, write) {
    let path = editorPath(request);
    if (!write) {
        let content = fs.readfile(path);
        // 节点配置在首次保存前不存在；规则和 hook 的读取错误不能伪装为空内容。
        if (content == null && index(['proxy_config', 'server_config', 'shunt_conf'], request.resource) < 0) {
            die(`cannot read editor resource: ${request.resource}`);
        }
        return { content: content || '' };
    }
    let content = replace(trim(request.content), /\r\n/g, '\n');
    atomic(path, content ? content + '\n' : '', fs.stat(path)?.mode || 0o600);
    return { ok: true };
};

// Log：id 为 package:section 的业务标识；客户端不能提交任意日志路径。
/**
 * 列出可供前端查看的日志，不暴露文件路径。
 * @returns {object} {logs}，每项含 id、kind 和显示名称 name。
 */
export function logs() {
    let result = [];
    for (let packageName in ['hijpass', 'hijserver']) {
        for (let section in read(packageName)) {
            if (!logPath(section, packageName == 'hijserver')) {
                continue;
            }
        let kind = 'main';
        if (section['.type'] == 'proxy_node') {
            kind = 'proxy';
        }
        else if (section['.type'] == 'server_node') {
            kind = 'server';
        }
        else if (section['.type'] == 'shunt') {
            kind = 'shunt';
        }
            push(result, { id: `${packageName}:${section['.name']}`, kind, name: section.name || section['.name'] });
        }
    }
    return { logs: result };
};
/**
 * 按日志 ID 读取尾部内容、下载全文或清空文件。
 * @param {{id: string, action: string, lines: string}} request
 * @returns {object} 读取返回 {content}，下载返回 {content, name}，清空返回 {ok: true}。
 */
export function log(request) {
    let parts = split(request.id, ':'), packageName = parts[0];
    if (length(parts) != 2 || index(['hijpass', 'hijserver'], packageName) < 0) {
        die('invalid log ID');
    }
    let id = identifier(parts[1]), section = filter(read(packageName), item => item['.name'] == id)[0];
    let path = section ? logPath(section, packageName == 'hijserver') : '';
    if (!path) {
        die('logging is disabled');
    }
    if (request.action == 'clear') {
        if (fs.writefile(path, '') == null) {
            die('cannot clear log');
        }
        return { ok: true };
    }
    let file = fs.open(path, 'r');
    if (!file) {
        die('cannot open log');
    }
    try {
        if (request.action == 'download') {
            let content = file.read('all') || ''; file.close();
            return { content, name: fs.basename(path) };
        }
        if (request.action != 'read' || !match(request.lines, /^[0-9]+$/)) {
            die('invalid log request');
        }
        let count = int(request.lines);
        if (count < 1 || count > 1000) {
            die('log line count must be between 1 and 1000');
        }
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
