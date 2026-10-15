const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const definitions = [
    { name: 'pre-filter', hook: 'type filter hook prerouting priority filter - 50; policy accept;', requires: [] },
    { name: 'ordinary', hook: '', requires: [] },
];

function formFixture(chains = definitions) {
    const options = [], paths = [], reads = [];
    const controls = [];
    const section = { taboption(tab, type, field, title) {
        const input = { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
        const option = { tab, type, field, title, values: [], dependencies: [],
            value(value) { this.values.push(value); },
            depends(field, value) { this.dependencies.push([field, value]); },
            renderWidget() { return { querySelector: () => input }; }, input,
        };
        options.push(option);
        return option;
    } };
    const context = vm.createContext({ exports: {}, _: value => value,
        E: (tag, attributes, children) => ({ tag, attributes, children }),
        require(name) {
            if (name === 'view') return { extend: value => value };
            if (name.endsWith('/backend')) return { Backend: { firewallChains: async () => { reads.push('firewallChains'); return chains; } } };
            if (name === 'uci') return { load: async () => {} };
            if (name === 'form') return { ListValue: 'selector', DummyValue: 'hook', TextValue: 'editor' };
            if (name.endsWith('/hijpass')) return { LuciFlied: { CONF_NAME: 'hijpass' } };
            if (name.endsWith('/base/luci/form')) return { FormUtils: {
                createTextOption(section, tab, field, title, description, file) {
                    paths.push(file);
                    const editor = section.taboption(tab, 'editor', field, title);
                    controls.push(editor);
                    return editor;
                }
            } };
            if (name.endsWith('/firewall/form')) return { FirewallFormUtils: { createNftViewOption() {} } };
            if (name.endsWith('/save-apply/index')) return { SaveApplyUtils: { genHandleSaveApply() {} } };
            return {};
        }
    });
    const source = readFileSync(path.join(__dirname, '../views/firewall.ts'), 'utf8');
    vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, context);
    return { options, paths, reads, controls, context, section };
}

test('前端读取共享定义，选择器和编辑器无标题，hook 与规则按链关联展示', async () => {
    const f = formFixture();
    const loaded = await f.context.exports.default.load();
    assert.deepEqual(f.reads, ['firewallChains']);
    f.context.createTextOptions(f.section, loaded[2]);
    const selector = f.options.find(option => option.field === '_rule_chain');
    assert.equal(selector.title, null);
    assert.equal(selector.load(), definitions[0].name);
    selector.renderWidget();
    assert.equal(selector.input.attributes['aria-label'], 'Chain');
    assert.equal(selector.write('fw', 'out-route'), undefined);
    const editors = f.controls.filter(option => option.tab === 'nftables');
    assert.equal(editors.length, definitions.length);
    for (const chain of definitions) {
        const editor = editors.find(option => option.dependencies[0][1] === chain.name);
        assert.equal(editor.title, null);
        assert.equal(editor.retain, true, 'LuCI must not remove hidden chain files when saving');
        assert.match(editor.field, /^[A-Za-z0-9_]+$/);
        editor.renderWidget();
        assert.equal(editor.input.attributes['aria-label'], chain.name);
        assert.ok(selector.values.includes(chain.name));
        assert.ok(f.paths.some(editor => editor.resource === 'firewall_rule' && editor.section === chain.name));
        const hook = f.options.find(option => option.type === 'hook' && option.dependencies[0][1] === chain.name);
        assert.equal(hook.title, null);
        assert.equal(hook.renderWidget().tag, 'div');
        assert.equal(hook.renderWidget().attributes.class, 'cbi-value-description');
        assert.ok(hook.renderWidget().children.includes(chain.hook ? 'hook: ' : 'no hook'));
    }
    assert.equal(f.paths.some(editor => 'path' in editor), false);
});

test('共享定义增加链和修改 hook 后，前端直接展示配置而非硬编码列表', async () => {
    const chains = [{ name: 'additional-chain', hook: 'type filter hook forward priority 10; policy accept;', requires: [] }];
    const f = formFixture(chains);
    const loaded = await f.context.exports.default.load();
    f.context.createTextOptions(f.section, loaded[2]);
    assert.equal(f.options.find(option => option.field === '_rule_chain').load(), 'additional-chain');
    assert.equal(f.controls.filter(option => option.tab === 'nftables').length, 1);
    assert.equal(f.options.find(option => option.type === 'hook').renderWidget().children,
        'hook: forward · type: filter · priority: 10 · policy: accept');
});

test('ACL 仅提供业务接口，不授予前端通用文件或命令权限', () => {
    const acl = JSON.parse(readFileSync(path.join(__dirname, '../../root/usr/share/rpcd/acl.d/luci-app-hijpass.json'), 'utf8'))['luci-app-hijpass'];
    assert.ok(acl.read.ubus.hijpass.includes('firewall_chains'));
    assert.equal(acl.read.file, undefined);
    assert.equal(acl.write.file, undefined);
    assert.equal(acl.read.ubus.hijpass.includes('editor_write'), false);
    assert.ok(acl.write.ubus.hijpass.includes('editor_write'));
});
