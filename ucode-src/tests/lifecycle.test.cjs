const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const { root, interpreter, shellRuntime } = require('./helpers.cjs');

function fixture(t) {
    const directory = fs.mkdtempSync('/tmp/hijpass-lifecycle-test-');
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const runtime = directory + '/runtime', original = shellRuntime(), state = directory + '/state';
    fs.cpSync(original, runtime, { recursive: true });
    for (const name of fs.readdirSync(runtime, { recursive: true })) {
        if (!/\.(uc|sh)$/.test(name) && name !== 'testbin/ucode') continue;
        const file = runtime + '/' + name;
        fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll(original, runtime));
    }
    const patch = (file, before, after) => fs.writeFileSync(runtime + '/' + file,
        fs.readFileSync(runtime + '/' + file, 'utf8').replaceAll(before, after));
    const data = (file, args = []) => spawnSync(interpreter, ['-S', '-L', runtime + '/ucode', '--', runtime + '/' + file, ...args],
        { encoding: 'utf8', env: process.env });
    const script = (name, body) => fs.writeFileSync(directory + '/' + name, '#!/bin/sh\n' + body + '\n', { mode: 0o755 });
    fs.mkdirSync(directory + '/config');
    fs.writeFileSync(directory + '/config/hijpass', "config hijpass 'global'\n option enabled '1'\n");
    patch('service/transaction.uc', '/etc/config', directory + '/config');
    patch('service/lifecycle.sh', '/etc/hijpass/fw4-rules.nft', directory + '/fw4-rules.nft');
    patch('ucode/hijpass/config/paths.uc', '/tmp/hijpass/log', directory + '/log');
    const destination = directory + '/core.json';
    fs.writeFileSync(destination, 'old');
    // 只替换安装副本的系统边界，保留事务、init 编排与 procd 命令参数处理。
    fs.writeFileSync(runtime + '/service/service.sh', `#!/bin/sh
printf '%s\\n' "$1" >>'$EVENTS'
case "$1" in
prepare)
    [ "$FAIL_PHASE" != prepare ] || exit 1
    mkdir -p "$5${path.dirname(destination)}"
    printf 'new' >"$5${destination}"
    printf '{"instances":[{"id":"node","name":"test","command":["sleep","100"],"env":[],"user":"root"}]}' ;;
activate) [ "$FAIL_PHASE" != activate ] ;;
deactivate) exit 0 ;;
esac
`.replaceAll('$EVENTS', directory + '/events'), { mode: 0o755 });
    fs.writeFileSync(runtime + '/firewall/firewall.sh', '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    fs.writeFileSync(runtime + '/service/readinesscli.uc', `import * as fs from 'fs';
let file = '${directory}/events', f = fs.open(file, 'a'); f.write('ready\\n'); f.close();
if (fs.readfile('${directory}/fail-ready') && index(ARGV[0], '/active/') < 0) exit(1);
`);
    script('sleep', ':');
    script('nft', ':');
    script('jsonfilter', 'cat >/dev/null; [ -f "' + directory + '/registered" ]');
    script('ubus', `case "$3" in
set) case "$4" in *node-test*) echo submit >>'${directory}/events'; [ "$FAIL_PHASE" != submit ] || exit 1 ;; *) echo register >>'${directory}/events' ;; esac; touch '${directory}/registered' ;;
list) if [ -f '${directory}/registered' ]; then echo '{"hijpass":{}}'; else echo '{}'; fi ;;
delete) echo kill >>'${directory}/events'; rm -f '${directory}/registered' ;;
esac`);
    fs.writeFileSync(directory + '/procd.sh', `
procd_open_service() { json_set_namespace procd; json_init; json_add_string name "$1"; json_add_object instances; json_set_namespace ''; }
procd_open_instance() { _procd_call json_add_object "$1"; }
procd_set_param() { :; }
procd_close_instance() { _procd_call json_close_object; }
procd_close_service() { _procd_call close_service; }
close_service() { json_close_object; _procd_ubus_call set; }
procd_kill() { ubus call service delete; }
procd_running() { [ -f '${directory}/registered' ]; }
`);
    patch('service/lifecycle.sh', '/lib/functions/procd.sh', directory + '/procd.sh');
    patch('service/lifecycle.sh', 'state_directory="/tmp/$service_name-service"', 'state_directory="' + state + '"');
    // shellRuntime 已经映射 common.sh；这里加载真实 init，并提供 rc.common 的命令注册。
    fs.writeFileSync(directory + '/init', fs.readFileSync(root + '/root/etc/init.d/hijpass', 'utf8').replaceAll('/usr/lib/hijpass', runtime));
    script('entry', `initscript=/etc/init.d/hijpass
extra_command() { :; }
. '${directory}/init'
sleep() { :; }
"$@"`);
    function run(action, fail) {
        fs.writeFileSync(directory + '/events', '');
        return spawnSync('/usr/bin/busybox', ['ash', directory + '/entry', action], { encoding: 'utf8',
            env: { ...process.env, FAIL_PHASE: fail || '', PATH: directory + ':' + runtime + '/testbin:' + process.env.PATH } });
    }
    return { directory, runtime, state, destination, patch, data, run,
        events: () => fs.readFileSync(directory + '/events', 'utf8').trim().split('\n') };
}

test('候选准备先于停止，procd 提交和就绪检查先于流量接入；成功版本可用于回滚', t => {
    const f = fixture(t), result = f.run('restart');
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(f.events(), ['prepare', 'deactivate', 'submit', 'ready', 'ready', 'activate']);
    assert.equal(fs.readFileSync(f.destination, 'utf8'), 'new');
    assert.equal(JSON.parse(fs.readFileSync(f.state + '/status.json')).state, 'applied');
    assert.equal(fs.existsSync(f.state + '/active/plan.json'), true);
    const previous = fs.readlinkSync(f.state + '/active');
    assert.equal(f.run('restart').status, 0);
    assert.notEqual(fs.readlinkSync(f.state + '/active'), previous);
    assert.equal(fs.existsSync(previous), false);
});

for (const fail of ['prepare', 'submit', 'activate', 'readiness']) test(`生命周期 ${fail} 失败返回非零，保留或恢复上一个运行版本`, t => {
    const f = fixture(t);
    assert.equal(f.run('restart').status, 0);
    const active = fs.readlinkSync(f.state + '/active');
    fs.writeFileSync(f.destination, 'before-attempt');
    if (fail === 'readiness') fs.writeFileSync(f.directory + '/fail-ready', '1');
    // 回滚激活不能继续使用注入的新版本失败：在执行副本里仅使候选 activate 失败。
    if (fail === 'activate') {
        f.patch('service/service.sh', '[ "$FAIL_PHASE" != activate ]', '[ "$FAIL_PHASE" != activate ] || case "$3" in */active/config) exit 0 ;; *) exit 1 ;; esac');
    }
    const result = f.run('restart', fail);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(fs.readlinkSync(f.state + '/active'), active);
    const events = f.events(), status = JSON.parse(fs.readFileSync(f.state + '/status.json'));
    assert.equal(status.state, 'failed');
    if (fail === 'prepare') {
        assert.deepEqual(events, ['prepare']);
        assert.equal(fs.readFileSync(f.destination, 'utf8'), 'before-attempt');
    } else {
        assert.equal(fs.readFileSync(f.destination, 'utf8'), 'new');
        if (fail !== 'submit') assert.equal(status.rollback, 'restored');
        else assert.equal(status.rollback, 'failed');
        if (fail === 'readiness') {
            assert.equal(events.filter(event => event === 'activate').length, 1);
            assert.match(fs.readFileSync(f.directory + '/log/hijpass.log', 'utf8'), /Service readiness timed out/);
        }
    }
});

test('安装部分失败能恢复已覆盖文件并删除新建文件', t => {
    const f = fixture(t), work = f.directory + '/transaction', created = f.directory + '/created';
    fs.mkdirSync(work + '/files' + f.directory, { recursive: true });
    fs.writeFileSync(work + '/files' + f.destination, 'candidate');
    fs.writeFileSync(work + '/files' + created, 'candidate');
    fs.writeFileSync(work + '/manifest.json', JSON.stringify([{ path: f.destination, mode: 384 }, { path: created, mode: 384 }]));
    assert.equal(f.data('service/transactioncli.uc', ['backup', work]).status, 0);
    assert.equal(f.data('service/transactioncli.uc', ['install', work]).status, 0);
    assert.equal(f.data('service/transactioncli.uc', ['restore', work]).status, 0);
    assert.equal(fs.readFileSync(f.destination, 'utf8'), 'old');
    assert.equal(fs.existsSync(created), false);
});

test('就绪检查要求端口归属于目标 PID，不能被其他进程监听的同端口误导', async t => {
    const f = fixture(t), net = require('node:net');
    const server = net.createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    const port = server.address().port, idle = spawn('sleep', ['100']);
    t.after(() => idle.kill());
    fs.writeFileSync(f.runtime + '/ready-test.uc', `import { pending } from './service/readiness.uc';
print(pending({ instances: [{ id: 'node', name: 'test', ports: [${port}] }] },
{ instances: { 'node-test': { running: true, pid: +ARGV[0] } } }));`);
    assert.deepEqual(JSON.parse(f.data('ready-test.uc', [String(process.pid)]).stdout), []);
    assert.deepEqual(JSON.parse(f.data('ready-test.uc', [String(idle.pid)]).stdout), ['node-test']);
});

test('候选校验不会替换正式 JSON，失败文件安装返回非零', t => {
    const f = fixture(t), work = f.directory + '/staged', destination = f.directory + '/client';
    f.patch('ucode/hijpass/config/paths.uc', '/etc/hijpass/client', destination);
    f.patch('ucode/hijpass/config/paths.uc', '/etc/hijpass/shunt.json', f.directory + '/shunt.json');
    fs.writeFileSync(f.runtime + '/stage-test.uc', `import { generateAndWriteConfigs } from './service/prepare.uc';
import * as fs from 'fs';
generateAndWriteConfigs(json(fs.readfile(ARGV[0])), ARGV[1]);`);
    const configFixture = require('./testdata/compatibility.json').find(f => f.name === 'sing-box-chain');
    f.patch('service/prepare.uc', "import { resolve } from '../network/network.uc';", "function resolve() { return '192.0.2.1'; }");
    const input = f.directory + '/sections.json';
    fs.writeFileSync(input, JSON.stringify(configFixture.sections));
    const result = f.data('stage-test.uc', [input, work]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(destination), false);
    assert.ok(JSON.parse(fs.readFileSync(work + destination + '/downstream-downstream.json')).outbounds.length);
});

for (const failure of [false, true]) test(`原生核心检查${failure ? '失败阻止切换' : '执行后才切换'}，不会跳过 checks 数组`, t => {
    const f = fixture(t);
    f.patch('service/service.sh', "printf 'new'", "printf '{\"inbounds\":[{\"listen_port\":12345}]}'");
    f.patch('service/service.sh', '["sleep","100"]', `["sing-box","run","-c","${f.destination}"]`);
    fs.writeFileSync(f.directory + '/sing-box', `#!/bin/sh\necho check >>'${f.directory}/events'\nexit ${failure ? 1 : 0}\n`, { mode: 0o755 });
    const result = f.run('restart');
    assert.equal(result.status, failure ? 1 : 0, result.stderr);
    const events = f.events();
    assert.equal(events[0], 'prepare');
    assert.equal(events[1], 'check');
    if (failure) {
        assert.deepEqual(events, ['prepare', 'check', 'register']);
        assert.equal(fs.readFileSync(f.destination, 'utf8'), 'old');
    } else assert.ok(events.indexOf('check') < events.indexOf('deactivate'));
});

test('状态目录不能是其他路径的符号链接', t => {
    const f = fixture(t), elsewhere = f.directory + '/elsewhere';
    fs.mkdirSync(elsewhere);
    fs.symlinkSync(elsewhere, f.state);
    const result = f.run('restart');
    assert.notEqual(result.status, 0);
    assert.deepEqual(fs.readdirSync(elsewhere), []);
});

test('自定义 JSON 使用版本快照运行，安装和回滚均不覆盖用户编辑的源文件', t => {
    const f = fixture(t), work = f.directory + '/custom', source = f.directory + '/client/name-node.json';
    f.patch('ucode/hijpass/config/paths.uc', '/etc/hijpass/client', f.directory + '/client');
    fs.mkdirSync(path.dirname(source));
    fs.mkdirSync(work + '/config', { recursive: true });
    fs.mkdirSync(work + '/files');
    fs.writeFileSync(source, 'original custom content');
    fs.writeFileSync(work + '/config/hijpass', "config proxy_node 'node'\n option name 'name'\n option config_type 'custom'\n");
    fs.writeFileSync(work + '/plan.json', JSON.stringify({ instances: [{ id: 'node', name: 'name',
        command: ['/bin/sh', '-c', "program -c '" + source + "'"], env: [] }] }));
    const sealed = f.data('service/transactioncli.uc', ['seal', work, 'hijpass']);
    assert.equal(sealed.status, 0, sealed.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(work + '/manifest.json')), []);
    const plan = JSON.parse(fs.readFileSync(work + '/plan.json'));
    assert.ok(plan.instances[0].command[2].includes(work + '/files' + source));
    fs.writeFileSync(source, 'new user edit');
    assert.equal(f.data('service/transactioncli.uc', ['backup', work]).status, 0);
    assert.equal(f.data('service/transactioncli.uc', ['install', work]).status, 0);
    assert.equal(f.data('service/transactioncli.uc', ['restore', work]).status, 0);
    assert.equal(fs.readFileSync(source, 'utf8'), 'new user edit');
    assert.equal(fs.readFileSync(work + '/files' + source, 'utf8'), 'original custom content');
});
