const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, mkdtempSync, copyFileSync, chmodSync, rmSync, existsSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const defaults = {
    mode: 'client', clientIp: '192.168.1.100', protocol: 'all', port: '',
    url: '', method: 'HEAD', timeout: '30', tcpdump: false, tcpdumpInterface: 'any', verbose: false,
};

function loadPanel(fs, clock = { now: 0 }) {
    const source = readFileSync(path.join(root, 'ts-src/utils/feature/log/panel.ts'), 'utf8');
    const context = vm.createContext({
        exports: {}, require: name => name === 'fs' ? fs : {}, _: value => value, console,
        Date: class extends Date { static now() { return clock.now; } },
        window: { setTimeout(fn, ms) { clock.now += ms; fn(); } },
    });
    vm.runInContext(ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, context);
    return context;
}

test('client capture requires no URL or HTTP method and sends protocol/port filters', () => {
    const panel = loadPanel({});
    assert.deepEqual(Array.from(panel.buildTraceArgs({ ...defaults, url: 'invalid', method: 'invalid' })),
        ['-t', '30', '-c', '192.168.1.100', '-n', 'all', '-P', 'all']);
    assert.deepEqual(Array.from(panel.buildTraceArgs({ ...defaults, protocol: 'udp', port: '443' })),
        ['-t', '30', '-c', '192.168.1.100', '-n', 'udp', '-P', '443']);
    for (const port of ['0', '65536', '443;id', '-1']) {
        assert.throws(() => panel.buildTraceArgs({ ...defaults, port }), /destination port/);
    }
    assert.throws(() => panel.buildTraceArgs({ ...defaults, protocol: 'udp;id' }), /transport protocol/);
    assert.throws(() => panel.buildTraceArgs({ ...defaults, timeout: '121' }), /between 1 and 120/);
    const router = Array.from(panel.buildTraceArgs({ ...defaults, mode: 'router', url: 'https://example.com', method: 'GET' }));
    assert.deepEqual(router, ['-t', '30', '-X', 'GET', 'https://example.com']);
});

for (const seconds of [30, 120]) {
    test(`${seconds}s capture survives the 20s RPC limit and releases its result`, async () => {
        const clock = { now: 0 };
        const calls = [];
        const fs = {
            async exec(command, args) {
                calls.push([command, ...args]);
                // Reproduces the previous fs.exec(trace-url.sh) failure.
                if (command.endsWith('/trace-url.sh')) throw new Error('XHR request timed out');
                if (args[0] === 'start') return { code: 0, stdout: 'ABcd1234\n', stderr: '' };
                return { code: 0, stdout: '', stderr: '' };
            },
            async exec_direct(command, args) {
                assert.equal(command, '/usr/lib/hijpass/trace-task.sh');
                assert.deepEqual(Array.from(args), ['status', 'ABcd1234']);
                const running = clock.now < seconds * 1000;
                return { running, code: running ? null : 0, stdout: running ? 'Trace is active' : 'capture complete', stderr: '' };
            },
        };
        const panel = loadPanel(fs, clock);
        const status = { style: {} }, output = {}, button = {};
        await panel.runTraceDiagnostics({ ...defaults, timeout: String(seconds) }, status, output, button);
        assert.match(status.textContent, /^Trace Completed/);
        assert.match(output.innerHTML, /capture complete/);
        assert.equal(clock.now, seconds * 1000);
        assert.equal(button.disabled, false);
        assert.equal(calls.length, 2);
        assert.equal(calls[1][1], 'release');
    });
}

test('worker errors retain diagnostics and restore the run button', async () => {
    const panel = loadPanel({
        async exec() { return { code: 0, stdout: 'ABcd1234', stderr: '' }; },
        async exec_direct() { return { running: false, code: 1, stdout: 'setup report', stderr: 'tcpdump is required' }; },
    });
    const status = { style: {} }, output = {}, button = {};
    await panel.runTraceDiagnostics(defaults, status, output, button);
    assert.match(status.textContent, /Trace Failed.*tcpdump is required/);
    assert.match(output.innerHTML, /setup report/);
    assert.match(output.innerHTML, /tcpdump is required/);
    assert.equal(button.disabled, false);
});

function fixture(t) {
    const dir = mkdtempSync('/tmp/hijpass-trace-test-');
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, TRACE_TEST_LOG: path.join(dir, 'commands') };
    function script(name, body) {
        const file = path.join(dir, name);
        writeFileSync(file, '#!/bin/sh\n' + body + '\n');
        chmodSync(file, 0o755);
    }
    for (const name of ['trace-url.sh', 'trace-task.sh']) {
        copyFileSync(path.join(root, 'root/usr/lib/hijpass', name), path.join(dir, name));
        chmodSync(path.join(dir, name), 0o755);
    }
    script('id', 'echo 0');
    script('uci', 'exit 0');
    script('nslookup', 'echo unexpected-nslookup >>"$TRACE_TEST_LOG"; exit 1');
    script('curl', 'echo curl >>"$TRACE_TEST_LOG"');
    script('logread', 'exec /bin/sleep 180');
    script('sleep', '[ "$TRACE_REAL_SLEEP" = 1 ] && exec /bin/sleep "$@"; exec /bin/sleep 0.01');
    script('nft', `printf 'nft %s\\n' "$*" >>"$TRACE_TEST_LOG"
case "$*" in
    'monitor trace')
        printf 'trace id 123 inet hijpass trace-%s packet: ip saddr 192.168.1.100 ip daddr 8.8.8.8 udp sport 12345 udp dport 53\\n' \"$PPID\"
        if [ \"$TRACE_UNKNOWN_RULE\" = 1 ]; then
            printf 'trace id 123 inet hijpass trace-%s unknown rule handle 6 (verdict continue)\\n' \"$PPID\"
        else
            printf 'trace id 123 inet hijpass trace-%s rule meta nftrace set 1 comment \"hijpass-trace-%s\" (verdict continue)\\n' \"$PPID\" \"$PPID\"
        fi
        printf 'trace id 999 inet hijpass other packet: ip saddr 192.168.1.200 ip daddr 1.1.1.1\\n'
        exec /bin/sleep 180 ;;
    '-a list chain inet hijpass pre-filter')
        comment="$(sed -n 's/.*comment \\(hijpass-trace-[0-9]*\\).*/\\1/p' "$TRACE_TEST_LOG" | tail -n 1)"
        printf 'meta nftrace set 1 comment "%s" # handle 42\\n' "$comment" ;;
esac`);
    script('tcpdump', `printf 'tcpdump %s\\n' "$*" >>"$TRACE_TEST_LOG"
printf '1.0 br-lan In IP 192.168.1.100.12345 > 8.8.8.8.53: UDP, length 20\\n'
exec /bin/sleep 180`);
    return { dir, env, trace: path.join(dir, 'trace-url.sh'), task: path.join(dir, 'trace-task.sh') };
}

test('BusyBox client capture filters all/TCP/UDP and cleans its nft rule without DNS or curl', t => {
    const f = fixture(t);
    // BusyBox ash prefers built-in applets to PATH; override only in the test shell.
    const ash = ['ash', '-c', 'id() { echo 0; }; sleep() { /bin/sleep 0.01; }; trace_script="$1"; shift; . "$trace_script"', 'test'];
    for (const [protocol, port, expr, filter] of [
        ['all', 'all', 'ip saddr 192.168.1.100 meta nftrace', 'host 192.168.1.100'],
        ['all', '53', 'meta l4proto { tcp, udp } th dport 53', '((src host 192.168.1.100 and dst port 53) or (dst host 192.168.1.100 and src port 53)) and (tcp or udp)'],
        ['tcp', '443', 'meta l4proto tcp th dport 443', '((src host 192.168.1.100 and dst port 443) or (dst host 192.168.1.100 and src port 443)) and tcp'],
        ['udp', 'all', 'meta l4proto udp meta nftrace', 'host 192.168.1.100 and udp'],
    ]) {
        writeFileSync(f.env.TRACE_TEST_LOG, '');
        const out = execFileSync('busybox', [...ash, f.trace, '-c', '192.168.1.100', '-t', '30', '-n', protocol, '-P', port, '-p'], { env: f.env, encoding: 'utf8' });
        const calls = readFileSync(f.env.TRACE_TEST_LOG, 'utf8');
        assert.ok(calls.includes(expr), calls);
        assert.ok(calls.includes(filter), calls);
        assert.match(calls, /delete chain inet hijpass trace-/);
        assert.doesNotMatch(calls, /unexpected-nslookup|curl/);
        assert.doesNotMatch(out, /request: HEAD|target:|other_same_port_packets:/);
        assert.match(out, /udp: packets=1/);
        assert.match(out, /trace=123 udp \[192\.168\.1\.100\]:12345 -> \[8\.8\.8\.8\]:53/);
        assert.match(out, /payload_packets=0/);
        assert.doesNotMatch(out, /192\.168\.1\.200/);
        assert.match(calls, /priority -301/);
    }
    f.env.TRACE_UNKNOWN_RULE = '1';
    const out = execFileSync('busybox', [...ash, f.trace, '-c', '2001:db8::123', '-t', '1'], { env: f.env, encoding: 'utf8' });
    assert.match(readFileSync(f.env.TRACE_TEST_LOG, 'utf8'), /ip6 saddr 2001:db8::123/);
    assert.match(out, /client=2001:db8::123/);
    assert.match(out, /client_flows_total: 1/);
    assert.throws(() => execFileSync(f.trace, ['-c', '::1;flush ruleset', '-t', '1'], { env: f.env, stdio: 'pipe' }));
});

test('detached worker returns immediately, reports a real 30s capture, and cleans up', { timeout: 45000 }, async t => {
    const f = fixture(t);
    f.env.TRACE_REAL_SLEEP = '1';
    const startTime = Date.now();
    const id = execFileSync(f.task, ['start', '-c', '192.168.1.100', '-t', '30'], { env: f.env, encoding: 'utf8', timeout: 3000 }).trim();
    assert.match(id, /^[A-Za-z0-9]{8}$/);
    const taskDir = `/tmp/hijpass-trace-tasks/${id}`;
    t.after(() => rmSync(taskDir, { recursive: true, force: true }));
    assert.ok(Date.now() - startTime < 3000);
    let result;
    let sawActive = false;
    do {
        result = JSON.parse(execFileSync(f.task, ['status', id], { env: f.env, encoding: 'utf8', timeout: 3000 }));
        sawActive ||= result.stdout.includes('Trace is active');
        if (result.running) await new Promise(resolve => setTimeout(resolve, 500));
    } while (result.running);
    assert.ok(sawActive);
    assert.ok(Date.now() - startTime >= 30000);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /duration=30s/);
    assert.match(readFileSync(f.env.TRACE_TEST_LOG, 'utf8'), /delete chain inet hijpass trace-/);
    execFileSync(f.task, ['release', id], { env: f.env });
    assert.equal(existsSync(taskDir), false);
});

test('failed background capture exposes its exit status and task IDs reject traversal', async t => {
    const f = fixture(t);
    const id = execFileSync(f.task, ['start', '-c', '192.168.1.100', '-t', '121'], { env: f.env, encoding: 'utf8' }).trim();
    let result;
    do {
        result = JSON.parse(execFileSync(f.task, ['status', id], { env: f.env, encoding: 'utf8' }));
        if (result.running) await new Promise(resolve => setTimeout(resolve, 20));
    } while (result.running);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /timeout must be <= 120/);
    execFileSync(f.task, ['release', id], { env: f.env });
    assert.throws(() => execFileSync(f.task, ['status', '../../etc'], { env: f.env, stdio: 'pipe' }));
});
