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

test('configuration CLI retains its snapshot generation and validation protocol', () => {
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
    const { Backend } = loadTS('utils/backend.ts', {
        rpc: { declare: options => async (...args) => { calls.push([options, args]); return response; } },
    });
    const context = vm.createContext({ exports: {}, require(name) {
        if (name === '../../backend') return { Backend };
        if (name === 'uci') return { sections: () => sections };
        if (name.endsWith('/hijpass')) return { LuciFlied: { CONF_NAME: 'hijpass' } };
        throw new Error(name);
    } });
    const source = fs.readFileSync(path.join(root, 'ts-src/utils/feature/config/backend.ts'), 'utf8');
    vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, context);
    const utils = context.exports.GeneratedConfigUtils;
    await utils.preview('node');
    assert.equal(calls[0][0].object, 'hijpass');
    assert.equal(calls[0][0].method, 'config_render');
    assert.deepEqual(JSON.parse(calls[0][1][0]), sections);
    assert.equal(calls[0][1][1], 'node');
    response = { error: 'bad dependency' };
    await assert.rejects(utils.validate(), /bad dependency/);
    assert.equal(calls[1][0].method, 'config_validate');
});

function loadTS(relative, modules) {
    const context = vm.createContext({ exports: {}, URLSearchParams, atob, btoa, console: { log() {} }, _: s => s, require(name) {
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

test('Save & Apply consumes backend output before applying UCI and stops on generation failure', async () => {
    for (const fail of [false, true]) {
        const events = [];
        const generated = { nodes: {} };
        const handler = loadTS('utils/actions/save-apply/index.ts', {
            '../../../enum/hijpass': { LuciFlied: { CONF_NAME: 'hijpass', GLOBAL_SECTION_TYPE: 'hijpass' } },
            uci: { sections: () => [], get_first: () => '1', save: async () => events.push('save'), changes: async () => ({}) },
            ui: { changes: { apply: async () => events.push('apply') } },
            './node-file-cleanup': { NodeFileCleanupUtils: { cleanupChangedNodeFiles: async () => events.push('cleanup') } },
            '../../base/luci/notification': { NotificationUtils: { error: () => events.push('error') } },
            '../../base/luci/form': { FormUtils: { simpleHash: () => 0 } },
            '../../backend': { Backend: { writeConfigs: async () => {
                events.push('write');
                if (fail) throw new Error('invalid configuration');
                return {};
            } } },
            './precheck': { PrecheckUtils: { runSaveApplyPrechecks: async () => true } },
        }).SaveApplyUtils.genHandleSaveApply();
        await handler.call({ handleSave: async () => events.push('form') }, {}, 1);
        assert.deepEqual(events, fail ? ['form', 'write', 'error'] : ['form', 'write', 'save', 'cleanup', 'apply']);
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

test('LuCI uses the same default core and ignores protocol dependencies on custom commands', async () => {
    const enums = loadTS('enum/hijpass.ts', {});
    const sections = new Map([
        ['custom', { name: 'custom', enabled: '1', config_type: 'custom', type: 'load_balance',
            upstream_proxy_node: 'custom', member_node: ['missing'], socks_port: '10002' }],
        ['balance', { name: 'balance', enabled: '1', type: 'load_balance', member_node: ['custom'] }],
    ]);
    const uci = { sections: () => Array.from(sections.values()), get_first: () => '' };
    const { ProxyChainUtils } = loadTS('utils/feature/proxy/chain.ts', {
        uci, '../../../enum/hijpass': enums,
    });
    for (const core of [undefined, '', 'sing-box', 'xray']) {
        assert.equal(ProxyChainUtils.getProxyCore({ type: 'vless', core }),
            core === 'xray' ? core : 'sing-box');
    }
    assert.deepEqual(Array.from(ProxyChainUtils.getProxyDependencies(sections.get('custom'))), []);
    assert.deepEqual(Array.from(ProxyChainUtils.collectProxyChain('custom', sections).chain), ['custom']);
    assert.equal(ProxyChainUtils.findProxyDependencyCycle(sections), undefined);
    assert.equal(ProxyChainUtils.resolveUpstreamProxy(sections.get('custom'), sections), undefined);
    assert.equal(ProxyChainUtils.resolveLoadBalanceMembers(sections.get('balance'), sections)[0].core, '');
    assert.equal(ProxyChainUtils.isCustomProxy({ core: 'custom', type: 'custom' }), false);
    const { PrecheckUtils } = loadTS('utils/actions/save-apply/precheck.ts', {
        uci, ui: {}, '../../../enum/hijpass': enums,
        '../../base/luci/notification': { NotificationUtils: { warning(...args) { assert.fail(JSON.stringify(args)); } } },
        '../../feature/shunt/section': {},
        '../../feature/proxy/chain': { ProxyChainUtils },
        '../../feature/firewall/dns-forward': { FirewallDnsForwardUtils: { getSource: () => '', validateSource: () => true } },
    });
    assert.equal(await PrecheckUtils.runSaveApplyPrechecks(), true);
});

test('share-link imports declare generated configuration and do not normalize legacy core values', () => {
    const enums = loadTS('enum/hijpass.ts', {});
    const { ProxyShareLinkUtils } = loadTS('utils/feature/proxy/share-link.ts', { '../../../enum/hijpass': enums });
    const uri = 'vless://11111111-1111-4111-8111-111111111111@example.org:443?security=tls';
    const imported = ProxyShareLinkUtils.parse(uri, 'sing-box');
    assert.equal(imported.values.config_type, 'generated');
    assert.equal(imported.values.core, 'sing-box');
    assert.throws(() => ProxyShareLinkUtils.parse(uri, 'singbox'), /Invalid core selection/);
    assert.equal(ProxyShareLinkUtils.canExport({ ...imported.values, config_type: 'custom' }), false);
    assert.equal(ProxyShareLinkUtils.canExport(imported.values), true);
    assert.throws(() => ProxyShareLinkUtils.parse(uri + '&type=http', 'xray'), /HTTP transport is only supported by sing-box/);
    assert.equal(ProxyShareLinkUtils.parse(uri + '&type=http', 'sing-box').values.transport_type, 'http');
    const xhttp = ProxyShareLinkUtils.parse(uri + '&type=xhttp&method=PUT', 'xray');
    assert.equal(xhttp.values.transport_xhttp_method, 'PUT');
    assert.equal(new URLSearchParams(ProxyShareLinkUtils.generate(xhttp.values).split('?')[1]).get('method'), 'PUT');
});
