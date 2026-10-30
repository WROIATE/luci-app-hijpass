/** @typedef {import('../../../share/ucode/hijpass/types/service.uc').ServicePlan} ServicePlan */
import * as fs from 'fs';
import { atomic, text, quote } from 'hijpass.common';
import { read } from 'hijpass.uci.read';
import { nodeConfig } from 'hijpass.config.paths';
import { run } from 'hijpass.command.runtime';

// 目录只能由持有服务锁的生命周期脚本创建，不通过 RPC 接收文件路径。
function files(directory) {
    let result = [];
    for (let name in fs.lsdir(directory) || []) {
        let path = directory + '/' + name, info = fs.lstat(path);
        if (info?.type == 'directory') push(result, ...files(path));
        else if (info?.type == 'file') push(result, path);
        else die(`unsupported staged file: ${path}`);
    }
    return result;
}

/** @param {string} work 候选目录。 @param {string} packageName UCI 包名。 */
function snapshot(work, packageName) {
    atomic(`${work}/config/${packageName}`, text(`/etc/config/${packageName}`));
    if (fs.stat('/etc/config/dhcp')) atomic(`${work}/config/dhcp`, text('/etc/config/dhcp'));
}

/**
 * 完成候选文件清单与核心检查参数；自定义文件原样复制，不生成替代内容。
 * @param {string} work
 * @param {string} packageName
 */
function seal(work, packageName) {
    let plan = json(text(work + '/plan.json'));
    let sections = read(packageName, work + '/config'), inputs = [];
    function copyInput(path) {
        if (fs.stat(path) && !fs.stat(work + '/files' + path)) {
            atomic(work + '/files' + path, text(path), fs.stat(path).mode & 0o777);
            push(inputs, path);
        }
    }
    for (let section in sections) {
        let server = section['.type'] == 'server_node';
        if (!server && section['.type'] != 'proxy_node') continue;
        let path = nodeConfig(section, server);
        copyInput(path);
    }
    // 自定义分流同样必须随候选版本保留，不能让回滚读取后来编辑的文件。
    copyInput('/etc/hijpass/shunt.json');
    let entries = map(files(work + '/files'), path => ({
        path: substr(path, length(work + '/files')), mode: fs.stat(path).mode & 0o777,
    }));
    // 自定义配置是用户输入，不参加正式文件替换和回滚；运行实例使用其版本快照。
    entries = filter(entries, entry => index(inputs, entry.path) < 0);
    let checks = [];
    for (let instance in plan.instances) {
        instance.ports = [];
        let command = [...instance.command], engine = command[0], position = index(command, '-c');
        instance.command = map(command, argument => {
            for (let path in inputs) {
                if (argument == path) return work + '/files' + path;
                if (engine == '/bin/sh') argument = replace(argument, quote(path), quote(work + '/files' + path));
            }
            return argument;
        });
        if (engine == 'chinadns-ng') {
            let conf = text(work + '/files/etc/hijpass/chinadns-ng.conf');
            let found = match(conf, /(^|\n)bind-port[ \t]+([0-9]+)/);
            if (found) instance.ports = [+found[2]];
            continue;
        }
        if ((engine != 'xray' && engine != 'sing-box') || position < 0 || position == null) continue;
        let path = command[position + 1], content = json(text(work + '/files' + path));
        instance.ports = uniq(filter(map(content.inbounds || [], inbound => int(inbound.listen_port || inbound.port)),
            port => port > 0 && port <= 65535));
        // 检查命令读取候选规则集，正式 JSON 中的路径保持不变。
        function candidatePaths(value) {
            if (type(value) == 'string') return fs.stat(work + '/files' + value) ? work + '/files' + value : value;
            if (type(value) == 'array') return map(value, candidatePaths);
            if (type(value) == 'object') { let result = {}; for (let key, item in value) result[key] = candidatePaths(item); return result; }
            return value;
        }
        let checkPath = `${work}/check/${length(checks)}.json`;
        atomic(checkPath, sprintf('%J\n', candidatePaths(content)));
        push(checks, { engine, path: checkPath, env: instance.env });
    }
    atomic(work + '/manifest.json', sprintf('%J\n', entries));
    atomic(work + '/checks.json', sprintf('%J\n', { checks }));
    atomic(work + '/plan.json', sprintf('%J\n', plan));
}

/** @param {string} work */
function backup(work) {
    let entries = json(text(work + '/manifest.json'));
    for (let entry in entries) {
        let info = fs.stat(entry.path);
        entry.existed = info != null;
        if (info) {
            entry.mode = info.mode & 0o777;
            atomic(work + '/previous' + entry.path, text(entry.path), entry.mode);
        }
    }
    atomic(work + '/previous.json', sprintf('%J\n', entries));
}

/** @param {string} work @param {boolean} restore */
function install(work, restore) {
    let entries = json(text(work + (restore ? '/previous.json' : '/manifest.json')));
    let errors = [];
    for (let entry in entries) {
        try {
            if (restore && !entry.existed) {
                if (fs.stat(entry.path) && !fs.unlink(entry.path)) die(`cannot remove ${entry.path}`);
            }
            else atomic(entry.path, text(work + (restore ? '/previous' : '/files') + entry.path), entry.mode);
        }
        catch (e) { if (!restore) die(e.message); push(errors, e.message); }
    }
    if (length(errors)) die(join('; ', errors));
}

/** 删除已生效版本中不再使用的旧节点文件，禁用节点仍保留配置。 */
function cleanup(work, packageName, previous) {
    let current = read(packageName, work + '/config'), old = read(packageName, previous + '/config');
    let server = packageName == 'hijserver', kind = server ? 'server_node' : 'proxy_node';
    let keep = map(filter(current, section => section['.type'] == kind), section => nodeConfig(section, server));
    for (let section in filter(old, section => section['.type'] == kind)) {
        let path = nodeConfig(section, server);
        if (index(keep, path) < 0 && fs.stat(path) && !fs.unlink(path)) die(`cannot remove obsolete ${path}`);
    }
}

/** @param {string} packageName */
export function status(packageName) {
    if (packageName != 'hijpass' && packageName != 'hijserver') die('invalid service');
    let directory = `/tmp/${packageName}-service`, info = fs.lstat(directory);
    if (info && (info.type != 'directory' || info.uid != fs.stat('/proc/self').uid)) die('invalid service state directory');
    let content = fs.readfile(directory + '/status.json');
    return content ? json(content) : { state: 'idle' };
};

export function main() { run(ARGV, function(args) {
    let action = args[0], work = args[1], packageName = args[2];
    if (action == 'init') {
        let info = fs.lstat(work);
        if (info && (info.type != 'directory' || info.uid != fs.stat('/proc/self').uid)) die('invalid service state directory');
        if (!info && !fs.mkdir(work, 0o700)) die('cannot create service state directory');
        if (!fs.chmod(work, 0o700)) die('cannot protect service state directory');
    }
    else if (action == 'snapshot') snapshot(work, packageName);
    else if (action == 'publish') {
        let link = args[2] + '/active.next';
        fs.unlink(link);
        if (!fs.symlink(work, link) || !fs.rename(link, args[2] + '/active')) die('cannot publish running version');
    }
    else if (action == 'seal') seal(work, packageName);
    else if (action == 'cleanup') cleanup(work, packageName, args[3]);
    else if (action == 'backup') backup(work);
    else if (action == 'install' || action == 'restore') install(work, action == 'restore');
    else if (action == 'status') atomic(work + '/status.json', sprintf('%J\n', {
        state: args[2], phase: args[3], rollback: args[4] || 'none', updated: time(),
    }));
    else die('unknown transaction action');
}); };
