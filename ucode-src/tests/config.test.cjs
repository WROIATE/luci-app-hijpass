const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { config } = require('./helpers.cjs');
const fixtures = require('./testdata/compatibility.json');

function rpc(method, sections, target) {
    const result = config(['call', method], { sections: JSON.stringify(sections), target });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}
for (const fixture of fixtures) {
    test(`配置兼容：${fixture.name}`, () => {
        const result = config(['render', '--stdin'], fixture.sections);
        assert.equal(result.status, 0, result.stderr);
        const generated = JSON.parse(result.stdout);
        // 样本直接来自迁移前的 TS；严格比较默认值、数组、时长和规则顺序。
        assert.deepEqual(generated, fixture.expected);
        assert.deepEqual(rpc('render', fixture.sections), generated);
        assert.deepEqual(rpc('validate', fixture.sections), { ok: true });
        for (const [id, expected] of [...Object.entries(generated.nodes), ...(generated.shunt ? [['shunt', generated.shunt]] : [])]) {
            assert.deepEqual(rpc('render', fixture.sections, id), { config: expected });
            const preview = config(['render', '--stdin', '--target', id], fixture.sections);
            assert.equal(preview.status, 0, preview.stderr);
            assert.deepEqual(JSON.parse(preview.stdout), expected);
        }
    });
}

function node(id, options = {}) {
    return { '.name': id, '.type': 'proxy_node', name: id, enabled: '1', core: 'sing-box', type: 'shadowsocks',
        server: 'example.org', server_port: '443', listen_port: '10001', socks_port: '10002', ...options };
}
test('预检拒绝缺失引用、重复名称、循环、过长代理链及监听端口冲突', () => {
    const cases = [
        [[node('a', { upstream_proxy_node: 'missing' })], /missing/],
        [[node('a', { upstream_proxy_node: 'a' })], /cycle/],
        [[node('a'), node('b', { name: 'a', listen_port: '10003', socks_port: '10004' })], /duplicate proxy name/],
        [[node('a'), node('b')], /shared/],
        [[node('a', { server_port: '65536' })], /invalid port/],
        [[node('a', { multiplex_enabled: 'true' })], /invalid UCI boolean/],
        [[node('a', { multiplex_max_streams: '2147483648' })], /range/],
        [Array.from({ length: 4 }, (_, i) => node(String(i), {
            listen_port: String(10001 + i * 2), socks_port: String(10002 + i * 2),
            ...(i < 3 ? { upstream_proxy_node: String(i + 1) } : {}),
        })), /three nodes/],
        [[node('a', { type: 'load_balance' })], /no members/],
        [[node('a', { type: 'load_balance', member_node: ['b', 'b'] }), node('b', { listen_port: '10003', socks_port: '10004' })], /duplicate load balancing member/],
    ];
    for (const [sections, pattern] of cases) {
        assert.match(rpc('render', sections).error, pattern);
        const result = config(['render', '--stdin'], sections);
        assert.notEqual(result.status, 0);
        assert.equal(result.stdout, '');
        assert.match(result.stderr, pattern);
    }
});

test('最新版 Xray 不再支持 Shadowsocks UDP-over-TCP', () => {
    assert.match(rpc('render', [node('a', { core: 'xray', udp_over_tcp: '1' })]).error,
        /no longer supports.*udp_over_tcp/);
});
test('单节点预览只校验可达依赖，关闭服务仍可保存未完成配置', () => {
    const sections = [node('a'), node('broken', { type: 'invalid' })];
    assert.ok(rpc('render', sections, 'a').config);
    assert.match(rpc('render', sections).error, /unsupported proxy type/);
    sections.unshift({ '.name': 'global', '.type': 'hijpass', enabled: '0' });
    assert.deepEqual(rpc('validate', sections), { ok: true });
    sections[1].listen_port = 10001;
    assert.match(rpc('validate', sections).error, /string/);
});
test('原生 UCI 可独立读取，保留匿名配置段与 list 顺序', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hijpass-uci-'));
    try {
        fs.writeFileSync(path.join(dir, 'hijpass'), `config hijpass\n option enabled '1'\nconfig proxy_node 'a'\n option enabled '1'\n option core 'sing-box'\n option type 'shadowsocks'\n option server 'example.org'\n option server_port '443'\n option listen_port '10001'\n option socks_port '10002'\n`);
        const result = config(['render', '--configdir', dir]);
        assert.equal(result.status, 0, result.stderr);
        assert.ok(JSON.parse(result.stdout).nodes.a);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('RPC 保持契约，非法显式快照不会退回本机 UCI', () => {
    assert.deepEqual(JSON.parse(config(['list']).stdout), { render: { sections: '', target: '' }, validate: { sections: '' } });
    assert.match(rpc('generate', []).error, /unknown method/);
    assert.ok(JSON.parse(config(['call', 'render'], { sections: '' }).stdout).error);
    assert.match(rpc('render', {}).error, /unmarshal/);
    assert.match(rpc('render', [node('a')], 'missing').error, /not found/);
    assert.match(rpc('render', [node('a', { core: 'custom' })], 'a').error, /custom/);
});
