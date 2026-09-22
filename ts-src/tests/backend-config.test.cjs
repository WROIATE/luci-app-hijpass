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
const binary = path.join(dir, 'hijpass-config');
const build = spawnSync('go', ['build', '-o', binary, '.'], {
    cwd: path.join(root, 'go-src'), encoding: 'utf8',
    env: { ...process.env, GOCACHE: process.env.GOCACHE || path.join(os.tmpdir(), 'hijpass-go-cache') }
});
assert.equal(build.status, 0, build.stderr);
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'go-src/testdata/compatibility.json')));
function rpc(method, request) {
    const result = spawnSync(binary, ['call', method], { input: JSON.stringify(request), encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}

test('rpcd advertises only read-only snapshot operations', () => {
    const result = spawnSync(binary, ['list'], { encoding: 'utf8' });
    assert.deepEqual(JSON.parse(result.stdout), { render: { sections: '', target: '' }, validate: { sections: '' } });
    assert.match(rpc('generate', {}).error, /unknown method/);
});
test('RPC renders the submitted snapshot and validates references', () => {
    const fixture = fixtures.find(f => f.name === 'sing-box-chain');
    const sections = JSON.stringify(fixture.sections);
    const expected = structuredClone(fixture.expected.nodes.downstream);
    // Native serializers omit false/zero defaults and add the required resolver.
    expected.route = { default_domain_resolver: 'local' };
    delete expected.log.disabled;
    if (expected.outbounds[0].tls) delete expected.outbounds[0].tls.insecure;
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
    vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, context);
    const utils = context.exports.GeneratedConfigUtils;
    await utils.preview('node');
    assert.equal(calls[0][0].object, 'hijpass-config');
    assert.deepEqual(JSON.parse(calls[0][1][0]), sections);
    assert.equal(calls[0][1][1], 'node');
    response = { error: 'bad dependency' };
    await assert.rejects(utils.validate(), /bad dependency/);
});

function restart(fail) {
    const script = path.join(dir, `init-${fail}`);
    const log = path.join(dir, `events-${fail}`);
    const generator = path.join(dir, `generator-${fail}`);
    fs.writeFileSync(generator, `#!/bin/sh\necho generate >> '${log}'\nexit ${fail ? 1 : 0}\n`, { mode: 0o700 });
    let source = fs.readFileSync(path.join(root, 'root/etc/init.d/hijpass'), 'utf8');
    source = source.replace('. /usr/lib/hijpass/app-logger.sh', 'log_error() { :; }')
        .replaceAll('/usr/bin/hijpass-config', generator);
    fs.writeFileSync(script, source);
    const result = spawnSync('/bin/sh', ['-c', `uci() { echo 1; }
. '${script}'
stop() { echo stop >> '${log}'; }
start() { echo start >> '${log}'; }
restart`], { encoding: 'utf8' });
    return { result, events: fs.readFileSync(log, 'utf8').trim().split('\n') };
}
test('restart generates before stopping and starting services', () => {
    const { result, events } = restart(false);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(events, ['generate', 'stop', 'start']);
});
test('failed generation leaves the running service alone', () => {
    const { result, events } = restart(true);
    assert.equal(result.status, 1);
    assert.deepEqual(events, ['generate']);
});
