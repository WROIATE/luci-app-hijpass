const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { root, interpreter, shellRuntime, withConfig } = require('./helpers.cjs');

// 只在安装副本中替换系统路径，生产代码不增加测试开关或模拟逻辑。
function fixture(t) {
    const directory = fs.mkdtempSync('/tmp/hijpass-execution-test-');
    const runtime = path.join(directory, 'runtime');
    const sourceRuntime = shellRuntime();
    fs.cpSync(sourceRuntime, runtime, { recursive: true });
    // 各场景使用独立的安装副本，避免路径仍指向共享测试目录。
    for (const file of fs.readdirSync(runtime, { recursive: true })) if (file.endsWith('.sh') || file.endsWith('.uc')) {
        const target = path.join(runtime, file);
        fs.writeFileSync(target, fs.readFileSync(target, 'utf8').replaceAll(sourceRuntime, runtime));
    }
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    function patch(file, before, after) {
        const target = path.join(runtime, file);
        fs.writeFileSync(target, fs.readFileSync(target, 'utf8').replaceAll(before, after));
    }
    function script(name, body) {
        fs.writeFileSync(path.join(directory, name), '#!/bin/sh\n' + body + '\n', { mode: 0o755 });
    }
    function run(file, args, extra = {}) {
        return spawnSync('/usr/bin/busybox', ['ash', path.join(runtime, file), ...args], {
            encoding: 'utf8', env: { ...process.env, ...extra,
                PATH: `${directory}:${runtime}/testbin:${process.env.PATH}` },
        });
    }
    function data(file, args) {
        return spawnSync(interpreter, ['-S', '-L', path.join(root, 'root/usr/share/ucode'), '--', path.join(runtime, file), ...args],
            { encoding: 'utf8', env: process.env });
    }
    return { directory, runtime, patch, script, run, data };
}

test('Geo 更新验证下载内容，失败保留旧库，有效备用来源才替换', t => {
    const f = fixture(t), target = path.join(f.directory, 'v2ray');
    fs.mkdirSync(target);
    f.patch('rules/rules.uc', '/usr/share/v2ray', target);
    for (const database of ['geoip', 'geosite']) fs.writeFileSync(path.join(target, database + '.dat'), 'old-' + database);
    const invalid = path.join(f.directory, 'invalid'), valid = path.join(f.directory, 'valid');
    fs.writeFileSync(invalid, '<html>' + 'error'.repeat(50) + '</html>');
    fs.writeFileSync(valid, 'verified-database'.repeat(20));
    f.script('curl', `while [ "$1" != -o ]; do shift; done
output=$2
shift 2
[ "$1" != -- ] || shift
case "$1" in
    *invalid) cp "$INVALID_DOWNLOAD" "$output" ;;
    *valid) cp "$VALID_DOWNLOAD" "$output" ;;
    *) exit 22 ;;
esac`);
    f.script('geoview', `while [ "$1" != -input ]; do shift; done
cmp -s "$2" "$VALID_DOWNLOAD"`);
    const sections = [{ '.type': 'hijpass', enabled: '0' },
        { '.type': 'rule', retry_count: '1', geoip: ['https://example.org/invalid'], geosite: ['https://example.org/invalid'] }];
    const env = { INVALID_DOWNLOAD: invalid, VALID_DOWNLOAD: valid };
    withConfig(sections, config => {
        const failed = f.run('rules/update.sh', ['geo', '--configdir', config], env);
        assert.equal(failed.status, 1, failed.stderr);
        assert.deepEqual(JSON.parse(failed.stdout), { success: false, failed: ['geoip', 'geosite'] });
        for (const database of ['geoip', 'geosite']) assert.equal(fs.readFileSync(path.join(target, database + '.dat'), 'utf8'), 'old-' + database);
    });
    sections[1].geoip.push('https://example.org/valid');
    sections[1].geosite.push('https://example.org/valid');
    withConfig(sections, config => {
        const updated = f.run('rules/update.sh', ['geo', '--configdir', config], env);
        assert.equal(updated.status, 0, updated.stderr);
        assert.deepEqual(JSON.parse(updated.stdout), { success: true });
        for (const database of ['geoip', 'geosite']) {
            const file = path.join(target, database + '.dat');
            assert.equal(fs.readFileSync(file, 'utf8'), fs.readFileSync(valid, 'utf8'));
            assert.equal(fs.statSync(file).mode & 0o777, 0o644);
        }
        assert.deepEqual(fs.readdirSync(target).sort(), ['geoip.dat', 'geosite.dat']);
    });
});

test('防火墙解析网络快照，生成或 nft 校验失败时保留旧规则并停止重载', t => {
    const f = fixture(t), rules = path.join(f.directory, 'rules.nft'), calls = path.join(f.directory, 'calls');
    f.patch('firewall/firewall.sh', '/etc/hijpass/fw4-rules.nft', rules);
    // 宿主 BusyBox ash 优先调用自己的 ip applet，显式替换测试副本中的采集命令。
    f.patch('firewall/firewall.sh', '\nip -j ', `\n'${f.directory}/ip' -j `);
    f.script('ip', `if [ "$BAD_NETWORK_JSON" = 1 ]; then echo invalid; else
printf '%s\\n' '[{"addr_info":[{"family":"inet","local":"192.168.1.1","prefixlen":24}]}]'
fi`);
    f.script('ubus', `printf '%s\\n' '{"interface":[{"device":"wan0","route":[{"mask":0}]}]}'`);
    f.script('fw4', `if [ "$1" = zone ]; then echo wan0; else echo reload >>"$TEST_CALLS"; fi`);
    f.script('nft', '[ "$NFT_FAIL" != 1 ]');
    const template = path.join(f.directory, 'firewall.ut');
    fs.copyFileSync(path.join(root, 'root/etc/hijpass/firewall.ut'), template);
    const sections = [{ '.type': 'hijpass', firewall_template: template },
        { '.type': 'firewall', shunt_port: '18081', tproxy_proto: 'tcp,udp', acl_default_allow: '1' },
        { '.type': 'dns', dns_service: 'custom' }];
    withConfig(sections, config => {
        fs.writeFileSync(path.join(config, 'dhcp'), "config dnsmasq\n");
        fs.writeFileSync(rules, 'old rules');
        for (const failure of [{ BAD_NETWORK_JSON: '1' }, { NFT_FAIL: '1' }]) {
            const result = f.run('firewall/firewall.sh', ['reset', '--configdir', config], { TEST_CALLS: calls, ...failure });
            assert.equal(result.status, 1, JSON.stringify(failure) + ': ' + result.stderr);
            assert.equal(fs.readFileSync(rules, 'utf8'), 'old rules');
            assert.equal(fs.existsSync(calls), false);
        }
        // 规则文件缺失、模板语法错误均不能替换旧规则或触发重载。
        const file = template, original = fs.readFileSync(file, 'utf8');
        for (const invalid of [null, '', '{# empty rules #}', '{% if (: %}']) {
            if (invalid === null) fs.unlinkSync(file); else fs.writeFileSync(file, invalid);
            const broken = f.run('firewall/firewall.sh', ['reset', '--configdir', config], { TEST_CALLS: calls });
            assert.equal(broken.status, 1);
            assert.match(broken.stderr, /template/);
            assert.equal(fs.readFileSync(rules, 'utf8'), 'old rules');
            assert.equal(fs.existsSync(calls), false);
            fs.writeFileSync(file, original);
        }
        const applied = f.run('firewall/firewall.sh', ['reset', '--configdir', config], { TEST_CALLS: calls });
        assert.equal(applied.status, 0, applied.stderr);
        assert.match(fs.readFileSync(rules, 'utf8'), /192\.168\.1\.1\/24/);
        assert.match(fs.readFileSync(rules, 'utf8'), /iifname \{ "wan0" \} counter return/);
        assert.equal(fs.readFileSync(calls, 'utf8'), 'reload\n');
        assert.equal(fs.readdirSync(f.directory).some(name => name.startsWith('rules.nft.new.')), false);
    });
});

test('Chinadns 模板保留列表开关、默认 tag、上游和自定义域名的组合行为', t => {
    const f = fixture(t), configFile = path.join(f.directory, 'chinadns.conf');
    f.patch('service/dns.uc', '/etc/hijpass/chinadns-ng.conf', configFile);
    f.patch('service/dns.uc', '/tmp/hijpass/', f.directory + '/');
    f.patch('rules/rules.uc', '/tmp/hijpass/', f.directory + '/');
    const domain = path.join(f.directory, 'domains');
    fs.writeFileSync(domain, 'Example.ORG\nfull:example.net\ninvalid\n');
    const base = [{ '.type': 'hijpass', '.name': 'global', enabled: '1',
        domain_direct: domain, domain_proxy: domain, chn_list: '/rules/china', gfw_list: '/rules/proxy' },
        { '.type': 'dns', '.name': 'dns', dns_service: 'chinadns-ng', cdg_port: '53653',
            direct_dns: 'custom', direct_dns_custom: '223.5.5.5#53', proxy_dns: '1.1.1.1#53' }];
    for (const [china, proxy, tag] of [['0', '0', null], ['1', '0', 'gfw'], ['0', '1', 'chn'], ['1', '1', null]]) {
        const sections = [base[0], { ...base[1], use_chn: china, use_gfw: proxy }];
        withConfig(sections, config => {
            const prepared = f.run('service/service.sh', ['prepare', '--configdir', config]);
            assert.equal(prepared.status, 0, prepared.stderr);
            assert.equal(JSON.parse(prepared.stdout).instances[0].name, 'chinadns-ng');
            const text = fs.readFileSync(configFile, 'utf8');
            assert.match(text, /^bind-port 53653$/m);
            assert.match(text, /^china-dns 223\.5\.5\.5#53$/m);
            assert.match(text, /^trust-dns 1\.1\.1\.1#53$/m);
            assert.equal(text.includes('chnlist-file /rules/china'), china === '1');
            assert.equal(text.includes('gfwlist-file /rules/proxy'), proxy === '1');
            assert.deepEqual(text.match(/^default-tag .*$/gm), tag ? ['default-tag ' + tag] : null);
            assert.match(text, /^group-upstream 223\.5\.5\.5#53$/m);
            assert.match(text, /^group-upstream 1\.1\.1\.1#53$/m);
            assert.match(text, /^verdict-cache 4096\n$/m);
            assert.equal(fs.readFileSync(path.join(f.directory, 'domain-direct.txt'), 'utf8'), 'example.org\nexample.net\n');
            assert.equal(fs.readFileSync(path.join(f.directory, 'domain-proxy.txt'), 'utf8'), 'example.org\nexample.net\n');
        });
    }
});

test('服务端模板仅开放选中的端口，错误保留旧规则，没有允许端口时删除旧 include', t => {
    const f = fixture(t), table = path.join(f.directory, 'server.nft'), chain = path.join(f.directory, 'chain.nft');
    f.patch('service/prepare.uc', '/usr/share/nftables.d/table-post/hijserver.nft', table);
    f.patch('service/prepare.uc', '/usr/share/nftables.d/chain-pre/input_wan/hijserver.nft', chain);
    withConfig([], config => {
        const configFile = path.join(config, 'hijserver');
        const source = "config hijserver\n option enabled '1'\nconfig server_node 'a'\n option enabled '1'\n option name 'a'\n option command 'xray run'\n option allow_firewall '1'\n option listen_port '443'\n";
        fs.writeFileSync(configFile, source);
        const result = f.data('service/preparecli.uc', ['server', 'server-files', '--configdir', config]);
        assert.equal(result.status, 0, result.stderr);
        const original = fs.readFileSync(table, 'utf8');
        assert.equal(original, 'chain hijserver {\n    tcp dport { 443 } counter accept\n    udp dport { 443 } counter accept\n    return\n}\n');
        assert.equal(fs.readFileSync(chain, 'utf8'), 'jump hijserver comment "hijserver rule"\n');
        fs.writeFileSync(configFile, source.replace("'443'", "'0'"));
        assert.equal(f.data('service/preparecli.uc', ['server', 'server-files', '--configdir', config]).status, 1);
        assert.equal(fs.readFileSync(table, 'utf8'), original);
        fs.writeFileSync(configFile, source.replace("allow_firewall '1'", "allow_firewall '0'"));
        assert.equal(f.data('service/preparecli.uc', ['server', 'server-files', '--configdir', config]).status, 0);
        assert.equal(fs.existsSync(table), false);
        assert.equal(fs.existsSync(chain), false);
    });
});

for (const core of ['xray', 'sing-box']) {
    test(`${core} 安装校验摘要与版本，失败保留旧核心，成功后原子替换`, t => {
        const f = fixture(t), destination = path.join(f.directory, 'bin');
        fs.mkdirSync(destination);
        f.patch('core/release.uc', '/usr/bin/', destination + '/');
        f.patch('core/update.sh', '/usr/bin/$core', destination + '/$core');
        // uname 是外部命令，固定架构以覆盖资产选择，归档提取仍执行真实工具。
        f.script('uname', 'echo x86_64');
        const installed = path.join(destination, core);
        fs.writeFileSync(installed, 'old-core');
        const name = core === 'xray' ? 'Xray-linux-64.zip' : 'sing-box-1.2.3-linux-amd64-musl.tar.gz';
        const archive = path.join(f.directory, name), release = path.join(f.directory, 'release.json');
        f.script('curl', `case "$*" in
    *api.github.com*) cat "$TEST_RELEASE" ;;
    *) while [ "$1" != -o ]; do shift; done; cp "$TEST_ARCHIVE" "$2" ;;
esac`);
        function makeArchive(version) {
            const member = core === 'xray' ? 'xray' : 'sing-box-1.2.3-linux-amd64/sing-box';
            const binary = path.join(f.directory, member);
            fs.mkdirSync(path.dirname(binary), { recursive: true });
            fs.writeFileSync(binary, `#!/bin/sh\necho '${core === 'xray' ? 'Xray ' : 'sing-box version '}${version}'\n`, { mode: 0o755 });
            fs.rmSync(archive, { force: true });
            const packed = spawnSync(core === 'xray' ? '/usr/bin/zip' : '/bin/tar', core === 'xray' ? ['-q', archive, member] : ['-czf', archive, member], { cwd: f.directory, encoding: 'utf8' });
            assert.equal(packed.status, 0, packed.stderr);
            return createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
        }
        function update(digest) {
            const repo = core === 'xray' ? 'XTLS/Xray-core' : 'SagerNet/sing-box';
            fs.writeFileSync(release, JSON.stringify({ tag_name: 'v1.2.3', assets: [{ name, state: 'uploaded', digest: 'sha256:' + digest,
                browser_download_url: `https://github.com/${repo}/releases/download/v1.2.3/${name}` }] }));
            return f.run('core/update.sh', ['update', core], { TEST_RELEASE: release, TEST_ARCHIVE: archive });
        }
        makeArchive('1.2.3');
        const checksumFailure = update('0'.repeat(64));
        assert.equal(checksumFailure.status, 1);
        assert.match(JSON.parse(checksumFailure.stdout).error, /checksum/);
        assert.equal(fs.readFileSync(installed, 'utf8'), 'old-core');
        const versionFailure = update(makeArchive('9.9.9'));
        assert.equal(versionFailure.status, 1);
        assert.match(JSON.parse(versionFailure.stdout).error, /binary verification/);
        assert.equal(fs.readFileSync(installed, 'utf8'), 'old-core');
        const success = update(makeArchive('1.2.3'));
        assert.equal(success.status, 0, success.stderr);
        assert.deepEqual(JSON.parse(success.stdout), { success: true, version: 'v1.2.3' });
        assert.equal(fs.statSync(installed).mode & 0o777, 0o755);
        assert.deepEqual(fs.readdirSync(destination), [core]);
        const version = f.run('core/update.sh', ['version', core]);
        assert.deepEqual(JSON.parse(version.stdout), { core, version: '1.2.3' });
    });
}

test('服务准备通过原生 UCI 读取并生成配置，禁用时不调用 Geo 工具', t => {
    const f = fixture(t), client = path.join(f.directory, 'client'), calls = path.join(f.directory, 'calls');
    f.script('geoview', 'echo unexpected >>"$TEST_CALLS"; exit 1');
    const sections = [{ '.type': 'hijpass', '.name': 'global', enabled: '1', client_dir: client, log_path: path.join(f.directory, 'app.log') },
        { '.type': 'proxy_node', '.name': 'ss', enabled: '1', name: 'test', type: 'shadowsocks', core: 'sing-box',
            server: '192.0.2.10', server_port: '443', listen_port: '10001', socks_port: '10002', method: 'aes-128-gcm', password: 'test' }];
    withConfig(sections, config => {
        const prepared = f.run('service/service.sh', ['prepare', '--configdir', config], { TEST_CALLS: calls });
        assert.equal(prepared.status, 0, prepared.stderr);
        assert.deepEqual(JSON.parse(prepared.stdout).instances[0].command, ['sing-box', '-c', client + '/test-ss.json', 'run']);
        assert.equal(JSON.parse(fs.readFileSync(client + '/test-ss.json', 'utf8')).outbounds[0].type, 'shadowsocks');
    });
    const original = fs.readFileSync(client + '/test-ss.json', 'utf8');
    sections[1].password = 'changed';
    sections.push({ '.type': 'proxy_node', '.name': 'custom', enabled: '1', name: 'custom', config_type: 'custom', type: 'custom' });
    withConfig(sections, config => {
        const failed = f.run('service/service.sh', ['prepare', '--configdir', config], { TEST_CALLS: calls });
        assert.equal(failed.status, 1);
        assert.match(failed.stderr, /has no command/);
        assert.equal(fs.readFileSync(client + '/test-ss.json', 'utf8'), original);
    });
    sections[0].enabled = '0';
    withConfig(sections, config => {
        const disabled = f.run('service/service.sh', ['prepare', '--configdir', config], { TEST_CALLS: calls });
        assert.equal(disabled.status, 0, disabled.stderr);
        assert.deepEqual(JSON.parse(disabled.stdout), { instances: [] });
        assert.equal(fs.existsSync(calls), false);
    });
});

test('原生 UCI 中缺省核心的 VLESS 生成并启动 sing-box，自定义命令不生成或覆盖配置', t => {
    const f = fixture(t), client = path.join(f.directory, 'client');
    fs.mkdirSync(client);
    const customFile = path.join(client, 'manual-custom.json');
    fs.writeFileSync(customFile, 'user maintained content');
    const command = 'printf "%s\\n" "custom command"';
    const sections = [{ '.type': 'hijpass', '.name': 'global', enabled: '1', client_dir: client },
        { '.type': 'proxy_node', '.name': 'vless', enabled: '1', name: 'vless', type: 'vless',
            server: '192.0.2.10', server_port: '443', listen_port: '10001', socks_port: '10002',
            uuid: '11111111-1111-4111-8111-111111111111' },
        { '.type': 'proxy_node', '.name': 'custom', enabled: '1', name: 'manual', config_type: 'custom',
            command, listen_port: '10003', socks_port: '10004' }];
    withConfig(sections, directory => {
        const result = f.run('service/service.sh', ['prepare', '--configdir', directory]);
        assert.equal(result.status, 0, result.stderr);
        const plan = JSON.parse(result.stdout);
        assert.deepEqual(plan.instances[0].command, ['sing-box', '-c', client + '/vless-vless.json', 'run']);
        assert.equal(JSON.parse(fs.readFileSync(client + '/vless-vless.json', 'utf8')).outbounds[0].type, 'vless');
        assert.deepEqual(plan.instances[1].command, ['/bin/sh', '-c', command]);
        assert.equal(fs.readFileSync(customFile, 'utf8'), 'user maintained content');
    });
});

test('uci-defaults 首次安装自动迁移并注册防火墙，重复安装不重新转换配置', t => {
    const f = fixture(t), directory = path.join(f.directory, 'config'), accounts = path.join(f.directory, 'accounts');
    fs.mkdirSync(directory); fs.mkdirSync(accounts);
    for (const file of ['group', 'passwd', 'shadow']) fs.writeFileSync(path.join(accounts, file), 'existing:x:1:');
    fs.writeFileSync(path.join(directory, 'hijpass'), "config hijpass 'global'\nconfig proxy_node 'manual'\n option core 'custom'\n option type 'custom'\n option command 'program'\n");
    fs.writeFileSync(path.join(directory, 'firewall'), '');
    f.patch('install/setup.sh', '/etc/$file', accounts + '/$file');
    f.patch('install/setup.sh', '/etc/hijpass', f.directory + '/data');
    f.patch('install/setup.sh', '/tmp/hijpass/log', f.directory + '/logs');
    f.patch('install/setup.sh', '/tmp/hijserver/log', f.directory + '/server-logs');
    f.patch('install/setup.sh', '/tmp/luci-*cache', f.directory + '/cache');
    f.script('cron-restart', 'printf "%s\\n" "$1" >>"$CRON_TEST_CALLS"');
    f.patch('install/setup.sh', '/etc/init.d/cron', path.join(f.directory, 'cron-restart'));
    f.patch('install/setup.sh', '"$HIJPASS_LIB/install/migrate.uc"', '"$HIJPASS_LIB/install/migrate.uc" --configdir "$TEST_CONFIG_DIRECTORY"');
    const uci = spawnSync('/bin/sh', ['-c', 'command -v uci'], { encoding: 'utf8' }).stdout.trim();
    assert.ok(uci, 'native UCI CLI is required for the installation test');
    f.script('uci', "exec '" + uci.replaceAll("'", "'\\''") + "' -c \"$TEST_CONFIG_DIRECTORY\" \"$@\"");
    fs.writeFileSync(path.join(f.runtime, 'install/firstboot.sh'),
        fs.readFileSync(path.join(root, 'root/etc/uci-defaults/luci-app-hijpass'), 'utf8').replaceAll('/usr/lib/hijpass', f.runtime));
    const env = { TEST_CONFIG_DIRECTORY: directory, CRON_TEST_CALLS: path.join(f.directory, 'cron-calls') };
    const first = f.run('install/firstboot.sh', [], env);
    assert.equal(first.status, 0, first.stderr);
    const migrated = fs.readFileSync(path.join(directory, 'hijpass'), 'utf8');
    assert.match(migrated, /schema_version '2'/);
    assert.match(migrated, /config_type 'custom'/);
    assert.doesNotMatch(migrated, /option (core|type) /);
    assert.match(fs.readFileSync(path.join(directory, 'firewall'), 'utf8'), /option type 'script'/);
    const modified = migrated + "\nconfig proxy_node 'later'\n option core 'singbox'\n";
    fs.writeFileSync(path.join(directory, 'hijpass'), modified);
    const again = f.run('install/firstboot.sh', [], env);
    assert.equal(again.status, 0, again.stderr);
    assert.equal(fs.readFileSync(path.join(directory, 'hijpass'), 'utf8'), modified);
    assert.equal(fs.readFileSync(env.CRON_TEST_CALLS, 'utf8'), 'restart\nrestart\n');
    for (const file of ['group', 'passwd', 'shadow'])
        assert.equal(fs.readFileSync(path.join(accounts, file), 'utf8').split('\n').filter(line => line.startsWith('hijpass:')).length, 1);
});

test('服务 cron 只管理当前脚本，客户端与服务端互不删除，不在启动时清理旧任务', t => {
    const f = fixture(t), cron = path.join(f.directory, 'crontab');
    f.patch('service/prepare.uc', '/etc/crontabs/root', cron);
    const legacy = `0 * * * * ${f.runtime}/rules.sh update\n`;
    const mentioned = `0 * * * * echo ${f.runtime}/rules/update.sh\n`;
    fs.writeFileSync(cron, legacy + mentioned + `0 * * * * ${f.runtime}/rules/update.sh update\n*/10 * * * * ${f.runtime}/maintenance/logs.sh hijpass\n`);
    withConfig([{ '.type': 'hijpass', '.name': 'global', enabled: '1', log_path: '/logs/main.log' },
        { '.type': 'rule', '.name': 'rules', update_schedule: '0 5 * * 1' }], directory => {
        fs.writeFileSync(path.join(directory, 'hijserver'), `config hijserver 'global'\n option enabled '1'\nconfig server_node 'a'\n option enabled '1'\n option command 'program'\n option log_path '/logs/server.log'\n`);
        for (const args of [['cron', 'enable'], ['cron', 'enable'], ['server', 'cron', 'enable'], ['server', 'cron', 'enable']]) {
            const result = f.data('service/preparecli.uc', [...args, '--configdir', directory]);
            assert.equal(result.status, 0, result.stderr);
        }
        let contents = fs.readFileSync(cron, 'utf8');
        assert.ok(contents.includes(legacy));
        assert.ok(contents.includes(mentioned));
        assert.equal(contents.split('\n').filter(line => line.includes(`0 5 * * 1 ${f.runtime}/rules/update.sh`)).length, 1);
        for (const kind of ['hijpass', 'hijserver'])
            assert.equal(contents.split('\n').filter(line => line.endsWith('/maintenance/logs.sh ' + kind)).length, 1);
        const stopped = f.data('service/preparecli.uc', ['cron', 'disable', '--configdir', directory]);
        assert.equal(stopped.status, 0, stopped.stderr);
        contents = fs.readFileSync(cron, 'utf8');
        assert.ok(contents.includes(legacy));
        assert.ok(contents.includes(mentioned));
        assert.ok(contents.includes('/maintenance/logs.sh hijserver'));
        assert.equal(contents.includes('/maintenance/logs.sh hijpass'), false);
        assert.equal(contents.includes(`0 5 * * 1 ${f.runtime}/rules/update.sh`), false);
    });
});
