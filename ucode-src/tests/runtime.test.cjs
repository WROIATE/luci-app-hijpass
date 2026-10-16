const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawnSync } = require('node:child_process');
const { root, run, runShell, withConfig } = require('./helpers.cjs');

function invoke(request, env) {
    const extra = env ? { env: { ...process.env, ...env } } : {};
    if (request.action === 'connect') return runShell('root/usr/lib/hijpass/network/network.sh',
        ['connect', request.url, request.timeout || '5'], extra);
    if (request.action === 'update') return withConfig(request.sections, directory =>
        runShell('root/usr/lib/hijpass/rules/update.sh', [request.group, '--configdir', directory], extra));
    if (request.action === 'clean-log') return withConfig(request.sections, directory =>
        runShell('root/usr/lib/hijpass/maintenance/logs.sh', [request.operation, ...(request.path ? [request.path] : []), '--configdir', directory], extra));
    if (request.action === 'cleanup') {
        const directory = fs.mkdtempSync('/tmp/hijpass-cleanup-test-');
        const target = request.sections[0].client_dir;
        script(directory, 'uci', 'printf "%s\\n" "$CLEANUP_TEST_DIRECTORY"');
        try {
            return runShell('root/usr/lib/hijpass/maintenance/cleanup.sh',
                [request.kind, request.id, request.name || ''],
                { env: { ...process.env, PATH: directory + ':' + process.env.PATH, CLEANUP_TEST_DIRECTORY: target } });
        } finally { fs.rmSync(directory, { recursive: true, force: true }); }
    }
    return run('ucode-src/tests/runtime.uc', [], request, env ? { env: { ...process.env, ...env } } : {});
}
function value(request, env) {
    const result = invoke(request, env);
    if ((request.action === 'update' || request.action === 'connect') && result.stdout) {
        const report = JSON.parse(result.stdout);
        assert.equal(result.status, report.success ? 0 : report.exit_code || 1, result.stderr);
        return report;
    }
    assert.equal(result.status, 0, result.stderr);
    if (!result.stdout) return true;
    return JSON.parse(result.stdout);
}
function fixture(t) {
    const directory = fs.mkdtempSync('/tmp/hijpass-runtime-test-');
    t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
    return directory;
}
function script(directory, name, body) {
    fs.writeFileSync(path.join(directory, name), '#!/bin/sh\n' + body + '\n', { mode: 0o755 });
}
function node(id, options = {}) {
    return { '.name': id, '.type': 'proxy_node', name: id, enabled: '1', core: 'sing-box', type: 'shadowsocks',
        server: '192.0.2.10', server_port: '443', listen_port: '10001', socks_port: '10002', ...options };
}
const global = { '.name': 'global', '.type': 'hijpass', enabled: '1' };

// 模拟内核路由状态，执行真实 route.sh；不触碰宿主机的路由或规则。
function routeFixture(t) {
    const directory = fixture(t), state = path.join(directory, 'state'), calls = path.join(directory, 'calls');
    fs.writeFileSync(path.join(directory, 'ip'), '#!' + process.execPath + '\n' + String.raw`
const fs = require('node:fs');
const [family, kind, action, ...args] = process.argv.slice(2);
fs.appendFileSync(process.env.ROUTE_TEST_CALLS, JSON.stringify(process.argv.slice(2)) + '\n');
if (process.env.ROUTE_TEST_FAIL === [family, kind, action].join(' ')) process.exit(5);
const state = JSON.parse(fs.readFileSync(process.env.ROUTE_TEST_STATE));
const entries = state[family]?.[kind];
if (!entries || !['add', 'del'].includes(action)) process.exit(2);
const key = args.join(' '), position = entries.indexOf(key);
if (action === 'del') {
    if (position < 0) process.exit(1);
    entries.splice(position, 1);
} else {
    if (position >= 0) process.exit(2);
    entries.push(key);
}
fs.writeFileSync(process.env.ROUTE_TEST_STATE, JSON.stringify(state));
`, { mode: 0o755 });
    const env = { ...process.env, PATH: directory + ':' + process.env.PATH, ROUTE_TEST_STATE: state, ROUTE_TEST_CALLS: calls };
    return {
        write: value => fs.writeFileSync(state, JSON.stringify(value)),
        read: () => JSON.parse(fs.readFileSync(state)),
        calls: () => fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse) : [],
        run: (args, failure) => spawnSync(path.join(root, 'root/usr/lib/hijpass/firewall/route.sh'), args,
            { encoding: 'utf8', env: { ...env, ROUTE_TEST_FAIL: failure || '' } }),
    };
}

test('路由脚本重复重置或移除时仅修改 Hijpass 的 IPv4/IPv6 路由', t => {
    const route = routeFixture(t), ownRule = 'fwmark 0x1 table 233', ownRoute = 'local default dev lo table 233';
    const foreignRule = 'fwmark 0x2 table 234', foreignRoute = 'local default dev lo table 234';
    route.write(Object.fromEntries(['-4', '-6'].map(family => [family,
        { rule: [foreignRule, ownRule, ownRule], route: [foreignRoute, ownRoute] }])));
    for (const action of ['reset', 'reset', 'remove', 'remove']) {
        const result = route.run([action]);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, '');
        const expected = { rule: [foreignRule], route: [foreignRoute] };
        if (action === 'reset') { expected.rule.push(ownRule); expected.route.push(ownRoute); }
        assert.deepEqual(route.read(), { '-4': expected, '-6': expected });
    }
});

test('路由脚本拒绝无效动作，添加失败时停止并返回命令错误', t => {
    const route = routeFixture(t);
    route.write({ '-4': { rule: [], route: [] }, '-6': { rule: [], route: [] } });
    for (const args of [[], ['flush'], ['reset', '233']]) {
        assert.equal(route.run(args).status, 1);
        assert.deepEqual(route.calls(), []);
    }
    const result = route.run(['reset'], '-4 route add');
    assert.equal(result.status, 5);
    assert.deepEqual(route.read(), { '-4': { rule: [], route: [] }, '-6': { rule: [], route: [] } });
    assert.equal(route.calls().some(args => args[0] === '-6' || args[1] === 'rule' && args[2] === 'add'), false);
});

test('firewall handles shipped comma protocols, DNS/local toggles and removes dangling references', t => {
    const directory = fixture(t), ip = path.join(directory, 'ips');
    fs.writeFileSync(ip, '192.0.2.0/24\n2001:db8::/32\ninvalid\n192.0.2.0/99\n');
    const state = { wan: ['pppoe-wan'], local4: ['192.168.1.1/24'], local6: ['fe80::1/64'], dns4: ['1.1.1.1'], dns6: [] };
    const firewall = { '.name': 'fw', '.type': 'firewall', shunt_port: '18081', tproxy_proto: 'tcp,udp', proxy_local: '0', acl_default_allow: '1' };
    const dns = { '.name': 'dns', '.type': 'dns', dns_service: 'chinadns-ng', cdg_port: '53653' };
    for (const forward of ['none', 'pre-routing', 'routing']) for (const local of ['0', '1']) {
        const result = value({ action: 'firewall', templatePath: path.join(root, 'root/etc/hijpass/firewall.ut'), state,
            sections: [{ ...global, ip_direct: ip }, { ...firewall, dns_forward: forward, proxy_local: local }, dns,
                { '.type': 'shunt', enabled: '1', dns_listen_port: '10153' }] });
        assert.match(result, /meta l4proto != \{ tcp, udp \}/);
        assert.doesNotMatch(result, /\bdefine\b|\$[A-Z_]+/);
        assert.doesNotMatch(result, /^\s*#/m);
        assert.doesNotMatch(result, /elements = \{\s*\}/);
        assert.equal(result.includes('chain dns-forward {'), forward !== 'none');
        assert.equal(result.includes('chain dns-forward-output {'), forward !== 'none' && local === '1');
        assert.equal(result.includes('chain out-route {'), local === '1');
        assert.match(result, /192\.0\.2\.0\/24/);
        assert.doesNotMatch(result, /invalid|192\.0\.2\.0\/99/);
        const sets = new Set([...result.matchAll(/^[ \t]*set (\S+)/gm)].map(m => m[1]));
        for (const m of result.matchAll(/@(\w+)/g)) assert.ok(sets.has(m[1]), 'missing set ' + m[1]);
        fs.writeFileSync(path.join(directory, 'test.nft'), result);
        // nft parses without applying rules; hosts lacking netlink privileges still report grammar errors.
        const check = spawnSync('nft', ['-c', '-f', path.join(directory, 'test.nft')], { encoding: 'utf8' });
        if (!check.error) assert.doesNotMatch(check.stderr, /syntax error/);
    }
    const rejected = invoke({ action: 'firewall', templatePath: path.join(root, 'root/etc/hijpass/firewall.ut'), state,
        sections: [global, { ...firewall, proxy_iface_list: ['br-lan;flush ruleset'] }, dns] });
    assert.notEqual(rejected.status, 0);
});

test('service plans preserve argv, custom config paths, environments and nesting users', t => {
    const directory = fixture(t);
    const sections = [{ ...global, client_dir: directory }, node('sb', { name: 'space name', procd_env: ['A=a b', 'B=two'] }),
        node('xr', { core: 'xray', listen_port: '10003', socks_port: '10004', nest_proxy: '1' }),
        node('custom', { core: 'custom', type: 'custom', command: 'program --conf {conf_path}' }),
        node('off', { enabled: '0' })];
    const result = value({ action: 'plan', sections });
    assert.equal(result.instances.length, 3);
    assert.deepEqual(result.instances[0].command, ['sing-box', '-c', directory + '/space name-sb.json', 'run']);
    assert.deepEqual(result.instances[0].env, ['A=a b', 'B=two']);
    assert.equal(result.instances[0].user, 'hijpass');
    assert.equal(result.instances[1].user, 'root');
    assert.equal(result.instances[2].command[2], `program --conf '${directory}/custom-custom.json'`);
    assert.deepEqual(value({ action: 'plan', sections: [{ ...global, enabled: '0' }] }), { instances: [] });
    assert.notEqual(invoke({ action: 'plan', sections: [global, node('bad', { name: '../file' })] }).status, 0);
    assert.notEqual(invoke({ action: 'plan', sections: [global, node('bad', { procd_env: ['bad entry'] })] }).status, 0);
});

test('server plan validates allowed ports and leaves manually edited JSON untouched', t => {
    const directory = fixture(t);
    const file = path.join(directory, 'server-a.json'); fs.writeFileSync(file, 'custom JSON');
    const sections = [{ '.type': 'hijserver', enabled: '1', server_dir: directory },
        { '.name': 'a', '.type': 'server_node', enabled: '1', name: 'server', command: 'server -c {conf_path}', allow_firewall: '1', listen_port: '443' }];
    const result = value({ action: 'server-plan', sections });
    assert.deepEqual(result.ports, [443]);
    assert.equal(fs.readFileSync(file, 'utf8'), 'custom JSON');
    sections[1].listen_port = '0';
    assert.notEqual(invoke({ action: 'server-plan', sections }).status, 0);
});

test('native configuration writes are private and staging failure preserves every existing file', t => {
    const directory = fixture(t), client = path.join(directory, 'client'); fs.mkdirSync(client);
    const custom = path.join(client, 'manual-c.json'); fs.writeFileSync(custom, 'manual');
    const sections = [{ ...global, client_dir: client, shunt_conf: path.join(directory, 'shunt.json') }, node('a'),
        node('c', { name: 'manual', core: 'custom', type: 'custom', listen_port: '10003', socks_port: '10004' })];
    const result = value({ action: 'write', sections });
    assert.equal(result.length, 1);
    const file = path.join(client, 'a-a.json'), original = fs.readFileSync(file, 'utf8');
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.readFileSync(custom, 'utf8'), 'manual');
    const generated = { nodes: { a: { changed: true } }, shunt: { outbounds: [] } };
    const failed = invoke({ action: 'write', sections: [{ ...sections[0], shunt_conf: file + '/blocked.json' }, ...sections.slice(1)], generated });
    assert.notEqual(failed.status, 0);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
    assert.equal(fs.readdirSync(client).some(name => name.includes('.new-')), false);
});

test('native UCI migration is idempotent and moves legacy balance references without resetting fields', t => {
    const directory = fixture(t);
    fs.writeFileSync(path.join(directory, 'hijpass'), `config hijpass 'global'\n option enabled '1'\n option nft '/etc/hijpass/fw4-template.nft'\nconfig proxy_node 'a'\n option name 'member'\n option core 'singbox'\n option listen_port '7890'\n option socks_port '7891'\nconfig shunt 's'\n option type 'singbox'\n list lb_node_list 'member'\n option default_proxy_node 'hijpass-slb'\n option lb_strategy 'urltest'\nconfig dns 'dns'\n option direct_dns 'system'\nconfig firewall 'fw'\n`);
    const result = value({ action: 'migrate', directory });
    assert.equal(result.find(s => s['.name'] === 'global').firewall_template, '/etc/hijpass/firewall.ut');
    assert.equal(result.find(s => s['.name'] === 'global').nft, undefined);
    const balance = result.find(s => s.type === 'load_balance');
    assert.equal(balance.listen_port, '7892'); assert.equal(balance.socks_port, '7893');
    assert.deepEqual(balance.member_node, ['member']);
    assert.equal(result.find(s => s['.name'] === 's').default_proxy_node, balance.name);
    assert.equal(result.find(s => s['.name'] === 'a').core, 'sing-box');
    assert.equal(result.find(s => s['.name'] === 'dns').direct_dns, 'dnsmasq');
    assert.equal(result.find(s => s['.name'] === 'fw').proxy_local, '0');
    const text = fs.readFileSync(path.join(directory, 'hijpass'), 'utf8');
    value({ action: 'migrate', directory });
    assert.equal(fs.readFileSync(path.join(directory, 'hijpass'), 'utf8'), text);
    fs.writeFileSync(path.join(directory, 'hijpass'), text.replace('/etc/hijpass/firewall.ut', '/custom/firewall.ut'));
    assert.equal(value({ action: 'migrate', directory }).find(s => s['.name'] === 'global').firewall_template, '/custom/firewall.ut');
});

test('domain/IP normalization and CIDR lookup use native address validation', () => {
    assert.deepEqual(value({ action: 'normalize', kind: 'domain', text: 'server=/Example.org/1.1.1.1\n+.example.net\n@@||allowed.org^\nfull:exact.com\n! comment\ninvalid\n' }), ['allowed.org', 'exact.com', 'example.net', 'example.org']);
    assert.deepEqual(value({ action: 'normalize', kind: 'ip6', text: '2001:db8::/32\n2001:db8::/129\ninvalid\n' }), ['2001:db8::/32']);
    assert.deepEqual(value({ action: 'contains', cases: [['192.0.2.5', '192.0.2.0/24'], ['192.0.3.1', '192.0.2.0/24'],
        ['2001:db8::123', '2001:db8::/32'], ['2001:db9::1', '2001:db8::/32'], ['::1', '::/invalid']] }), [true, false, true, false, false]);
});

test('rule updates preserve old files on HTTP/format failure and merge valid sources', t => {
    const directory = fixture(t), file = path.join(directory, 'domains'); fs.writeFileSync(file, 'old.example.org\n');
    const env = { PATH: directory + ':' + process.env.PATH };
    script(directory, 'curl', 'exit 22');
    const sections = [{ ...global, chn_list: file, enabled: '0' }, { '.type': 'rule', retry_count: '1', chn_domain_list: ['https://example.org/1', 'https://example.org/2'] }];
    assert.equal(value({ action: 'update', sections, group: 'chnlist' }, env).success, false);
    assert.equal(fs.readFileSync(file, 'utf8'), 'old.example.org\n');
    script(directory, 'curl', `while [ "$#" -gt 0 ]; do if [ "$1" = -o ]; then output=$2; shift; fi; shift; done\nprintf '%s\\n' 'not a domain' 'some HTML error text' >"$output"`);
    assert.equal(value({ action: 'update', sections, group: 'chnlist' }, env).success, false);
    assert.equal(fs.readFileSync(file, 'utf8'), 'old.example.org\n');
    script(directory, 'curl', `while [ "$#" -gt 0 ]; do if [ "$1" = -o ]; then output=$2; shift; fi; shift; done\ni=0; while [ "$i" -lt 10 ]; do echo server=/example.org/1.1.1.1; i=$((i+1)); done >"$output"`);
    assert.equal(value({ action: 'update', sections, group: 'chnlist' }, env).success, true);
    assert.equal(fs.readFileSync(file, 'utf8'), 'example.org\n');
});

test('subprocess arguments and connection JSON survive quotes and reject malformed timeouts', t => {
    const directory = fixture(t), valueWithQuotes = "a 'quote'; $(touch " + directory + "/injected)";
    const command = value({ action: 'command', args: ['printf', '%s', valueWithQuotes] });
    const quoted = spawnSync('/bin/sh', ['-c', command], { encoding: 'utf8' });
    assert.deepEqual({ code: quoted.status, stdout: quoted.stdout }, { code: 0, stdout: valueWithQuotes });
    assert.equal(fs.existsSync(path.join(directory, 'injected')), false);
    script(directory, 'curl', "printf '204\\n192.0.2.1\\n443\\n0.001\\n0.002\\n0.003\\n0.004\\n0.005\\n'");
    const result = value({ action: 'connect', url: 'https://example.org', timeout: '5' }, { PATH: directory + ':' + process.env.PATH });
    assert.equal(result.total_time_ms, 5); assert.equal(result.server_processing_time_ms, 4); assert.equal(result.success, true);
    assert.notEqual(invoke({ action: 'connect', url: 'https://example.org', timeout: '5oops' }).status, 0);
});

test('file cleanup matches exact section suffix and log truncation keeps the last 30000 lines', t => {
    const directory = fixture(t), keep = path.join(directory, 'new-a.json');
    for (const name of ['old-a.json', 'new-a.json', 'other-aa.json']) fs.writeFileSync(path.join(directory, name), name);
    value({ action: 'cleanup', sections: [{ ...global, client_dir: directory }], kind: 'proxy', id: 'a', name: 'new' });
    assert.deepEqual(fs.readdirSync(directory).sort(), ['new-a.json', 'other-aa.json']);
    const log = path.join(directory, 'service.log'); fs.writeFileSync(log, Array.from({ length: 30005 }, (_, i) => i + '\n').join(''));
    value({ action: 'clean-log', sections: [{ log_path: log }], operation: 'hijpass' });
    const contents = fs.readFileSync(log, 'utf8'); assert.ok(contents.startsWith('5\n')); assert.ok(contents.endsWith('30004\n'));
    assert.equal(contents.split('\n').length, 30001);
});

test('native TCP port lookup sees actual host listeners', async t => {
    const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const port = String(server.address().port);
    const result = run('root/usr/lib/hijpass/network/network.sh', ['port', port]);
    assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout)[port], true);
});

test('capture parsing rejects injected/invalid targets and counts TCP payload without counting UDP bytes', () => {
    const config = value({ action: 'trace-parse', args: ['https://[2001:db8::1]:8443/a?b=1'] });
    assert.equal(config.host, '2001:db8::1'); assert.equal(config.targetPort, 8443);
    for (const args of [['-c', '::1;id'], ['-c', '2001:::1'], ['-c', '192.0.2.1', '-P', '0'], ['https://bad;id'], ['https://example.org:65536']])
        assert.notEqual(invoke({ action: 'trace-parse', args }).status, 0);
    const summary = value({ action: 'packet-summary', packets: ['1.0 br-lan In IP 192.0.2.1.1 > 1.1.1.1.443: Flags [S], length 0',
        '1.1 br-lan In IP 192.0.2.1.1 > 1.1.1.1.443: Flags [P.], length 42', '1.2 br-lan In IP 192.0.2.1.1 > 1.1.1.1.53: UDP, length 20'] });
    assert.equal(summary.counts.syn, 1); assert.equal(summary.counts.payload_bytes, 42); assert.equal(summary.counts.udp, 1);
});

test('client report uses IP addresses when nft includes Ethernet headers and excludes foreign trace IDs', t => {
    const directory = fixture(t);
    fs.writeFileSync(path.join(directory, 'nft.trace'), 'trace id 123 inet hijpass trace-1 packet: ether saddr 02:00:00:00:00:01 ether daddr 02:00:00:00:00:02 ip saddr 192.0.2.10 ip daddr 8.8.8.8 udp sport 50000 udp dport 53\n' +
        'trace id 123 inet hijpass trace-1 rule meta nftrace set 1\ntrace id 999 inet hijpass other packet: ip saddr 192.0.2.99\n');
    const result = value({ action: 'trace-report', directory, capture: { mode: 'client', client: '192.0.2.10', chain: 'trace-1', comment: 'hijpass-trace-1', addresses: [], protocol: 'udp', port: '53', seconds: 2 } });
    assert.match(result, /udp \[192\.0\.2\.10\]:50000 -> \[8\.8\.8\.8\]:53/);
    assert.doesNotMatch(result, /02:00:00:00:00|192\.0\.2\.99/);
});

test('文本工具正常退出，参数错误保持 JSON 工具的错误契约', t => {
    for (const [address, family] of [['192.0.2.1', '4\n'], ['2001:db8::1/64', '6\n']]) {
        const result = run('root/usr/lib/hijpass/network/network.sh', ['iptype', address]);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, family);
        assert.equal(result.stderr, '');
    }
    const directory = fixture(t);
    fs.writeFileSync(path.join(directory, 'hijpass'), "config hijpass 'global'\n option delay_time '7'\n");
    const delay = run('root/usr/lib/hijpass/service/service.sh', ['delay', '--configdir', directory]);
    assert.equal(delay.status, 0, delay.stderr);
    assert.equal(delay.stdout, '7\n');
    const invalid = run('root/usr/lib/hijpass/network/network.sh', ['resolve', 'example.org', '--configdir']);
    assert.equal(invalid.status, 1);
    assert.match(JSON.parse(invalid.stdout).error, /missing --configdir/);
    assert.equal(invalid.stderr, '');
});

test('启用防火墙时，缺失模板不会生成缺少规则的配置', t => {
    const directory = fixture(t);
    const result = invoke({ action: 'firewall', templatePath: path.join(directory, 'missing'),
        state: { wan: [], local4: [], local6: [], dns4: [], dns6: [] },
        sections: [global, { '.type': 'firewall', proxy_port: '10001', tproxy_proto: 'tcp' }] });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /template/);
    assert.equal(result.stdout, '');
});

test('捕获元数据缺失或损坏时仍删除临时 nft 规则与任务目录', t => {
    const directory = fixture(t), commands = path.join(directory, 'commands');
    script(directory, 'nft', `printf '%s\\n' "$*" >>"$TRACE_TEST_LOG"
case "$*" in
    '-a list chain inet hijpass pre-filter')
        printf 'meta nftrace set 1 comment "hijpass-trace-%s" # handle 42\\n' "$TRACE_TEST_PID" ;;
esac`);
    for (const [i, metadata] of [undefined, '{broken', '{}'].entries()) {
        const pid = `${process.pid}99${i}`, capture = '/tmp/hijpass-trace.' + pid;
        fs.mkdirSync(capture, { mode: 0o700 });
        t.after(() => fs.rmSync(capture, { recursive: true, force: true }));
        if (metadata !== undefined) fs.writeFileSync(path.join(capture, 'metadata.json'), metadata);
        fs.writeFileSync(commands, '');
        const result = run('root/usr/lib/hijpass/diagnostics/capture.sh', ['finish', capture], undefined,
            { env: { ...process.env, PATH: directory + ':' + process.env.PATH, TRACE_TEST_LOG: commands, TRACE_TEST_PID: pid } });
        assert.equal(result.status, 1);
        assert.ok(result.stderr);
        const calls = fs.readFileSync(commands, 'utf8');
        assert.ok(calls.includes('delete chain inet hijpass trace-' + pid));
        assert.ok(calls.includes('delete rule inet hijpass pre-filter handle 42'));
        assert.equal(fs.existsSync(capture), false);
    }
});

test('核心版本查询将损坏的上游 JSON 转为带来源的错误', t => {
    const directory = fixture(t), env = { ...process.env, PATH: directory + ':' + process.env.PATH };
    for (const response of ['{broken', 'null', '[]', '{}']) {
        script(directory, 'curl', `printf '%s' '${response}'`);
        const result = run('root/usr/lib/hijpass/core/update.sh', ['latest', 'xray'], undefined, { env });
        assert.equal(result.status, 1);
        assert.match(JSON.parse(result.stdout).error, /invalid xray release response/);
        assert.equal(result.stderr, '');
    }
    script(directory, 'curl', `printf '%s' '{"tag_name":"v1.2.3","assets":[]}'`);
    const result = run('root/usr/lib/hijpass/core/update.sh', ['latest', 'xray'], undefined, { env });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { core: 'xray', version: 'v1.2.3' });
});

test('规则下载拒绝非整数参数，校验失败时保留原文件且不执行 curl', t => {
    const directory = fixture(t), file = path.join(directory, 'domains'), calls = path.join(directory, 'curl-calls');
    fs.writeFileSync(file, 'old.example.org\n');
    script(directory, 'curl', 'printf called >>"$RULE_TEST_CALLS"\nexit 22');
    const env = { PATH: directory + ':' + process.env.PATH, RULE_TEST_CALLS: calls };
    const invalid = [
        { download_timeout: 'invalid' }, { download_timeout: '3oops' },
        { download_timeout: '1.5' }, { download_timeout: '0' }, { download_timeout: '601' },
        { retry_count: 'invalid' }, { retry_count: '1oops' },
        { retry_count: '-1' }, { retry_count: '11' },
    ];
    for (const options of invalid) {
        const sections = [{ ...global, enabled: '0', chn_list: file },
            { '.type': 'rule', download_timeout: '30', retry_count: '1',
                chn_domain_list: ['https://example.org/domains'], ...options }];
        const result = invoke({ action: 'update', sections, group: 'chnlist' }, env);
        assert.notEqual(result.status, 0, JSON.stringify(options));
        assert.match(result.stderr, /invalid download timeout or retry count/);
        assert.equal(fs.readFileSync(file, 'utf8'), 'old.example.org\n');
        assert.equal(fs.existsSync(calls), false);
    }
});

test('连接失败的 curl 输出仍转换为完整报告，核心与诊断命令拒绝缺失参数', t => {
    const directory = fixture(t);
    script(directory, 'curl', "printf '000\\n\\n0\\n0.001\\n0.002\\n0.003\\n0.004\\n0.005\\n'\nexit 28");
    const result = value({ action: 'connect', url: 'https://example.org', timeout: '5' },
        { PATH: directory + ':' + process.env.PATH });
    assert.equal(result.success, false);
    assert.equal(result.exit_code, 28);
    assert.equal(result.http_code, 0);
    assert.equal(result.remote_ip, '');
    assert.equal(result.total_time_ms, 5);
    for (const args of [[], ['latest']]) {
        const missing = run('root/usr/lib/hijpass/core/update.sh', args);
        assert.equal(missing.status, 1);
        assert.match(JSON.parse(missing.stdout).error, /core action and name are required/);
    }
    for (const args of [['prepare'], ['report']]) {
        const missing = run('root/usr/lib/hijpass/diagnostics/capturecli.uc', args);
        assert.equal(missing.status, 1);
        assert.match(missing.stderr, /invalid capture (PID|directory)/);
        assert.equal(missing.stdout, '');
    }
});

test('UCI 读取仅返回原生字段，业务类型和协议校验由生成阶段处理', t => {
    const directory = fixture(t);
    fs.writeFileSync(path.join(directory, 'hijpass'), `config hijpass
 option enabled '0'
 option description 'a name with spaces'
config proxy_node 'sample'
 option enabled '1'
 option type 'hysteria2'
 option core 'sing-box'
 option server 'example.org'
 option server_port 'not-a-port'
 option listen_port '10001'
 option socks_port '10002'
 list server_ports '443-445'
 list server_ports '8443'
 list server_ports '443-445'
`);
    const sections = value({ action: 'read', directory });
    assert.deepEqual(sections.map(s => s['.type']), ['hijpass', 'proxy_node']);
    assert.deepEqual(sections.map(s => s['.index']), [0, 1]);
    assert.equal(sections[0]['.anonymous'], true);
    assert.equal(typeof sections[0]['.name'], 'string');
    assert.equal(sections[0].enabled, '0');
    assert.equal(sections[0].description, 'a name with spaces');
    assert.equal(sections[1]['.name'], 'sample');
    assert.equal(sections[1]['.anonymous'], false);
    assert.equal(sections[1].server_port, 'not-a-port');
    assert.equal(sections[1].listen_port, '10001');
    assert.deepEqual(sections[1].server_ports, ['443-445', '8443', '443-445']);
    const rendered = run('root/usr/bin/hijpass-config', ['render', '--configdir', directory]);
    assert.equal(rendered.status, 1);
    assert.match(rendered.stderr, /invalid port/);
    assert.equal(rendered.stdout, '');
});

// 白名单为接口或 MAC 命中，不可因任一列表为空而放行所有客户端。
test('空静态列表省略集合与规则，ACL 空白名单明确返回，动态 DNS 集合继续保留', () => {
    const state = { wan: [], local4: [], local6: [], dns4: [], dns6: [] };
    for (const [interfaces, macs] of [[[], []], [['lo'], []], [[], ['02:00:00:00:00:01']], [['lo'], ['02:00:00:00:00:01']]]) {
        const result = value({ action: 'firewall', templatePath: path.join(root, 'root/etc/hijpass/firewall.ut'), state,
            sections: [global, { '.type': 'firewall', proxy_port: '10001', tproxy_proto: 'tcp', dns_forward: 'pre-routing',
                proxy_iface_list: interfaces, proxy_mac_list: macs, use_chnroute: '1' },
                { '.type': 'dns', dns_service: 'chinadns-ng', cdg_port: '53653', use_chn: '1', use_gfw: '1' }] });
        assert.doesNotMatch(result, /@(bypass|proxy)[46]list|set (bypass|proxy)[46]list|proxy_interface_list|proxy_mac_list/);
        for (const set of ['chnroute', 'chn', 'gfw', 'dnsproxy', 'dnsbypass'])
            for (const version of [4, 6]) assert.ok(result.includes('set ' + set + version + 'list {'));
        for (const name of ['pre-filter', 'dns-forward']) {
            const body = result.split('chain ' + name + ' {')[1].split(/\n[ \t]*\}/)[0];
            const rule = interfaces.length && macs.length ? /iif != \{ "lo" \} ether saddr != \{ 02:00:00:00:00:01 \} counter return/
                : interfaces.length ? /iif != \{ "lo" \} counter return/
                : macs.length ? /ether saddr != \{ 02:00:00:00:00:01 \} counter return/ : /^[ \t]*counter return$/m;
            assert.match(body, rule);
        }
    }
});

test('单文件模板完整控制表和链，空输出不能关闭已启用的防火墙', t => {
    const directory = fixture(t), template = path.join(directory, 'firewall.ut');
    const request = { action: 'firewall', templatePath: template,
        state: { wan: [], local4: [], local6: [], dns4: [], dns6: [] },
        sections: [global, { '.type': 'firewall', proxy_port: '10001', tproxy_proto: 'tcp', proxy_local: '0' }] };
    fs.writeFileSync(template, 'table inet hijpass { chain edited { tcp dport {{ options.proxyPort }} accept } }\n');
    const result = value(request);
    assert.match(result, /chain edited.*tcp dport 10001 accept/);
    assert.doesNotMatch(result, /chain pre-filter|chain out-route/);
    for (const empty of ['', '{# comment only #}']) {
        fs.writeFileSync(template, empty);
        const failed = invoke(request);
        assert.notEqual(failed.status, 0);
        assert.match(failed.stderr, /rendered no rules/);
    }
});

test('迁移保留旧自定义整表路径，并清理旧路径字段', t => {
    const directory = fixture(t), template = path.join(directory, 'custom.ut');
    fs.writeFileSync(template, 'table inet hijpass { chain custom {} }\n');
    fs.writeFileSync(path.join(directory, 'hijpass'), `config hijpass 'global'\n option nft '${template}'\n option firewall_rules '/custom/chains'\n`);
    const sections = value({ action: 'migrate', directory });
    assert.equal(sections[0].firewall_template, template);
    assert.equal(sections[0].nft, undefined);
    assert.equal(sections[0].firewall_rules, undefined);
    assert.match(value({ action: 'firewall', sections: [...sections, { '.type': 'firewall', proxy_port: '10001', tproxy_proto: 'tcp' }],
        state: { wan: [], local4: [], local6: [], dns4: [], dns6: [] } }), /chain custom/);
});
