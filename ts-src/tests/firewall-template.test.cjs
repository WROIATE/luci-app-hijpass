const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');

test('链编辑器只访问规则文件，隐藏编辑器保留内容，哈希字段可写入 UCI', () => {
    const options = [];
    const section = { taboption(tab, type, field) {
        const option = { tab, field, values: [], dependencies: [],
            value(value) { this.values.push(value); },
            depends(field, value) { this.dependencies.push([field, value]); },
        };
        options.push(option);
        return option;
    } };
    const paths = [];
    const context = vm.createContext({ exports: {}, _: value => value, require(name) {
        if (name === 'view') return { extend: value => value };
        if (name.endsWith('/base/luci/form')) return { FormUtils: {
            createTextOption(section, tab, field, title, description, file) {
                paths.push(file);
                return section.taboption(tab, null, field);
            }
        } };
        if (name.endsWith('/paths')) return { FilePathUtils: { getFilePath: option =>
            option === 'firewall_rules' ? '/custom/chain-rules' : '/etc/hijpass/' + option } };
        if (name.endsWith('/firewall/form')) return { FirewallFormUtils: { createNftViewOption() {} } };
        if (name.endsWith('/save-apply/index')) return { SaveApplyUtils: { genHandleSaveApply() {} } };
        return {};
    } });
    const source = readFileSync(path.join(__dirname, '../views/firewall.ts'), 'utf8');
    vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, context);
    context.createTextOptions(section);
    const selector = options.find(option => option.field === '_rule_chain');
    assert.equal(selector.load(), 'pre-filter');
    assert.equal(selector.write('fw', 'out-route'), undefined);
    const editors = options.filter(option => option.dependencies.length);
    assert.equal(editors.length, 7);
    for (const editor of editors) {
        assert.equal(editor.retain, true, 'LuCI must not remove hidden chain files when saving');
        assert.match(editor.field, /^[A-Za-z0-9_]+$/);
        const [field, chain] = editor.dependencies[0];
        assert.equal(field, '_rule_chain');
        assert.ok(selector.values.includes(chain));
        assert.ok(paths.includes('/custom/chain-rules/' + chain + '.ut'));
    }
    assert.equal(paths.some(file => /\/usr\/lib\/|ruleset\.ut|sets\.ut|fw4-template/.test(file)), false);
});
