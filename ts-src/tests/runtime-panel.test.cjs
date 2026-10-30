const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function panel(active) {
    const calls = [], frames = [], pane = new EventTarget();
    pane.getAttribute = name => name === 'data-tab-active' ? String(active) : null;
    const context = vm.createContext({ exports: {}, _: value => value,
        E: (tag, attributes, children) => ({ tag, attributes, children, isConnected: true,
            closest(selector) { assert.equal(selector, '[data-tab="runtime"]'); return pane; } }),
        window: { requestAnimationFrame: fn => frames.push(fn) },
        require(name) {
            if (name.endsWith('/backend')) return { Backend: {
                coreAction: async (action, core) => { calls.push([action, core]); return { version: 'test' }; },
            } };
            if (name.endsWith('/enum/hijpass')) return { CORE_TYPE: { SING_BOX: 'sing-box', XRAY: 'xray' } };
            return { NotificationUtils: {} };
        },
    });
    const source = fs.readFileSync(path.join(__dirname, '../utils/feature/rule/runtime.ts'), 'utf8');
    vm.runInContext(ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText, context);
    const node = context.exports.RuntimePanelUtils.createCoreVersionPanel();
    return { calls, node, mounted: () => frames.shift()(),
        activate() { active = true; pane.dispatchEvent(new Event('cbi-tab-active')); } };
}

for (const active of [false, true]) test(`core versions load once when the runtime tab ${active ? 'is restored as active' : 'is first opened'}`, async () => {
    const f = panel(active);
    assert.deepEqual(f.calls, []);
    f.mounted();
    if (!active) {
        assert.deepEqual(f.calls, [], 'hidden runtime tab must not contact the backend');
        f.activate();
    }
    await new Promise(setImmediate);
    assert.deepEqual(f.calls, [['version', 'sing-box'], ['latest', 'sing-box'], ['version', 'xray'], ['latest', 'xray']]);
    f.activate();
    assert.equal(f.calls.length, 4, 'switching tabs again must not repeat version lookups');
});

test('a panel removed before its mount callback does not start version requests', () => {
    const f = panel(true);
    f.node.isConnected = false;
    f.mounted();
    assert.deepEqual(f.calls, []);
});
