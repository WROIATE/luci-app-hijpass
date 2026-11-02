const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./helpers.cjs');
const uuid = 'b837b692-739d-4c1c-8901-637b957295fb';
const global = { '.name': 'global', '.type': 'hijserver', enabled: '1' };
const node = (type, core, overrides = {}) => ({ '.name': 'node', '.type': 'server_node', name: 'test',
    type, core, enabled: '1', allow_firewall: '1', listen: '127.0.0.1', listen_port: '16443',
    method: 'aes-128-gcm', password: 'test-password', uuid, certificate_path: '/tmp/test-cert.pem',
    key_path: '/tmp/test-key.pem', ...overrides });
function invoke(action, values, extra) { return run('ucode-src/tests/runtime.uc', [], { action, ...values }, extra); }
function result(action, values) {
    const process = invoke(action, values);
    assert.equal(process.status, 0, process.stderr);
    return JSON.parse(process.stdout);
}
for (const core of ['sing-box', 'xray']) for (const type of ['shadowsocks', 'hysteria2', 'vless']) {
    test(`${core} ${type}: generate inbound, credentials, direct outbound and standard core argv`, () => {
        const section = node(type, core);
        const config = result('server-render', { section });
        const inbound = config.inbounds[0];
        assert.equal(inbound.listen, '127.0.0.1');
        assert.equal(core === 'xray' ? inbound.port : inbound.listen_port, 16443);
        assert.equal(core === 'xray' ? inbound.protocol : inbound.type, core === 'xray' && type === 'hysteria2' ? 'hysteria' : type);
        if (type === 'shadowsocks') assert.equal((inbound.settings || inbound).password, section.password);
        else if (type === 'hysteria2') {
            assert.equal(core === 'xray' ? inbound.settings.clients[0].auth : inbound.users[0].password, section.password);
            assert.equal(core === 'xray' ? inbound.streamSettings.tlsSettings.certificates[0].certificateFile : inbound.tls.certificate_path, section.certificate_path);
        } else assert.equal(core === 'xray' ? inbound.settings.clients[0].id : inbound.users[0].uuid, uuid);
        const plan = result('server-plan', { sections: [global, section] });
        assert.deepEqual(plan.instances[0].command, [core, 'run', '-c', '/etc/hijpass/server/test-node.json']);
        assert.equal(plan.instances[0].check[0], core);
        assert.deepEqual(plan.instances[0].env, []);
        assert.deepEqual(plan.ports, { tcp: type === 'hysteria2' ? [] : [16443], udp: type === 'vless' ? [] : [16443] });
    });
}
for (const core of ['sing-box', 'xray']) test(`${core}: VLESS transports and REALITY use inbound credentials`, () => {
    for (const transport of ['ws', 'grpc']) {
        const config = result('server-render', { section: node('vless', core, { transport, ws_path: '/test', grpc_service_name: 'test' }) });
        const inbound = config.inbounds[0];
        assert.equal(core === 'xray' ? inbound.streamSettings.network : inbound.transport.type, transport);
    }
    const section = node('vless', core, { security: 'reality', flow: 'xtls-rprx-vision', reality_server: 'example.com',
        server_name: 'example.com', reality_private_key: 'A'.repeat(43), reality_short_id: 'ab0123' });
    const inbound = result('server-render', { section }).inbounds[0];
    const reality = core === 'xray' ? inbound.streamSettings.realitySettings : inbound.tls.reality;
    assert.equal(core === 'xray' ? reality.privateKey : reality.private_key, section.reality_private_key);
    assert.deepEqual(core === 'xray' ? reality.shortIds : reality.short_id, ['ab0123']);
});

test('server validation rejects incomplete or incompatible settings without echoing secrets', () => {
    const cases = [
        [node('custom', 'xray', { command: 'touch /tmp/should-not-run' }), /select a server protocol/],
        [node('shadowsocks', 'bad-core'), /unsupported server core/],
        [node('shadowsocks', 'sing-box', { password: '' }), /password is required/],
        [node('shadowsocks', 'sing-box', { method: '2022-blake3-aes-128-gcm' }), /16-byte key/],
        [node('shadowsocks', 'sing-box', { listen_port: '0' }), /invalid port/],
        [node('hysteria2', 'sing-box', { certificate_path: '' }), /certificate_path/],
        [node('vless', 'xray', { uuid: 'invalid' }), /UUID/],
        [node('vless', 'sing-box', { security: 'none', flow: 'xtls-rprx-vision' }), /Vision requires/],
        [node('vless', 'xray', { security: 'reality', transport: 'ws' }), /Xray REALITY only supports RAW, XHTTP and gRPC/],
    ];
    for (const [section, expected] of cases) {
        const process = invoke('server-render', { section });
        assert.notEqual(process.status, 0);
        assert.match(process.stderr, expected);
        assert.ok(!process.stderr.includes('test-password'));
    }
    const valid = node('shadowsocks', 'sing-box', { method: '2022-blake3-aes-128-gcm', password: Buffer.alloc(16, 1).toString('base64') });
    assert.equal(result('server-render', { section: valid }).inbounds[0].password, valid.password);
});

test('server generation skips disabled nodes, validates duplicates and writes generated JSON privately', t => {
    const directory = fs.mkdtempSync('/tmp/hijpass-server-test-');
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const section = node('shadowsocks', 'sing-box', { command: 'false', procd_env: ['UNUSED=value'] });
    const sections = [global, section, node('custom', 'xray', { '.name': 'old', enabled: '0' })];
    const write = invoke('server-write', { sections }, { paths: { '/etc/hijpass/server': directory } });
    assert.equal(write.status, 0, write.stderr);
    const file = path.join(directory, 'test-node.json');
    assert.equal(JSON.parse(fs.readFileSync(file)).inbounds[0].type, 'shadowsocks');
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.readdirSync(directory).length, 1);
    assert.deepEqual(result('server-generate', { sections: [{ ...global, enabled: '0' }, section] }), []);
    const duplicate = invoke('server-generate', { sections: [global, section, { ...section, '.name': 'another' }] });
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /duplicate listen port/);
});

test('server RPC validates hijserver independently and rejects custom JSON writes', () => {
    const sections = [global, node('shadowsocks', 'xray')];
    const validate = request => JSON.parse(run('root/usr/lib/hijpass/rpc/data.uc', ['call', 'server_validate'], request).stdout);
    assert.deepEqual(validate({ sections: JSON.stringify(sections) }), { ok: true });
    assert.match(validate({ sections: JSON.stringify([global, node('custom', 'xray')]) }).error, /select a server protocol/);
    const write = run('root/usr/lib/hijpass/rpc/data.uc', ['call', 'editor_write'], { resource: 'server_config', section: 'node', content: '{}' });
    assert.match(JSON.parse(write.stdout).error, /generated from UCI/);
});

test('Xray XHTTP servers generate all modes with TLS or REALITY and keep matching HTTP fields', () => {
    for (const security of ['none', 'tls', 'reality']) for (const mode of ['auto', 'packet-up', 'stream-up', 'stream-one']) {
        const section = node('vless', 'xray', { transport: 'xhttp', security, xhttp_mode: mode,
            xhttp_host: 'server.example', xhttp_path: '/proxy', xhttp_method: 'PUT',
            reality_server: 'server.example', server_name: 'server.example', reality_private_key: 'A'.repeat(43) });
        const stream = result('server-render', { section }).inbounds[0].streamSettings;
        assert.equal(stream.network, 'xhttp');
        assert.equal(stream.security, security);
        assert.deepEqual(stream.xhttpSettings, { host: 'server.example', path: '/proxy', mode, uplinkHTTPMethod: 'PUT' });
        assert.deepEqual(result('server-plan', { sections: [global, section] }).ports, { tcp: [16443], udp: [] });
    }
    const stream = result('server-render', { section: node('vless', 'xray', { transport: 'xhttp' }) }).inbounds[0].streamSettings;
    assert.deepEqual(stream.xhttpSettings, { host: '', path: '/', mode: 'auto' });
    const grpc = result('server-render', { section: node('vless', 'xray', { transport: 'grpc', grpc_service_name: 'test',
        security: 'reality', reality_server: 'server.example', server_name: 'server.example', reality_private_key: 'A'.repeat(43) }) });
    assert.equal(grpc.inbounds[0].streamSettings.security, 'reality');
});

test('XHTTP rejects unsupported core, invalid options and Vision instead of generating unusable configurations', () => {
    const cases = [
        [node('vless', 'sing-box', { transport: 'xhttp' }), /only supported by Xray/],
        [node('vless', 'xray', { transport: 'xhttp', xhttp_mode: 'unsupported' }), /invalid XHTTP mode/],
        [node('vless', 'xray', { transport: 'xhttp', xhttp_path: 'proxy' }), /path must start/],
        [node('vless', 'xray', { transport: 'xhttp', xhttp_method: 'PUT\r\nheader' }), /invalid HTTP method/],
        [node('vless', 'xray', { transport: 'xhttp', xhttp_host: 'host\r\nheader' }), /invalid XHTTP Host/],
        [node('vless', 'xray', { transport: 'xhttp', flow: 'xtls-rprx-vision' }), /Vision requires TCP/],
    ];
    for (const [section, message] of cases) {
        const process = invoke('server-render', { section });
        assert.notEqual(process.status, 0);
        assert.match(process.stderr, message);
    }
});

test('VLESS omitted or empty transport uses TCP for both cores', () => {
    for (const core of ['sing-box', 'xray']) {
        const generate = transport => result('server-render', { section: node('vless', core, { transport }) });
        assert.deepEqual(generate(''), generate('tcp'));
        assert.deepEqual(generate(undefined), generate('tcp'));
    }
});
