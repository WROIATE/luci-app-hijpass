#!/usr/bin/ucode -S
import { cursor } from 'uci';
import * as fs from 'fs';

// 安装专用：历史字段按 schema_version 分阶段转换；业务模块只读取当前格式。
// 版本号在全部迁移成功后提交；同版本重复安装跳过，失败则保留入口供重试。
const VERSION = '2';

/** @param {uci.cursor} ctx */
function migrateInitial(ctx) {
    // 迁移规则固定在安装脚本中，不依赖当前协议模型，避免业务扩展改变旧配置转换结果。
    const balanceKeys = [
        'url', 'interval', 'tolerance', 'idle_timeout', 'interrupt_exist_connections',
        'strategy', 'strategy_expected', 'strategy_max_rtt', 'strategy_tolerance', 'fallback_tag',
        'probe_url', 'probe_connectivity', 'probe_interval', 'probe_timeout', 'probe_sampling', 'probe_http_method',
    ];
    function list(value) { return type(value) == 'array' ? value : value ? [value] : []; }
    let shunt, dns, firewall, names = {}, ports = {};
    ctx.foreach('hijpass', null, s => {
        let id = s['.name'];
        if (s['.type'] == 'hijpass') {
            let path = s.firewall_template || s.nft;
            if (!path || index(['/etc/hijpass/fw4-template.nft', '/etc/hijpass/fw4-template.ut'], path) >= 0)
                path = '/etc/hijpass/firewall.ut';
            ctx.set('hijpass', id, 'firewall_template', path);
            ctx.delete('hijpass', id, 'nft');
            ctx.delete('hijpass', id, 'firewall_rules');
        }
        if (s['.type'] == 'proxy_node') {
            let mode = s.config_type || (s.core == 'custom' || s.type == 'custom' ? 'custom' : 'generated');
            ctx.set('hijpass', id, 'config_type', mode);
            if (mode == 'custom') {
                // 用户命令和配置文件保持原样；自定义配置不再声明核心或协议。
                ctx.delete('hijpass', id, 'core');
                ctx.delete('hijpass', id, 'type');
            }
            else if (!s.core || s.core == 'singbox') ctx.set('hijpass', id, 'core', 'sing-box');
        }
        if (s['.type'] == 'firewall') for (let key in [
            'pre_filter_hash', 'out_route_hash', 'tproxy_shunt_hash', 'tproxy_mark_hash',
            'proxy_port_filter_hash', 'dns_forward_hash', 'dns_forward_output_hash',
        ]) ctx.delete('hijpass', id, key);
        if (s.name) names[s.name] = true;
        for (let key in ['listen_port', 'socks_port', 'shunt_listen_port', 'dns_listen_port', 'cdg_port'])
            if (s[key]) ports[s[key]] = true;
        if (s['.type'] == 'shunt' && !shunt) shunt = s;
        if (s['.type'] == 'dns' && !dns) dns = s;
        if (s['.type'] == 'firewall' && !firewall) firewall = s;
    });
    // 迁移负载均衡时也避开服务端已声明的端口。
    if (ctx.load('hijserver')) ctx.foreach('hijserver', null, s => {
        for (let key in ['listen_port', 'socks_port']) if (s[key]) ports[s[key]] = true;
    });
    if (shunt && (!shunt.type || shunt.type == 'singbox')) ctx.set('hijpass', shunt['.name'], 'type', 'sing-box');
    if (dns) for (let key in ['direct_dns', 'proxy_dns'])
        if (dns[key] == 'system') ctx.set('hijpass', dns['.name'], key, 'dnsmasq');
    if (firewall && !firewall.proxy_local) ctx.set('hijpass', firewall['.name'], 'proxy_local', '0');
    if (shunt && length(list(shunt.lb_node_list))) {
        let name = 'load-balance', suffix = 2;
        while (names[name]) name = `load-balance-${suffix++}`;
        function available(start) {
            while (ports[start] && start <= 65535) start++;
            if (start > 65535) die('no available load balancing port');
            ports[start] = true;
            return `${start}`;
        }
        let listen = available(7890), socks = available(int(listen) + 1), id = ctx.add('hijpass', 'proxy_node');
        let options = {
            name, config_type: 'generated', type: 'load_balance', core: shunt.type == 'xray' ? 'xray' : 'sing-box', enabled: '1',
            listen_port: listen, socks_port: socks, log_level: 'info', member_node: list(shunt.lb_node_list),
            log_path: `/tmp/hijpass/log/${name}-${id}.log`,
        };
        for (let key in balanceKeys) if (shunt[key] != null) options[key] = shunt[key];
        for (let key, value in options) ctx.set('hijpass', id, key, value);
        ctx.foreach('hijpass', null, s => {
            for (let key in ['default_proxy_node', 'ruleset_out_node', 'proxy_node', 'proxy_node_v4', 'proxy_node_v6', 'dns_proxy_node'])
                if (s[key] == 'hijpass-slb') ctx.set('hijpass', s['.name'], key, name);
        });
        for (let key in ['lb_node_list', ...balanceKeys]) ctx.delete('hijpass', shunt['.name'], key);
    }
}

/** @param {uci.cursor} ctx */
function migrateHTTP(ctx) {
    ctx.foreach('hijpass', 'proxy_node', s => {
        if (s.config_type == 'custom' || s.core != 'xray' || s.type != 'vless' || s.transport_type != 'http') return;
        let id = s['.name'];
        // 只转换原先生效的 HTTP 字段；覆盖残留的 XHTTP 值，保持生成结果一致。
        ctx.set('hijpass', id, 'transport_type', 'xhttp');
        ctx.set('hijpass', id, 'transport_xhttp_mode', 'stream-one');
        for (let key in ['host', 'path', 'method'])
            ctx.set('hijpass', id, `transport_xhttp_${key}`, s[`transport_http_${key}`] || '');
        for (let key in ['host', 'path', 'method', 'idle_timeout', 'ping_timeout'])
            ctx.delete('hijpass', id, `transport_http_${key}`);
    });
}

/** @param {string} path */
function cleanLegacyCron(path) {
    let info = fs.stat(path);
    if (!info) return;
    if (info.type != 'file') die('cron path is not a file');
    let original = fs.readfile(path);
    if (type(original) != 'string') die('cannot read root crontab');
    const scripts = [
        '/usr/lib/hijpass/rules.sh', '/usr/lib/hijpass/rules.uc',
        '/usr/lib/hijpass/clean-service-log.sh', '/usr/lib/hijpass/clean-service-log.uc',
    ];
    let lines = [];
    for (let line in split(original, '\n')) {
        let fields = split(trim(line) || '', /[ \t]+/);
        // 普通任务的命令在五个时间字段之后；@reboot 等宏任务只有一个时间字段。
        // 只检查命令位，保留注释及其他任务参数中提到旧路径的文本。
        let position = substr(fields[0] || '', 0, 1) == '@' ? 1 : 5;
        if (index(scripts, fields[position]) >= 0) continue;
        push(lines, line);
    }
    let content = join('\n', lines);
    if (content == original) return;
    // 原地暂存并保留权限，写入失败时不替换正在使用的 crontab。
    let temp = `${path}.new-${fs.readlink('/proc/self')}`, file = fs.open(temp, 'wx');
    if (!file) die('cannot stage root crontab');
    try {
        if (!fs.chmod(temp, info.mode) || file.write(content) != length(content) || !file.flush())
            die('cannot write root crontab');
        file.close();
        if (!fs.rename(temp, path)) die('cannot replace root crontab');
    }
    catch (e) { file.close(); fs.unlink(temp); die(e.message); }
}

try {
    let directory;
    if (length(ARGV)) {
        if (length(ARGV) != 2 || ARGV[0] != '--configdir' || !ARGV[1])
            die('usage: migrate.uc [--configdir DIRECTORY]');
        directory = ARGV[1];
    }
    // 离线目录遵循 etc/config 与相邻 crontabs 的布局；delta 单独存放，避免文件锁冲突。
    if (directory) fs.mkdir(directory + '/.uci', 0o700);
    let ctx = cursor(directory, directory ? directory + '/.uci' : null);
    if (!ctx || !ctx.load('hijpass')) die('cannot load hijpass for migration');
    let global;
    ctx.foreach('hijpass', 'hijpass', s => { if (!global) global = s; });
    if (!global) die('hijpass global section is missing');
    let version = global.schema_version || '0';
    if (version == VERSION) exit(0);
    if (version != '0' && version != '1') die(`unsupported schema_version "${version}"`);
    if (version == '0') migrateInitial(ctx);
    migrateHTTP(ctx);
    cleanLegacyCron(directory ? fs.dirname(directory) + '/crontabs/root' : '/etc/crontabs/root');
    ctx.set('hijpass', global['.name'], 'schema_version', VERSION);
    if (!ctx.commit('hijpass')) die(`cannot commit hijpass migration: ${ctx.error()}`);
}
catch (e) { warn(e.message + '\n'); exit(1); }
