#!/usr/bin/ucode -S
import { cursor } from 'uci';
import { mkdir } from 'fs';

// 安装专用：只在当前配置首次采用新结构时转换旧字段，不被生成或启动模块导入。
// schema_version 只在全部转换成功并提交后写入，失败时保留安装入口供下次重试。
try {
    let directory;
    if (length(ARGV)) {
        if (length(ARGV) != 2 || ARGV[0] != '--configdir' || !ARGV[1])
            die('usage: migrate.uc [--configdir DIRECTORY]');
        directory = ARGV[1];
    }
    // 离线迁移允许指定 UCI 目录；delta 必须单独存放，避免锁住同一个文件。
    if (directory) mkdir(directory + '/.uci', 0o700);
    let ctx = cursor(directory, directory ? directory + '/.uci' : null);
    if (!ctx || !ctx.load('hijpass')) die('cannot load hijpass for migration');
    let global;
    ctx.foreach('hijpass', 'hijpass', s => { if (!global) global = s; });
    if (!global) die('hijpass global section is missing');
    if (global.schema_version == '1') exit(0);

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
    ctx.set('hijpass', global['.name'], 'schema_version', '1');
    if (!ctx.commit('hijpass')) die(`cannot commit hijpass migration: ${ctx.error()}`);
}
catch (e) { warn(e.message + '\n'); exit(1); }
