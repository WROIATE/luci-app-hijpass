const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function panel(updateRules) {
    const nodes = [];
    function E(tag, attributes, children = []) {
        const node = { tag, attributes, style: {}, children: Array.isArray(children) ? children : [children],
            appendChild(child) { this.children.push(child); } };
        Object.defineProperty(node, 'textContent', {
            get() { return this.children.map(child => typeof child === 'string' ? child : child.textContent).join(''); },
            set(value) { this.children = [value]; },
        });
        nodes.push(node);
        return node;
    }
    const context = vm.createContext({ exports: {}, E, _: value => value,
        require: () => ({ Backend: { updateRules } }),
    });
    vm.runInContext('String.prototype.format = function(value) { return this.replace("%s", value); };', context);
    const source = fs.readFileSync(path.join(__dirname, '../utils/feature/rule/panel.ts'), 'utf8');
    vm.runInContext(ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText, context);
    context.exports.RulePanelUtils.createUpdateButtons();
    return { status: nodes.find(node => node.attributes.role === 'status'),
        button: nodes.find(node => node.tag === 'button') };
}

test('rule update failures show resource names with collapsed details, then clear details on success', async () => {
    const details = 'curl: (28) timed out\n'.repeat(40);
    const responses = [{ success: false, failed: ['geoip', 'chn_domain_list'], details }, { success: true }];
    const f = panel(async () => responses.shift());
    f.button.attributes.click({ preventDefault() {} });
    assert.equal(f.button.disabled, true);
    await new Promise(setImmediate);
    assert.equal(f.button.disabled, false);
    assert.equal(f.status.children[0], 'Rule File Update Failed: GeoIP, CHN Domain List');
    const disclosure = f.status.children.find(node => node.tag === 'details');
    assert.equal(disclosure.attributes.open, undefined);
    assert.equal(disclosure.children[1].tag, 'pre');
    assert.equal(disclosure.children[1].textContent, details);
    f.button.attributes.click({ preventDefault() {} });
    await new Promise(setImmediate);
    assert.equal(f.status.textContent, 'Rule Files Updated');
    assert.equal(f.status.children.length, 1);
    assert.equal(f.button.disabled, false);
});
