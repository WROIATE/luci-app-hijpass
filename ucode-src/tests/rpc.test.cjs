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
    const rules = path.join(directory, 'rules');
    fs.cpSync(path.join(root, 'root/etc/hijpass/firewall'), rules, { recursive: true });
    const editor = path.join(directory, 'direct.txt'), log = path.join(directory, 'node.log');
    fs.writeFileSync(editor, 'original\n');
    fs.writeFileSync(log, 'first\nsecond\nthird\n');
    fs.writeFileSync(path.join(config, 'hijpass'), `config hijpass 'global'
 option client_dir '${directory}'
 option firewall_rules '${rules}'
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

test('RPC serves the same in-code chains used for generation and exposes no path arguments', t => {
    const f = fixture(t), schema = f.invoke('list');
    assert.ok(schema.firewall_chains);
    assert.deepEqual(Object.keys(schema.editor_read), ['resource', 'section', 'name']);
    const definitions = f.invoke('firewall_chains').chains;
    assert.equal(definitions.length, 7);
    for (const chain of definitions) {
        const response = f.invoke('editor_read', { resource: 'firewall_rule', section: chain.name });
        assert.equal(response.content, fs.readFileSync(path.join(f.rules, chain.name + '.ut'), 'utf8'));
    }
    assert.match(f.invoke('editor_read', { resource: 'firewall_rule', section: '../sets' }).error, /unknown firewall chain/);
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
