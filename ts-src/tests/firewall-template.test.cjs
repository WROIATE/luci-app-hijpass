const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const definitionPath = '/usr/lib/hijpass/firewall/chains.json';
const definitions = JSON.parse(readFileSync(path.join(__dirname, '../../root', definitionPath), 'utf8'));

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
            if (name === 'fs') return { read: async file => { reads.push(file); return JSON.stringify(chains); } };
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
            if (name.endsWith('/paths')) return { FilePathUtils: { getFilePath: option =>
                option === 'firewall_rules' ? '/custom/chain-rules' : '/etc/hijpass/' + option } };
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
    assert.deepEqual(f.reads, [definitionPath]);
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
        assert.ok(f.paths.includes('/custom/chain-rules/' + chain.name + '.ut'));
        const hook = f.options.find(option => option.type === 'hook' && option.dependencies[0][1] === chain.name);
        assert.equal(hook.title, null);
        assert.equal(hook.renderWidget().tag, 'code');
        assert.equal(hook.renderWidget().children, chain.hook || 'Regular chain (no hook)');
    }
    assert.equal(f.paths.some(file => /\/usr\/lib\/|ruleset\.ut|sets\.ut|fw4-template/.test(file)), false);
});

test('共享定义增加链和修改 hook 后，前端直接展示配置而非硬编码列表', async () => {
    const chains = [{ name: 'additional-chain', hook: 'type filter hook forward priority 10; policy accept;', requires: [] }];
    const f = formFixture(chains);
    const loaded = await f.context.exports.default.load();
    f.context.createTextOptions(f.section, loaded[2]);
    assert.equal(f.options.find(option => option.field === '_rule_chain').load(), 'additional-chain');
    assert.equal(f.controls.filter(option => option.tab === 'nftables').length, 1);
    assert.equal(f.options.find(option => option.type === 'hook').renderWidget().children, chains[0].hook);
});

test('共享定义在 LuCI ACL 中只有读取权限', () => {
    const acl = JSON.parse(readFileSync(path.join(__dirname, '../../root/usr/share/rpcd/acl.d/luci-app-hijpass.json'), 'utf8'))['luci-app-hijpass'];
    assert.deepEqual(acl.read.file[definitionPath], ['read']);
    assert.equal(acl.write.file[definitionPath], undefined);
});
