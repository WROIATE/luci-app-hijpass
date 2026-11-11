const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');

function load(file, globals, modules = {}) {
    const context = vm.createContext({ exports: {}, console, structuredClone, Blob, ...globals,
        require: name => { if (!(name in modules)) throw new Error('Unexpected import: ' + name); return modules[name]; },
    });
    vm.runInContext('String.prototype.format = function(v) { return this.replace(/%[sd]/, v); };', context);
    vm.runInContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, context);
    return context.exports;
}
function fixture({ indexedDB = new IDBFactory(), sid = 'session-one', files = new Map([['domain_proxy', 'original']]) } = {}) {
    const globals = { indexedDB, IDBKeyRange };
    const storage = load('utils/feature/config/drafts.ts', globals);
    const store = new storage.DraftStore(sid), events = [], document = new EventTarget();
    const state = { authorized: true, failWrite: false, deniedSessions: new Set() };
    const sections = { dns: { '.type': 'dns' }, node: { '.type': 'proxy_node', name: 'renamed' } };
    const key = editor => editor.resource + (editor.section ? ':' + editor.section + ':' + editor.name : '');
    const request = { request: async url => { events.push(['apply', url]); return { status: 200 }; } };
    const api = load('modules/drafts.ts', { ...globals, document, location: { reload() {} },
        L: { env: { sessionid: sid }, url: s => '/' + s, loaded: false },
        _: s => s, E: (tag, attrs, ...children) => ({ tag, attrs, children }),
        fetch: async (url, options) => {
            const action = url.split('?')[1], data = JSON.parse(options.body);
            events.push([action, data.editor?.resource]);
            let result = { ok: true }, status = 200;
            if (!state.authorized || state.deniedSessions.has(options.headers.Authorization.slice(7))) { result = { error: 'session expired' }; status = 403; }
            else if (action === 'session') result = { ok: true, sessions: (data.sessions || []).filter(sid => !state.deniedSessions.has(sid)) };
            else if (action === 'read') result = { content: files.get(key(data.editor)) || '' };
            else if (action === 'check' || action === 'write') {
                const current = files.get(key(data.editor)) || '';
                if (current !== data.original && current !== data.content) { result = { error: 'file changed' }; status = 409; }
                else if (action === 'write') {
                    if (state.failWrite) { result = { error: 'write failed' }; status = 400; }
                    else files.set(key(data.editor), data.content);
                }
            }
            return { ok: status === 200, status, json: async () => result };
        },
    }, {
        baseclass: { extend: value => value },
        uci: { unload() {}, load: async () => {}, get: (_, id) => sections[id],
            set: (...args) => events.push(['hash', ...args]), save: async () => events.push(['uci-save']) },
        ui: { changes: { apply() {} }, addNotification: (_, node) => events.push(['error', node]), showIndicator() {}, hideIndicator() {} },
        request, session: { getLocalData: () => [], setLocalData() {} },
        '../utils/feature/config/drafts': storage,
        '../utils/feature/config/diff': { fileDiff: () => ({ lines: [], truncated: false }) },
    }).default;
    return { api, store, events, files, indexedDB, document, request, state, sections };
}
const editor = { resource: 'domain_proxy' };
const tick = () => new Promise(resolve => setTimeout(resolve, 15));

test('Save persists draft across pages in the same session without file or UCI writes', async () => {
    const f = fixture();
    await f.api.save(editor, ' new\r\ncontent ', 'dns', 'domain_proxy_hash');
    assert.equal(f.files.get('domain_proxy'), 'original');
    assert.equal(f.events.some(([kind]) => ['write', 'hash', 'uci-save', 'apply'].includes(kind)), false);
    const next = fixture(f);
    assert.equal(await next.api.read(editor), 'new\ncontent');
    const other = fixture({ ...f, sid: 'session-two' });
    assert.equal(await other.api.read(editor), 'original');
    assert.equal((await other.store.list()).length, 0);
});

test('unchanged files need no draft; reverting edits removes the draft', async () => {
    const f = fixture();
    await f.api.save(editor, 'original\n', 'dns', 'hash');
    assert.equal((await f.store.list()).length, 0);
    await f.api.save(editor, 'new', 'dns', 'hash');
    await f.api.save(editor, 'original', 'dns', 'hash');
    assert.equal((await f.store.list()).length, 0);
});

test('global Apply writes files then hashes then native request; confirmation clears drafts', async () => {
    const f = fixture();
    await f.api.save(editor, 'new', 'dns', 'hash');
    await f.request.request('/admin/uci/apply_rollback', { method: 'post' });
    assert.equal(f.files.get('domain_proxy'), 'new');
    assert.deepEqual(f.events.filter(([kind]) => ['write', 'hash', 'uci-save', 'apply'].includes(kind)).map(([kind]) => kind),
        ['write', 'hash', 'uci-save', 'apply']);
    assert.equal((await f.store.list()).length, 1);
    f.document.dispatchEvent(new Event('uci-applied'));
    await tick();
    assert.equal((await f.store.list()).length, 0);
});

test('failed upload and external file conflict retain drafts and block native apply', async () => {
    const f = fixture();
    await f.api.save(editor, 'new', 'dns', 'hash');
    f.state.failWrite = true;
    assert.equal((await f.request.request('/admin/uci/apply_unchecked', { method: 'post' })).status, 409);
    assert.equal(f.events.some(([kind]) => ['hash', 'apply'].includes(kind)), false);
    assert.equal((await f.store.list()).length, 1);
    f.state.failWrite = false;
    f.files.set('domain_proxy', 'edited outside browser');
    assert.equal((await f.request.request('/admin/uci/apply_unchecked', { method: 'post' })).status, 409);
    assert.equal(f.files.get('domain_proxy'), 'edited outside browser');
    assert.equal(f.events.some(([kind]) => kind === 'apply'), false);
});

test('native Revert clears drafts; unrelated requests never upload', async () => {
    const f = fixture();
    await f.api.save(editor, 'new', 'dns', 'hash');
    await f.request.request('/admin/status/overview', { method: 'get' });
    assert.equal(f.files.get('domain_proxy'), 'original');
    f.document.dispatchEvent(new Event('uci-reverted'));
    await tick();
    assert.equal((await f.store.list()).length, 0);
});

test('expired session cannot read or apply a cached draft and clears its data', async () => {
    const f = fixture();
    await f.api.save(editor, 'new', 'dns', 'hash');
    f.state.authorized = false;
    await assert.rejects(f.api.read(editor), /session expired/);
    assert.equal((await f.store.list()).length, 0);
    assert.equal(f.files.get('domain_proxy'), 'original');
});

test('a new login preserves live RPC sessions and cleans expired sessions without reusing drafts', async () => {
    const f = fixture();
    await f.api.save(editor, 'new', 'dns', 'hash');
    const next = fixture({ ...f, sid: 'new-login' });
    await tick();
    assert.equal((await f.store.list()).length, 1);
    assert.equal(await next.api.read(editor), 'original');
    const expired = fixture({ ...f, sid: 'another-login' });
    expired.state.deniedSessions.add('session-one');
    await tick();
    assert.equal((await f.store.list()).length, 0);
});

test('apply confirmation preserves a draft edited in another tab during apply', async () => {
    const f = fixture();
    await f.api.save(editor, 'first', 'dns', 'hash');
    await f.request.request('/admin/uci/apply_rollback', { method: 'post' });
    const tab = fixture(f);
    await tab.api.save(editor, 'second', 'dns', 'hash');
    f.document.dispatchEvent(new Event('uci-applied'));
    await tick();
    assert.equal(await tab.api.read(editor), 'second');
    assert.equal((await tab.store.list()).length, 1);
    assert.equal((await tab.request.request('/admin/uci/apply_rollback', { method: 'post' })).status, 200);
    assert.equal(f.files.get('domain_proxy'), 'second');
});

test('deleted sections discard their drafts instead of recreating files', async () => {
    const f = fixture();
    await f.api.save(editor, 'new', 'dns', 'hash');
    delete f.sections.dns;
    await f.request.request('/admin/uci/apply_rollback', { method: 'post' });
    assert.equal(f.files.get('domain_proxy'), 'original');
    assert.equal((await f.store.list()).length, 0);
});

test('5 MiB draft survives reload and uploads without the ubus message limit', async () => {
    const f = fixture(), content = '#'.repeat(5 * 1024 * 1024);
    await f.api.save(editor, content, 'dns', 'hash');
    const next = fixture(f);
    assert.equal((await next.api.read(editor)).length, content.length);
    await next.request.request('/admin/uci/apply_unchecked', { method: 'post' });
    assert.equal(next.files.get('domain_proxy'), content);
});

test('IndexedDB failure cannot report a successful Save or mutate UCI', async () => {
    const f = fixture({ indexedDB: { open() { const request = {}; queueMicrotask(() => {
        request.error = new Error('storage unavailable'); request.onerror();
    }); return request; } } });
    await assert.rejects(f.api.save(editor, 'new', 'dns', 'hash'), /storage unavailable/);
    assert.equal(f.events.some(([kind]) => ['write', 'hash'].includes(kind)), false);
});


test('switching a custom node back to a template discards its draft on Apply', async () => {
    const f = fixture();
    await f.api.save({ resource: 'proxy_config', section: 'node', name: 'renamed' }, '{}', 'node', 'custom_conf_hash');
    f.sections.node.config_type = 'tmpl';
    await f.request.request('/admin/uci/apply_rollback', { method: 'post' });
    assert.equal((await f.store.list()).length, 0);
    assert.equal(f.events.some(([kind]) => kind === 'write'), false);
});
