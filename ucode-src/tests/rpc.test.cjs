const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { root, shellRuntime } = require('./helpers.cjs');

// 在独立安装副本中映射路径与 UCI 目录，不给生产 RPC 增加测试参数。
function fixture(t) {
    const directory = fs.mkdtempSync('/tmp/hijpass-rpc-test-');
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const runtime = path.join(directory, 'runtime'), config = path.join(directory, 'config');
    const original = shellRuntime();
    fs.cpSync(original, runtime, { recursive: true });
    fs.mkdirSync(config);
    for (const name of fs.readdirSync(runtime, { recursive: true })) if (/\.(sh|uc)$/.test(name)) {
        const file = path.join(runtime, name);
        fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll(original, runtime));
    }
    for (const name of ['rpc/files.uc', 'rpc/data.uc']) {
        const file = path.join(runtime, name);
        fs.writeFileSync(file, fs.readFileSync(file, 'utf8')
            .replace("import { read } from 'hijpass.uci.read';", `import { read as readConfig } from 'hijpass.uci.read';
function read(packageName) { return readConfig(packageName, '${config}'); }`));
    }
    const jobs = path.join(runtime, 'rpc/jobs.sh');
    fs.writeFileSync(jobs, fs.readFileSync(jobs, 'utf8').replaceAll('/tmp/hijpass-jobs', path.join(directory, 'jobs')));
    const rules = path.join(directory, 'firewall.ut');
    fs.copyFileSync(path.join(root, 'root/etc/hijpass/firewall.ut'), rules);
    const editor = path.join(directory, 'direct.txt'), log = path.join(directory, 'node.log');
    fs.writeFileSync(editor, 'original\n');
    fs.writeFileSync(log, 'first\nsecond\nthird\n');
    fs.writeFileSync(path.join(config, 'hijpass'), `config hijpass 'global'
 option client_dir '${directory}'
 option firewall_template '${rules}'
 option ip_direct '${editor}'
 option shunt_conf '${directory}/shunt.json'
config proxy_node 'node'
 option name 'original'
 option log_path '${log}'
`);
    fs.writeFileSync(path.join(config, 'hijserver'), "config hijserver 'global'\n");
    const entry = path.join(runtime, 'rpc/entry.sh');
    fs.writeFileSync(entry, fs.readFileSync(path.join(root, 'root/usr/libexec/rpcd/hijpass'), 'utf8')
        .replaceAll('/usr/lib/hijpass', runtime));
    function invoke(method, request = {}) {
        const result = spawnSync('/usr/bin/busybox', ['ash', entry, ...(method === 'list' ? ['list'] : ['call', method])], {
            encoding: 'utf8', input: JSON.stringify(request),
            env: { ...process.env, PATH: path.join(runtime, 'testbin') + ':' + process.env.PATH },
        });
        assert.equal(result.status, 0, result.stderr);
        return JSON.parse(result.stdout);
    }
    return { invoke, directory, runtime, rules, editor, log };
}

test('RPC reads the full editable template and serves an immutable default without paths', t => {
    const f = fixture(t), schema = f.invoke('list');
    assert.ok(schema.firewall_template_default);
    assert.equal(schema.firewall_chains, undefined);
    assert.deepEqual(Object.keys(schema.editor_read), ['resource', 'section', 'name']);
    const original = fs.readFileSync(f.rules, 'utf8');
    assert.equal(f.invoke('editor_read', { resource: 'firewall_template' }).content, original);
    assert.equal(f.invoke('firewall_template_default').content, original);
    assert.equal(f.invoke('editor_write', { resource: 'firewall_template', content: 'changed template' }).ok, true);
    assert.equal(f.invoke('editor_read', { resource: 'firewall_template' }).content, 'changed template\n');
    assert.equal(f.invoke('firewall_template_default').content, original);
    fs.unlinkSync(path.join(f.runtime, 'firewall/default.ut'));
    assert.match(f.invoke('firewall_template_default').error, /cannot read/);
    assert.match(f.invoke('editor_read', { resource: '/etc/shadow' }).error, /unknown editor resource/);
    assert.equal(f.invoke('not_a_method').error, 'unknown RPC method');
});

test('RPC resolves configured directories and renamed/new node names without client file paths', t => {
    const f = fixture(t);
    assert.equal(f.invoke('editor_read', { resource: 'ip_direct' }).content, 'original\n');
    fs.chmodSync(f.editor, 0o640);
    assert.equal(f.invoke('editor_write', { resource: 'ip_direct', content: '  changed\r\nsecond  ' }).ok, true);
    assert.equal(fs.readFileSync(f.editor, 'utf8'), 'changed\nsecond\n');
    assert.equal(fs.statSync(f.editor).mode & 0o777, 0o640);
    assert.equal(f.invoke('editor_read', { resource: 'proxy_config', section: 'newnode' }).content, '');
    assert.equal(f.invoke('editor_write', { resource: 'proxy_config', section: 'newnode', name: 'renamed node', content: '{}' }).ok, true);
    assert.equal(fs.readFileSync(path.join(f.directory, 'renamed node-newnode.json'), 'utf8'), '{}\n');
    for (const request of [
        { resource: 'proxy_config', section: '../node', content: '' },
        { resource: 'proxy_config', section: 'node', name: '../secret', content: '' },
        { resource: 'proxy_config', section: 'node', name: 'x\u0000y', content: '' },
        { resource: 'ip_direct', content: {} },
    ]) assert.ok(f.invoke('editor_write', request).error);
    assert.equal(fs.readFileSync(f.editor, 'utf8'), 'changed\nsecond\n');
});

test('RPC logs use section identities and preserve tail, download and clear behavior', t => {
    const f = fixture(t), id = 'hijpass:node';
    assert.deepEqual(f.invoke('log_list').logs, [{ id, name: 'original', kind: 'proxy' }]);
    assert.equal(f.invoke('log_read', { id, action: 'read', lines: '2' }).content, 'second\nthird\n');
    assert.deepEqual(f.invoke('log_read', { id, action: 'download' }), { content: 'first\nsecond\nthird\n', name: 'node.log' });
    for (const request of [{ id: '/etc/shadow', action: 'read', lines: '2' }, { id, action: 'read', lines: '-1' }])
        assert.ok(f.invoke('log_read', request).error);
    assert.ok(f.invoke('log_read', { id, action: 'clear' }).error);
    assert.equal(fs.readFileSync(f.log, 'utf8'), 'first\nsecond\nthird\n');
    assert.equal(f.invoke('log_clear', { id }).ok, true);
    assert.equal(fs.readFileSync(f.log, 'utf8'), '');
});

test('Shell RPC keeps arguments separate and returns real command failures', t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.runtime, 'rules/geoview.sh'), '#!/bin/sh\nprintf "%s\\n" "$@"\nprintf "failure" >&2\nexit 7\n', { mode: 0o755 });
    const keyword = "a b;$(touch /tmp/hijpass-never-created)";
    const response = f.invoke('geo_lookup', { type: 'geosite', mode: 'expand', keyword });
    assert.deepEqual(response, { code: 7, stdout: '-e\ngeosite\n' + keyword, stderr: 'failure' });
    assert.ok(f.invoke('geo_lookup', { type: 'file', mode: 'expand', keyword }).error);
    assert.ok(f.invoke('core_version', { core: 'xray;id' }).error);
    assert.ok(f.invoke('trace_start', { args: ['-t', {}] }).error);
});

test('RPC encodes large command output from files and removes its capture directory', t => {
    const f = fixture(t), entry = path.join(f.runtime, 'rpc/entry.sh');
    fs.writeFileSync(entry, fs.readFileSync(entry, 'utf8')
        .replace('/tmp/hijpass-rpc.XXXXXX', path.join(f.directory, 'capture.XXXXXX')));
    const stdout = 'rule "quoted" \\ 规则\tvalue\n'.repeat(8000) + 'tail \n\n';
    const stderr = 'failure "quoted" \\ 失败\n'.repeat(8000) + '\n';
    fs.writeFileSync(path.join(f.runtime, 'firewall/firewall.sh'), `#!/bin/sh
cat '${f.directory}/stdout'
cat '${f.directory}/stderr' >&2
exit "$(cat '${f.directory}/code')"
`);
    for (const [out, err, code] of [[stdout, '', 0], ['', stderr, 7], [stdout, stderr, 9]]) {
        fs.writeFileSync(path.join(f.directory, 'stdout'), out);
        fs.writeFileSync(path.join(f.directory, 'stderr'), err);
        fs.writeFileSync(path.join(f.directory, 'code'), String(code));
        const response = f.invoke('firewall_show');
        assert.equal(response.code, code);
        assert.equal(response.stdout, out.replace(/\n+$/, ''));
        assert.equal(response.stderr, err.replace(/\n+$/, ''));
        assert.equal(fs.readdirSync(f.directory).some(name => name.startsWith('capture.')), false);
    }
});

test('RPC returns large stderr when a structured command produces no response', t => {
    const f = fixture(t), stderr = 'upstream failure "quoted" \\ 失败\n'.repeat(8000);
    fs.writeFileSync(path.join(f.directory, 'failure'), stderr);
    fs.writeFileSync(path.join(f.runtime, 'network/network.sh'), `#!/bin/sh
cat '${f.directory}/failure' >&2
exit 1
`);
    const response = f.invoke('network_connect', { url: 'https://example.org', timeout: '5' });
    assert.equal(response.success, false);
    assert.equal(response.error, stderr.replace(/\n+$/, ''));
});

test('completed jobs return large stdout and stderr without environment-variable limits', t => {
    const f = fixture(t), id = 'Large123', job = path.join(f.directory, 'jobs', id);
    fs.mkdirSync(job, { recursive: true });
    assert.deepEqual(f.invoke('job_status', { id }), { running: true });
    const stdout = 'updated "rule" \\ 规则\n'.repeat(8000);
    const stderr = 'warning "quoted" \\ 警告\n'.repeat(8000);
    fs.writeFileSync(path.join(job, 'stdout'), stdout);
    fs.writeFileSync(path.join(job, 'stderr'), stderr);
    fs.writeFileSync(path.join(job, 'exit'), '7\n');
    const response = f.invoke('job_status', { id });
    assert.equal(response.running, false);
    assert.equal(response.code, 7);
    assert.equal(response.stdout, stdout.replace(/\n+$/, ''));
    assert.equal(response.stderr, stderr.replace(/\n+$/, ''));
    assert.equal(f.invoke('job_release', { id }).ok, true);
    assert.equal(fs.existsSync(job), false);
});

test('jobs whose worker exits before producing output still return the recorded failure', t => {
    const f = fixture(t), daemon = path.join(f.runtime, 'testbin/start-stop-daemon');
    fs.writeFileSync(daemon, `#!/bin/sh
while [ "$#" -gt 0 ]; do
    if [ "$1" = -p ]; then printf '2147483647\\n' >"$2"; exit 0; fi
    shift
done
exit 1
`, { mode: 0o755 });
    // BusyBox ash 优先使用内置 applet，在安装副本中显式指定测试命令。
    const jobs = path.join(f.runtime, 'rpc/jobs.sh');
    fs.writeFileSync(jobs, fs.readFileSync(jobs, 'utf8').replace('exec start-stop-daemon ', `exec '${daemon}' `));
    const start = f.invoke('core_update', { core: 'xray' });
    assert.deepEqual(f.invoke('job_status', { id: start.id }), {
        running: false, code: 1, stdout: '', stderr: 'job exited without a result',
    });
    assert.equal(f.invoke('job_release', { id: start.id }).ok, true);
});

test('backend writes preserve TLS while resolving chains and reject snapshot storage paths', t => {
    const fixtures = require('./testdata/compatibility.json');
    for (const core of ['xray', 'sing-box']) {
        const f = fixture(t);
        const prepare = path.join(f.runtime, 'service/prepare.uc');
        fs.writeFileSync(prepare, fs.readFileSync(prepare, 'utf8').replace("import { resolve } from '../network/network.uc';",
            "function resolve(host) { if (host == 'fail.example.org') die('DNS failed'); return '192.0.2.10'; }"));
        const sections = structuredClone(fixtures.find(f => f.name === 'sing-box-chain').sections);
        sections[0].client_dir = path.join(f.directory, 'untrusted');
        for (const node of sections.slice(1)) node.core = core;
        const downstream = sections[2];
        downstream.tls_server_name = 'tls.example.org';
        const result = f.invoke('config_write', { sections: JSON.stringify(sections) });
        assert.equal(result.error, undefined, result.error);
        assert.equal(fs.existsSync(sections[0].client_dir), false);
        const target = path.join(f.directory, 'downstream-downstream.json');
        const content = fs.readFileSync(target, 'utf8'), outbound = JSON.parse(content).outbounds[0];
        if (core === 'sing-box') {
            assert.equal(outbound.server, '192.0.2.10');
            assert.equal(outbound.tls.server_name, 'tls.example.org');
        } else {
            assert.equal(outbound.settings.address, '192.0.2.10');
            assert.equal(outbound.streamSettings.tlsSettings.serverName, 'tls.example.org');
        }
        downstream.server = 'fail.example.org';
        assert.match(f.invoke('config_write', { sections: JSON.stringify(sections) }).error, /DNS failed/);
        assert.equal(fs.readFileSync(target, 'utf8'), content);
    }
});

test('download jobs return immediately, publish results and release only after completion', async t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.runtime, 'core/update.sh'), '#!/bin/sh\nsleep 0.1\nprintf \'{"success":true,"version":"test"}\\n\'\n', { mode: 0o755 });
    const start = f.invoke('core_update', { core: 'xray' });
    assert.match(start.id, /^[A-Za-z0-9]{8}$/);
    let status;
    for (let i = 0; i < 40; i++) {
        status = f.invoke('job_status', { id: start.id });
        if (!status.running) break;
        assert.ok(f.invoke('job_release', { id: start.id }).error);
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(status.running, false);
    assert.equal(status.code, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).version, 'test');
    assert.equal(f.invoke('job_release', { id: start.id }).ok, true);
    assert.match(f.invoke('job_status', { id: start.id }).error, /job not found/);
});
