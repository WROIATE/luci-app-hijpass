const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hijpass-backend-test-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
const { config } = require('../../ucode-src/tests/helpers.cjs');
const fixtures = require('../../ucode-src/tests/testdata/compatibility.json');
function rpc(method, request) {
    const result = config(['call', method], request);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}

test('rpcd advertises only read-only snapshot operations', () => {
    const result = config(['list']);
    assert.deepEqual(JSON.parse(result.stdout), { render: { sections: '', target: '' }, validate: { sections: '' } });
    assert.match(rpc('generate', {}).error, /unknown method/);
});
test('RPC renders the submitted snapshot and validates references', () => {
    const fixture = fixtures.find(f => f.name === 'sing-box-chain');
    const sections = JSON.stringify(fixture.sections);
    const expected = structuredClone(fixture.expected.nodes.downstream);
    assert.deepEqual(rpc('render', { sections, target: 'downstream' }).config, expected);
    assert.deepEqual(rpc('validate', { sections }), { ok: true });
    const broken = structuredClone(fixture.sections);
    broken.at(-1).upstream_proxy_node = 'missing';
    assert.match(rpc('validate', { sections: JSON.stringify(broken) }).error, /missing/);
    assert.match(rpc('render', { sections: '{}', target: 'node' }).error, /unmarshal/);
    assert.match(rpc('render', { sections, target: 'missing' }).error, /not found/);
});
test('LuCI sends staged sections and propagates backend errors', async () => {
    const calls = [];
    const sections = fixtures[0].sections;
    let response = { config: { outbounds: [] } };
    const context = vm.createContext({ exports: {}, require(name) {
        if (name === 'rpc') return { declare: options => async (...args) => { calls.push([options, args]); return response; } };
        if (name === 'uci') return { sections: () => sections };
        if (name.endsWith('/hijpass')) return { LuciFlied: { CONF_NAME: 'hijpass' } };
        throw new Error(name);
    } });
    const source = fs.readFileSync(path.join(root, 'ts-src/utils/feature/config/backend.ts'), 'utf8');
    vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, context);
    const utils = context.exports.GeneratedConfigUtils;
    await utils.preview('node');
    assert.equal(calls[0][0].object, 'hijpass-config');
    assert.deepEqual(JSON.parse(calls[0][1][0]), sections);
    assert.equal(calls[0][1][1], 'node');
    response = { error: 'bad dependency' };
    await assert.rejects(utils.validate(), /bad dependency/);
});

function loadTS(relative, modules) {
    const context = vm.createContext({ exports: {}, console: { log() {} }, _: s => s, require(name) {
        if (name in modules) return modules[name];
        throw new Error(`unexpected import ${name}`);
    } });
    vm.runInContext('String.prototype.format = function(v) { return this.replace("%s", v); };', context);
    const source = fs.readFileSync(path.join(root, 'ts-src', relative), 'utf8');
    vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, context);
    return context.exports;
}

test('CLI renders supplied input without runtime commands and rejects generate', () => {
    const fixture = fixtures.find(f => f.name === 'sing-box-chain');
    const rendered = config(['render', '--stdin'], fixture.sections, { env: { ...process.env, PATH: '' } });
    assert.equal(rendered.status, 0, rendered.stderr);
    assert.ok(JSON.parse(rendered.stdout).nodes.downstream);
    const rejected = config(['generate']);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /unknown command/);
});

function fileUtils(sections, resolve) {
    const writes = [];
    const hashes = [];
    const utils = loadTS('utils/feature/config/files.ts', {
        fs: { exec_direct: resolve, write: async (path, data) => writes.push([path, JSON.parse(data)]) },
        uci: { sections: () => sections, set_first: (...args) => hashes.push(args) },
        '../../../enum/hijpass': { LuciFlied: { CONF_NAME: 'hijpass', PROXY_NODE_TYPE: 'proxy_node', SHUNT_SECTION_TYPE: 'shunt' } },
        '../../base/files/paths': { FilePathUtils: { getProxyConfigFilePath: s => `/client/${s['.name']}.json`, getFilePath: () => '/shunt.json' } },
        '../../base/luci/form': { FormUtils: { simpleHash: () => 123 } },
    }).ConfigFileUtils;
    return { utils, writes, hashes };
}

test('LuCI writes ucode output, preserves custom files and TLS when resolving chains', async () => {
    for (const core of ['sing-box', 'xray']) {
        const sections = [
            { '.name': 'downstream', server: 'proxy.example.org', upstream_proxy_node: 'upstream' },
            { '.name': 'custom', type: 'custom' },
        ];
        const calls = [];
        const { utils, writes, hashes } = fileUtils(sections, async (...args) => {
            calls.push(args);
            return { address: '192.0.2.10' };
        });
        const outbound = core === 'sing-box'
            ? { server: 'proxy.example.org', tls: { server_name: 'tls.example.org', insecure: false } }
            : { settings: { address: 'proxy.example.org' }, streamSettings: { tlsSettings: { serverName: 'tls.example.org' } } };
        const config = { outbounds: [outbound] };
        await utils.writeGeneratedConfigs({ nodes: { downstream: config }, shunt: { route: { final: 'direct' } } });
        assert.equal(calls[0][0], '/usr/lib/hijpass/network/network.sh');
        assert.deepEqual(Array.from(calls[0][1]), ['resolve', 'proxy.example.org']);
        assert.deepEqual(writes.map(w => w[0]), ['/client/downstream.json', '/shunt.json']);
        const written = writes[0][1].outbounds[0];
        if (core === 'sing-box') {
            assert.equal(written.server, '192.0.2.10');
            assert.equal(written.tls.server_name, 'tls.example.org');
            assert.equal(written.tls.insecure, false);
        } else {
            assert.equal(written.settings.address, '192.0.2.10');
            assert.equal(written.streamSettings.tlsSettings.serverName, 'tls.example.org');
        }
        assert.equal(hashes[0][2], 'shunt_hash');
    }
});

test('failed address resolution writes no generated files', async () => {
    const sections = [{ '.name': 'first' }, { '.name': 'second', server: 'bad.example.org', upstream_proxy_node: 'first' }];
    const { utils, writes } = fileUtils(sections, async () => { throw new Error('DNS failed'); });
    await assert.rejects(utils.writeGeneratedConfigs({ nodes: { first: {}, second: {} } }), /DNS failed/);
    assert.deepEqual(writes, []);
});

test('Save & Apply consumes backend output before applying UCI and stops on generation failure', async () => {
    for (const fail of [false, true]) {
        const events = [];
        const generated = { nodes: {} };
        const handler = loadTS('utils/actions/save-apply/index.ts', {
            '../../../enum/hijpass': { LuciFlied: { CONF_NAME: 'hijpass', GLOBAL_SECTION_TYPE: 'hijpass' } },
            uci: { get_first: () => '1', save: async () => events.push('save'), changes: async () => ({}) },
            ui: { changes: { apply: async () => events.push('apply') } },
            './node-file-cleanup': { NodeFileCleanupUtils: { cleanupChangedNodeFiles: async () => events.push('cleanup') } },
            '../../base/luci/notification': { NotificationUtils: { error: () => events.push('error') } },
            '../../feature/config/backend': { GeneratedConfigUtils: { render: async () => {
                events.push('render');
                if (fail) throw new Error('invalid configuration');
                return generated;
            } } },
            '../../feature/config/files': { ConfigFileUtils: { writeGeneratedConfigs: async value => { assert.equal(value, generated); events.push('write'); } } },
            '../../feature/shunt/georules': { GeoRuleUtils: { updateGeoRules: () => events.push('geo') } },
            './precheck': { PrecheckUtils: { runSaveApplyPrechecks: async () => true } },
        }).SaveApplyUtils.genHandleSaveApply();
        await handler.call({ handleSave: async () => events.push('form') }, {}, 1);
        assert.deepEqual(events, fail ? ['form', 'render', 'error'] : ['form', 'render', 'write', 'geo', 'save', 'cleanup', 'apply']);
    }
});

test('init delegates lifecycle to Shell while preserving argv passed to procd', () => {
    const source = fs.readFileSync(path.join(root, 'root/etc/init.d/hijpass'), 'utf8');
    const bridge = fs.readFileSync(path.join(root, 'root/usr/lib/hijpass/service/procd.sh'), 'utf8');
    assert.match(source, /service[.]sh/);
    assert.ok(source.indexOf('$RUNTIME prepare') < source.indexOf('hijpass_start_instances "$plan"'));
    assert.ok(source.indexOf('hijpass_start_instances "$plan"') < source.indexOf('$RUNTIME activate'));
    assert.match(bridge, /set -- "\$@" "\$value"/);
    assert.doesNotMatch(source + bridge, /uci -q|config_foreach|geoview[.]sh/);
});

test('Geo metadata remains in UCI for the native converter', () => {
    const writes = [];
    const utils = loadTS('utils/feature/shunt/georules.ts', {
        uci: {
            get_first: (_conf, _section, key) => ({ type: 'sing-box', ruleset_convert: '1', enabled: '1' }[key]),
            set_first: (...args) => writes.push(args),
        },
        '../../../enum/hijpass': { LuciFlied: { CONF_NAME: 'hijpass', SHUNT_SECTION_TYPE: 'shunt' } },
        './section': { ShuntUtils: {
            getRouteSection: () => ({ rules: [{ enabled: '1' }, { enabled: '0' }] }),
            parseRuleList: rule => {
                assert.equal(rule.enabled, '1');
                return { geoSite: ['geosite:cn', 'geosite:cn'], geoIp: ['geoip:private'] };
            },
        } },
    }).GeoRuleUtils;
    utils.updateGeoRules();
    assert.deepEqual(JSON.parse(JSON.stringify(writes)), [
        ['hijpass', 'shunt', 'geosite_ruleset', ['cn']],
        ['hijpass', 'shunt', 'geoip_ruleset', ['private']],
    ]);
});
