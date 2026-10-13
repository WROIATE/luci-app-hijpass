const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { root, shellRuntime, withConfig } = require('./helpers.cjs');

// 只在安装副本中替换系统路径，生产代码不增加测试开关或模拟逻辑。
function fixture(t) {
    const directory = fs.mkdtempSync('/tmp/hijpass-execution-test-');
    const runtime = path.join(directory, 'runtime');
    const sourceRuntime = shellRuntime();
    fs.cpSync(sourceRuntime, runtime, { recursive: true });
    // 各场景使用独立的安装副本，避免路径仍指向共享测试目录。
    for (const file of fs.readdirSync(runtime, { recursive: true })) if (file.endsWith('.sh')) {
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
    return { directory, runtime, patch, script, run };
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
    const sections = [{ '.type': 'hijpass', nft: path.join(root, 'root/etc/hijpass/fw4-template.nft') },
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
        const applied = f.run('firewall/firewall.sh', ['reset', '--configdir', config], { TEST_CALLS: calls });
        assert.equal(applied.status, 0, applied.stderr);
        assert.match(fs.readFileSync(rules, 'utf8'), /192\.168\.1\.1\/24/);
        assert.match(fs.readFileSync(rules, 'utf8'), /define WAN_DEV = \{ "wan0" \}/);
        assert.equal(fs.readFileSync(calls, 'utf8'), 'reload\n');
        assert.equal(fs.readdirSync(f.directory).some(name => name.startsWith('rules.nft.new.')), false);
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
    sections.push({ '.type': 'proxy_node', '.name': 'custom', enabled: '1', name: 'custom', core: 'custom', type: 'custom' });
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
