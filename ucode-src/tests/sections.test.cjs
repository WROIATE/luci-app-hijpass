const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run, config, root } = require('./helpers.cjs');

function execute(t, source, input) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hijpass-sections-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const file = path.join(directory, 'check.uc');
    fs.writeFileSync(file, source);
    return run(file, [], input);
}
function modulePath(relative) { return JSON.stringify(path.join(root, 'root', relative)); }

test('section queries preserve order and references, and return null when absent', t => {
    const result = execute(t, `import { filterSectionsByType, findFirstSectionByType } from ${modulePath('usr/share/ucode/hijpass/config/sections.uc')};
let sections = [{ '.type': 'rule', '.name': 'rule' }, { '.type': 'dns', '.name': 'first' }, { '.type': 'dns', '.name': 'second' }];
let found = findFirstSectionByType(sections, 'dns');
found.marker = 'same object';
printf('%J', { found, original: sections[1], matches: filterSectionsByType(sections, 'dns'),
    missing: findFirstSectionByType(sections, 'missing'), empty: findFirstSectionByType([], 'dns'),
    noMatches: filterSectionsByType(sections, 'missing') });`);
    assert.equal(result.status, 0, result.stderr);
    const value = JSON.parse(result.stdout);
    assert.equal(value.found['.name'], 'first');
    assert.equal(value.original.marker, 'same object');
    assert.deepEqual(value.matches.map(s => s['.name']), ['first', 'second']);
    assert.equal(value.missing, null);
    assert.equal(value.empty, null);
    assert.deepEqual(value.noMatches, []);
});

test('absent optional services produce no instances, DNS settings or firewall rules', () => {
    for (const [action, expected] of [['plan', { instances: [] }], ['server-plan', { instances: [], ports: [] }],
        ['dns-options', null], ['firewall', '']]) {
        const result = run('ucode-src/tests/runtime.uc', [], { action, sections: [], dnsmasq: null });
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout), expected);
    }
});

test('a missing shunt is optional for rendering but fails an explicit shunt preview', () => {
    const sections = [{ '.type': 'hijpass', '.name': 'global', enabled: '1' }];
    const all = config(['render', '--stdin'], sections);
    assert.equal(all.status, 0, all.stderr);
    assert.deepEqual(JSON.parse(all.stdout), { nodes: {} });
    const preview = config(['render', '--stdin', '--target', 'shunt'], sections);
    assert.notEqual(preview.status, 0);
    assert.match(preview.stderr, /shunt section is missing/);
});

test('a missing DNS section does not enable DNS-maintained firewall sets', () => {
    const result = run('ucode-src/tests/runtime.uc', [], { action: 'firewall',
        sections: [{ '.type': 'firewall', '.name': 'firewall', proxy_port: '10001', tproxy_proto: 'tcp,udp' }],
        state: { wan: [], local4: [], local6: [], dns4: [], dns6: [] } },
    { paths: { '/etc/hijpass/firewall.ut': path.join(root, 'root/etc/hijpass/firewall.ut') } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /table inet hijpass/);
    assert.doesNotMatch(result.stdout, /set dns(?:proxy|bypass)[46]list/);
});

test('explicit rule updates reject a missing rule section, DNS extraction remains optional', t => {
    const result = execute(t, `import { updatePlan, dnsPlan } from ${modulePath('usr/lib/hijpass/rules/rules.uc')};
let message;
try { updatePlan([], 'all'); } catch (e) { message = e.message; }
printf('%J', { message, dns: dnsPlan([]) });`);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { message: 'rule section is missing', dns: { jobs: [] } });
});

test('chinadns uses its default dnsmasq port when the optional section is absent', () => {
    const result = run('ucode-src/tests/runtime.uc', [], { action: 'dns-options', dnsmasq: null,
        sections: [{ '.type': 'dns', '.name': 'dns', dns_service: 'chinadns-ng', cdg_port: '5353',
            direct_dns: 'dnsmasq', proxy_dns: '1.1.1.1' }] });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).direct, '127.0.0.1#53');
});

test('Xray routing rejects a missing default outbound before building its config', t => {
    const result = execute(t, `import { build } from ${modulePath('usr/share/ucode/hijpass/coreconfig/xray/routing.uc')};
build({ final: 'missing' }, { nodes: [] });`);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /default outbound "missing" is missing/);
});
