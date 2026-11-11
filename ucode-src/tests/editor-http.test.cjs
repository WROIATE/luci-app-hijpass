const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { root, interpreter, shellRuntime } = require('./helpers.cjs');

function fixture(t) {
    const directory = fs.mkdtempSync('/tmp/hijpass-editor-http-');
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const runtime = path.join(directory, 'runtime');
    fs.cpSync(shellRuntime(), runtime, { recursive: true });
    const file = path.join(directory, 'domains.txt');
    fs.writeFileSync(file, 'original\n', { mode: 0o600 });
    const paths = path.join(runtime, 'ucode/hijpass/config/paths.uc');
    fs.writeFileSync(paths, fs.readFileSync(paths, 'utf8')
        .replaceAll('/etc/hijpass/rules/domain-proxy.txt', file).replaceAll('/tmp/hijpass/log', directory));
    const cgi = path.join(directory, 'editor.uc');
    fs.writeFileSync(cgi, fs.readFileSync(path.join(root, 'root/www/cgi-bin/hijpass-editor'), 'utf8')
        .replace("from 'ubus'", "from './bus.uc'").replaceAll('/usr/lib/hijpass', runtime));
    fs.writeFileSync(path.join(directory, 'bus.uc'), `export function connect() {
        return { call: (object, method, args, mode) => {
            if (object == 'session' && method == 'list') {
                if (length(args) || mode != 'multiple') die('must not refresh old sessions');
                return [{ ubus_rpc_session: '${'b'.repeat(32)}' }];
            }
            if (object != 'session' || method != 'access' || args.scope != 'ubus' || args.object != 'hijpass') die('incorrect ACL request');
            return { access: getenv('TEST_ACCESS') != 'deny' && (getenv('TEST_ACCESS') != 'read' || args.function == 'editor_read') };
        }, disconnect: () => null };
    };`);
    const args = ['-S', '-L', path.join(runtime, 'ucode'), '--', cgi];
    function options(action, input, env = {}) {
        return { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
            env: { ...process.env, REQUEST_METHOD: 'POST', CONTENT_TYPE: 'application/json',
                CONTENT_LENGTH: String(Buffer.byteLength(input)), HTTP_AUTHORIZATION: 'Bearer ' + 'a'.repeat(32), QUERY_STRING: action, ...env } };
    }
    function parse(output) {
        const [headers, body] = output.split('\r\n\r\n');
        return { status: Number(headers.match(/Status: (\d+)/)[1]), ...JSON.parse(body) };
    }
    function call(action, payload = {}, env = {}) {
        const input = JSON.stringify(payload);
        const result = spawnSync(interpreter, args, { ...options(action, input, env), input });
        assert.equal(result.status, 0, result.stderr || result.signal || String(result.error || ''));
        return parse(result.stdout);
    }
    function start(action, payload) {
        const input = JSON.stringify(payload), child = spawn(interpreter, args, options(action, input));
        t.after(() => child.kill());
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        const response = new Promise((resolve, reject) => {
            let stdout = '', stderr = '';
            child.stdout.on('data', chunk => { stdout += chunk; });
            child.stderr.on('data', chunk => { stderr += chunk; });
            child.on('error', reject);
            child.on('close', (code, signal) => {
                try { assert.equal(code, 0, stderr || signal); resolve(parse(stdout)); }
                catch (error) { reject(error); }
            });
        });
        return { child, input, response };
    }
    return { call, start, file };
}
const editor = { resource: 'domain_proxy' };

test('HTTP editor authenticates before parsing content and distinguishes read/write ACLs', t => {
    const f = fixture(t);
    assert.equal(f.call('read', { editor }).content, 'original\n');
    assert.equal(f.call('read', { editor }, { TEST_ACCESS: 'deny' }).status, 403);
    assert.equal(f.call('read', { editor }, { TEST_ACCESS: 'read' }).status, 200);
    assert.equal(f.call('write', { editor, original: 'original', content: 'new' }, { TEST_ACCESS: 'read' }).status, 403);
    assert.equal(f.call('session', {}, { HTTP_AUTHORIZATION: '' }).status, 400);
    assert.equal(f.call('read', { editor }, { CONTENT_TYPE: 'text/plain' }).status, 400);
    assert.equal(fs.readFileSync(f.file, 'utf8'), 'original\n');
});

test('HTTP preflight writes nothing and rejects conflicts and arbitrary paths', t => {
    const f = fixture(t), payload = { editor, original: 'original', content: 'new' };
    assert.equal(f.call('check', payload).status, 200);
    assert.equal(fs.readFileSync(f.file, 'utf8'), 'original\n');
    fs.writeFileSync(f.file, 'external edit\n');
    assert.equal(f.call('write', payload).status, 409);
    assert.equal(fs.readFileSync(f.file, 'utf8'), 'external edit\n');
    assert.notEqual(f.call('write', { ...payload, editor: { resource: '../../etc/passwd' } }).status, 200);
});

test('HTTP editor accepts a 5 MiB file, normalizes it, keeps mode, and permits idempotent retry', t => {
    const f = fixture(t), content = 'x'.repeat(5 * 1024 * 1024);
    const payload = { editor, original: 'original', content };
    assert.equal(f.call('write', payload).status, 200);
    assert.equal(fs.readFileSync(f.file, 'utf8'), content + '\n');
    assert.equal(fs.statSync(f.file).mode & 0o777, 0o600);
    assert.equal(f.call('write', payload).status, 200);
    assert.equal(f.call('read', { editor }).content.length, content.length + 1);
    assert.notEqual(f.call('write', payload, { CONTENT_LENGTH: String(41 * 1024 * 1024) }).status, 200);
});


test('session cleanup only reports supplied live IDs and does not renew old sessions', t => {
    const f = fixture(t), sessions = ['b'.repeat(32), 'c'.repeat(32)];
    const response = f.call('session', { sessions });
    assert.equal(response.status, 200);
    assert.deepEqual(response.sessions, [sessions[0]]);
    assert.equal(f.call('session', { sessions: ['invalid'] }).status, 400);
});


test('an incomplete request ending at EOF fails without writing', t => {
    const f = fixture(t), payload = { editor, original: 'original', content: 'new' };
    const response = f.call('write', payload, { CONTENT_LENGTH: String(Buffer.byteLength(JSON.stringify(payload)) + 1) });
    assert.equal(response.status, 400);
    assert.match(response.error, /incomplete/);
    assert.equal(fs.readFileSync(f.file, 'utf8'), 'original\n');
});

test('a stalled request releases its CGI slot without waiting for stdin to close', { timeout: 9000 }, async t => {
    const f = fixture(t), { child, input, response } = f.start('write', { editor, original: 'original', content: 'new' });
    const began = Date.now();
    child.stdin.write(input.slice(0, -1));
    const result = await response;
    assert.equal(result.status, 408);
    assert.match(result.error, /timed out/);
    assert.ok(Date.now() - began < 8000);
    assert.equal(fs.readFileSync(f.file, 'utf8'), 'original\n');
});

test('request timeout measures inactivity, not total upload duration', { timeout: 11000 }, async t => {
    const f = fixture(t), { child, input, response } = f.start('write', { editor, original: 'original', content: 'new' });
    child.stdin.write(input.slice(0, 10));
    await delay(3000);
    child.stdin.write(input.slice(10, 20));
    await delay(3000);
    child.stdin.write(input.slice(20));
    assert.equal((await response).status, 200);
    assert.equal(fs.readFileSync(f.file, 'utf8'), 'new\n');
});
