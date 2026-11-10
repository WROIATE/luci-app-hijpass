const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('esbuild');
const mod = { exports: {} };
vm.runInNewContext(buildSync({ entryPoints: [path.join(__dirname, '../utils/feature/firewall/template.ts')],
    bundle: true, format: 'cjs', platform: 'node', write: false }).outputFiles[0].text,
{ module: mod, exports: mod.exports, _: s => s });
const { parseTemplate, editRule, replaceFragment, validPorts } = mod.exports;
const baseline = readFileSync(path.join(__dirname, '../../root/etc/hijpass/firewall.ut'), 'utf8');
const fragments = text => parseTemplate(text).flatMap(group => group.fragments);
const find = (text, title) => fragments(text).find(f => f.rule?.title === title);

test('default template is losslessly partitioned into chains, known rules and opaque fragments', () => {
    assert.equal(fragments(baseline).map(f => f.text).join(''), baseline);
    assert.ok(fragments(baseline).filter(f => f.rule).length >= 15);
    for (const group of parseTemplate(baseline)) for (const f of group.fragments)
        assert.equal(baseline.slice(f.start, f.end), f.text);
    assert.ok(find(baseline, 'Restrict shunt TCP ports').rule.enabled);
});

test('port edits and toggles preserve custom rules, comments, whitespace and CRLF exactly', () => {
    const custom = '\n        # 用户自定义规则\n        ip saddr 192.0.2.1 counter return comment "{keep}"\n';
    let text = ('\n' + baseline.replace('    chain proxy-port-filter {', '    chain proxy-port-filter {' + custom) + '\n').replace(/\n/g, '\r\n');
    const original = text;
    const f = find(text, 'Restrict shunt TCP ports');
    const changed = editRule(f, false, '80, 443, 8000-9000');
    text = replaceFragment(text, f, changed);
    assert.equal(text.slice(0, f.start), original.slice(0, f.start));
    assert.equal(text.slice(f.start + changed.length), original.slice(f.end));
    for (let i = 0; i < 5; i++) text = fragments(text).map(f => f.text).join('');
    const updated = find(text, 'Restrict shunt TCP ports');
    assert.equal(updated.rule.enabled, false);
    assert.equal(updated.rule.ports, '80, 443, 8000-9000');
    text = replaceFragment(text, updated, editRule(updated, true, f.rule.ports));
    assert.equal(text, original);
});

test('custom variants, duplicated rules and unknown chains are never rewritten as defaults', () => {
    const custom = baseline.replace('meta l4proto udp udp dport 443 counter reject', 'meta l4proto udp udp dport 443 counter drop');
    assert.equal(find(custom, 'Reject QUIC'), undefined);
    assert.equal(fragments(custom).map(f => f.text).join(''), custom);
    const duplicate = baseline.replace('        meta l4proto udp udp dport 443 counter reject',
        '        meta l4proto udp udp dport 443 counter reject\n        meta l4proto udp udp dport 443 counter reject');
    const rules = fragments(duplicate).filter(f => f.rule?.title === 'Reject QUIC');
    assert.equal(rules.length, 2);
    const edited = replaceFragment(duplicate, rules[1], editRule(rules[1], false));
    assert.equal(fragments(edited).filter(f => f.rule?.title === 'Reject QUIC' && f.rule.enabled).length, 1);
});

test('rule-looking code inside template comments and strings remains opaque', () => {
    const trap = '{% let sample = "\nchain proxy-port-filter {\nmeta l4proto udp udp dport 443 counter reject\n}\n"; /* %} */ %}\n'
        + '{#\nchain proxy-port-filter {\nmeta l4proto udp udp dport 443 counter reject\n}\n#}\n';
    const text = baseline.replace('table inet hijpass {', trap + 'table inet hijpass {');
    assert.equal(fragments(text).filter(f => f.rule?.title === 'Reject QUIC').length, 1);
    assert.equal(fragments(text).map(f => f.text).join(''), text);
});

test('unsupported or incomplete syntax falls back without trying to repair the source', () => {
    for (const text of ['{% let a = "unterminated', baseline + '}', baseline.slice(0, -3),
        '# {% let text = "\nchain fake {\n"; %}\n', '{% let r = /%}/; %}\n', 'chain x {\\\n}'])
        assert.equal(parseTemplate(text), null);
    assert.equal(parseTemplate('unrecognized code\n')[0].fragments[0].text, 'unrecognized code\n');
    assert.equal(parseTemplate('').length, 0);
});

test('port input rejects invalid bounds and source injection; stale fragments cannot overwrite changes', () => {
    for (const ports of ['', '0', '65536', '80,,443', '90-80', '80; drop', '80\naccept', '-1', '1.2']) assert.equal(validPorts(ports), false);
    for (const ports of ['1', '65535', '80,443', '1000-2000']) assert.equal(validPorts(ports), true);
    const f = find(baseline, 'Reject QUIC');
    assert.throws(() => editRule(f, true, '80; drop'));
    assert.throws(() => editRule(f, true, '80, 443'));
    assert.throws(() => editRule(f, true, '80-90'));
    assert.throws(() => replaceFragment('# modified\n' + baseline, f, editRule(f, false)));
});
