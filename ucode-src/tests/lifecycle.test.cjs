const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root, shellRuntime } = require('./helpers.cjs');

// testdata/rc.common 来自 OpenWrt base-files；执行原生 start/stop/restart 包装。
// https://github.com/openwrt/openwrt/blob/master/package/base-files/files/etc/rc.common
function fixture(t, service = 'hijpass') {
    const directory = fs.mkdtempSync('/tmp/hijpass-init-test-');
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const runtime = directory + '/runtime', original = shellRuntime(), events = directory + '/events';
    fs.cpSync(original, runtime, { recursive: true });
    for (const name of fs.readdirSync(runtime, { recursive: true })) {
        if (!/\.(uc|sh)$/.test(name) && name !== 'testbin/ucode') continue;
        const file = runtime + '/' + name;
        fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replaceAll(original, runtime));
    }
    const patch = (file, before, after) => fs.writeFileSync(runtime + '/' + file,
        fs.readFileSync(runtime + '/' + file, 'utf8').replaceAll(before, after));
    patch('ucode/hijpass/config/paths.uc', '/tmp/hijpass/log', directory + '/log');
    patch('firewall/firewall.sh', '/etc/hijpass/fw4-rules.nft', directory + '/rules.nft');
    const script = (file, text) => fs.writeFileSync(file, '#!/usr/bin/busybox ash\n' + text, { mode: 0o755 });
    script(runtime + '/service/prepare.sh', `
service=hijpass
[ "$1" != server ] || { service=hijserver; shift; }
case "$1" in cron|delay|server-files) exec '${directory}/data-mock' "$@" ;; esac
echo "$service:prepare" >>"$EVENTS"
[ "$FAIL_PHASE" != prepare ] || exit 1
if [ "$DISABLED" = 1 ]; then echo '{"instances":[]}'; else cat "$PLAN"; fi
`);
    const plan = { instances: [{ id: 'node', name: 'test space', command: ['sing-box', 'run', '-c', directory + '/config space.json'],
        env: ['TEST_CORE_ENV=value with spaces'], user: 'root', log: null, shunt: false }] };
    const planPath = directory + '/plan.json';
    fs.writeFileSync(planPath, JSON.stringify(plan));
    fs.mkdirSync(directory + '/lib/functions', { recursive: true });
    fs.mkdirSync(directory + '/bin');
    fs.writeFileSync(directory + '/lib/functions.sh', `list_contains() { return 0; }\n`);
    fs.writeFileSync(directory + '/lib/functions/service.sh', `
procd_running() { echo unexpected-poll >>"$EVENTS"; return 1; }
`);
    for (const [file, stage] of [['firewall/route.sh', 'route']])
        script(runtime + '/' + file, `echo "${stage}:$1" >>"$EVENTS"\n[ "$FAIL_PHASE" != "${stage}:$1" ]`);
    script(directory + '/dns-hook', 'echo "hook:$1" >>"$EVENTS"\n[ "$FAIL_PHASE" != "hook:$1" ]');
    script(directory + '/bin/fw4', 'echo "fw4:$1" >>"$EVENTS"\n[ "$FAIL_PHASE" != fw4 ]');
    script(directory + '/cron-init', 'echo "cron:$1" >>"$EVENTS"\n[ "$FAIL_PHASE" != "cron:$1" ]');
    script(directory + '/data-mock', `
[ "$1" != server ] || shift
echo "data:$*" >>"$EVENTS"
[ "$FAIL_PHASE" != "data:$*" ] || exit 1
[ "$1" != delay ] || echo 0
`);
    // 只替换 procd/ubus 边界；JSON namespace 与原生 procd API 保持一致。
    fs.writeFileSync(directory + '/lib/functions/procd.sh', `
_procd_call() {
    local old_cb
    json_set_namespace procd old_cb
    "$@"
    json_set_namespace "$old_cb"
}
procd_open_service() { _procd_call open_service "$@"; }
open_service() { json_init; json_add_string name "$1"; json_add_object instances; }
procd_open_instance() { _procd_call json_add_object "$1"; }
procd_close_instance() { _procd_call json_close_object; }
procd_set_param() { _procd_call set_param "$@"; }
set_param() {
    local key="$1" value
    shift
    case "$key" in command|env)
        json_add_array "$key"
        for value in "$@"; do json_add_string '' "$value"; done
        json_close_array ;;
    esac
}
procd_close_service() { _procd_call close_service; }
close_service() {
    json_close_object
    json_get_var service name
    echo "$service:submit" >>"$EVENTS"
    json_dump >"$IPKG_INSTROOT/submitted.json"
    touch "$IPKG_INSTROOT/registered-$service"
    json_cleanup
}
procd_lock() { :; }
procd_kill() { echo "$1:kill" >>"$EVENTS"; rm -f "$IPKG_INSTROOT/registered-$1"; }
`);
    const init = directory + '/' + service;
    let source = fs.readFileSync(root + '/root/etc/init.d/' + service, 'utf8').replaceAll('/usr/lib/hijpass', runtime);
    // reload_service 的自调用也经过同一份原生 rc.common。
    source = source.replace('/etc/init.d/' + service + ' restart',
        `/usr/bin/busybox ash '${root}/ucode-src/tests/testdata/rc.common' '${init}' restart`);
    source = source.replace('/etc/hijpass/hook/dns-hook.sh', directory + '/dns-hook')
        .replace('/etc/init.d/cron', directory + '/cron-init')
        .replace('/usr/share/nftables.d/table-post/hijserver.nft', directory + '/server.nft')
        .replace('/usr/share/nftables.d/chain-pre/input_wan/hijserver.nft', directory + '/chain.nft');
    fs.writeFileSync(runtime + '/firewall/generatecli.uc', `import * as fs from 'fs';
let file = fs.open(getenv('EVENTS'), 'a'); file.write('firewall:generate\\n'); file.close();
exit(getenv('FAIL_PHASE') == 'firewall:generate' ? 1 : 0);
`);
    fs.writeFileSync(init, source);
    function run(action, fail = '', extra = {}) {
        fs.writeFileSync(events, '');
        return spawnSync('/usr/bin/busybox', ['ash', root + '/ucode-src/tests/testdata/rc.common', init, action], {
            encoding: 'utf8', timeout: 10000, env: { ...process.env, IPKG_INSTROOT: directory, EVENTS: events, PLAN: planPath,
                FAIL_PHASE: fail, ...extra, PATH: directory + '/bin:' + runtime + '/testbin:' + process.env.PATH },
        });
    }
    return { directory, runtime, plan, planPath, patch, script, run,
        events: () => fs.readFileSync(events, 'utf8').trim().split('\n') };
}

for (const service of ['hijpass', 'hijserver']) {
    const setup = service === 'hijpass'
        ? ['route:reset', 'firewall:generate', 'fw4:reload', 'hook:start', 'data:cron enable', 'cron:restart']
        : ['data:server-files', 'fw4:reload', 'data:cron enable', 'cron:restart'];
    const cleanup = service === 'hijpass'
        ? ['hook:stop', 'fw4:reload', 'route:remove', 'data:cron disable', 'cron:restart']
        : ['fw4:reload', 'data:cron disable', 'cron:restart'];

    test(`${service}: init.d 在提交后直接按顺序设置辅助功能，不查询进程、不重复清理`, t => {
        const f = fixture(t, service);
        assert.equal(f.run('start').status, 0);
        assert.deepEqual(f.events(), [service + ':prepare', service + ':submit', ...setup]);
        assert.equal(f.run('start').status, 0);
        assert.deepEqual(f.events(), [service + ':prepare', service + ':submit', ...setup]);
    });
    test(`${service}: 准备失败不提交实例、不设置网络`, t => {
        const f = fixture(t, service);
        assert.notEqual(f.run('start', 'prepare').status, 0);
        assert.deepEqual(f.events(), [service + ':prepare']);
    });
    for (const failure of setup.filter(event => event !== 'fw4:reload')) {
        test(`${service}: ${failure} 失败先清理再停止本服务`, t => {
            const f = fixture(t, service);
            assert.notEqual(f.run('start', failure).status, 0);
            assert.deepEqual(f.events(), [service + ':prepare', service + ':submit',
                ...setup.slice(0, setup.indexOf(failure) + 1), ...cleanup, service + ':kill']);
        });
    }
    test(`${service}: stop 先撤流再停实例，reload 只清理一次后重新启动`, t => {
        const f = fixture(t, service);
        assert.equal(f.run('stop').status, 0);
        assert.deepEqual(f.events(), [...cleanup, service + ':kill']);
        assert.equal(f.run('reload').status, 0);
        assert.deepEqual(f.events(), [...cleanup, service + ':kill', service + ':prepare', service + ':submit', ...setup]);
    });
    for (const action of ['stop', 'restart']) test(`${service}: ${action} 撤流失败不继续停核心或启动`, t => {
        const f = fixture(t, service);
        const failure = 'fw4';
        assert.notEqual(f.run(action, failure).status, 0);
        assert.ok(!f.events().some(event => /:(kill|submit|prepare)$/.test(event)));
    });
    for (const plan of ['', '{', '{}', '{"instances":{}}', '{"instances":null}']) {
        test(`${service}: 拒绝无效计划 ${plan || '(empty)'}，不当作禁用服务`, t => {
            const f = fixture(t, service);
            fs.writeFileSync(f.planPath, plan);
            assert.notEqual(f.run('start').status, 0);
            assert.deepEqual(f.events(), [service + ':prepare']);
        });
    }
    test(`${service}: 空实例清理旧资源后提交，不重新设置网络`, t => {
        const f = fixture(t, service);
        assert.equal(f.run('start', '', { DISABLED: '1' }).status, 0);
        assert.deepEqual(f.events(), [service + ':prepare', ...cleanup, service + ':submit']);
        assert.deepEqual(JSON.parse(fs.readFileSync(f.directory + '/submitted.json')).instances, {});
    });
}

test('自定义命令和带空格参数按原值交给 procd，不重拼 Shell 字符串', t => {
    const f = fixture(t);
    f.plan.instances[0].command = ['/bin/sh', '-c', "program -c '/etc/hijpass/client/custom.json'"];
    fs.writeFileSync(f.planPath, JSON.stringify(f.plan));
    const result = f.run('start');
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.directory + '/submitted.json')).instances['node-test space'].command,
        [f.runtime + '/service/process.sh', '', ...f.plan.instances[0].command]);
});

test('多个实例全部声明后直接应用辅助配置', t => {
    const f = fixture(t);
    f.plan.instances.push({ ...f.plan.instances[0], id: 'second', name: 'node' });
    fs.writeFileSync(f.planPath, JSON.stringify(f.plan));
    assert.equal(f.run('start').status, 0);
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(f.directory + '/submitted.json')).instances),
        ['node-test space', 'second-node']);
    assert.ok(!f.events().includes('unexpected-poll'));
});

for (const service of ['hijpass', 'hijserver']) {
    test(`${service}: 单个实例无效时记录原因，继续提交前后有效实例`, t => {
        const f = fixture(t, service);
        f.plan.instances.push(null, { id: 'broken', name: 'broken', command: [] }, { ...f.plan.instances[0], id: 'last' });
        fs.writeFileSync(f.planPath, JSON.stringify(f.plan));
        assert.equal(f.run('start').status, 0);
        const instances = JSON.parse(fs.readFileSync(f.directory + '/submitted.json')).instances;
        assert.deepEqual(Object.keys(instances), ['node-test space', 'last-test space']);
        const log = fs.readFileSync(f.directory + '/log/hijpass.log', 'utf8');
        assert.match(log, /Invalid instance entry: index=2/);
        assert.match(log, /Prepare instance broken \(broken\): Invalid service instance: empty command/);
        assert.match(log, /Prepare instance broken \(broken\) failed: exit=1/);
        assert.ok(!f.events().some(event => /:kill$/.test(event)));
    });
    test(`${service}: 全部实例无效仍提交空列表，清理辅助功能且不重新激活`, t => {
        const f = fixture(t, service);
        f.plan.instances = [null, { id: 'broken', name: 'broken', command: [] }];
        fs.writeFileSync(f.planPath, JSON.stringify(f.plan));
        assert.equal(f.run('start').status, 0);
        assert.deepEqual(JSON.parse(fs.readFileSync(f.directory + '/submitted.json')).instances, {});
        const events = f.events();
        assert.ok(events.includes(service + ':submit'));
        assert.ok(events.includes('data:cron disable'));
        assert.ok(!events.includes('data:cron enable'));
    });
    for (const core of ['xray', 'sing-box']) test(`${service}: ${core} 检查失败只跳过当前实例，记录详情并保留 argv 和环境变量`, t => {
        const f = fixture(t, service), check = f.directory + '/bin/' + core, args = f.directory + '/check-args';
        f.script(check, `printf '%s\\n' "$CHECK_ENV" "$@" >>'${args}'
if [ "$CHECK_FAIL" = 1 ]; then echo 'invalid core configuration' >&2; exit 7; fi`);
        const options = core === 'xray' ? ['run', '-test', '-c'] : ['check', '-c'];
        const valid = { ...f.plan.instances[0], check: [check, ...options, 'config with spaces.json'], env: ['CHECK_ENV=value with spaces'] };
        f.plan.instances = [{ ...valid, id: 'broken', env: [...valid.env, 'CHECK_FAIL=1'] }, valid];
        fs.writeFileSync(f.planPath, JSON.stringify(f.plan));
        assert.equal(f.run('start').status, 0);
        assert.deepEqual(fs.readFileSync(args, 'utf8').trim().split('\n'),
            Array(2).fill(['value with spaces', ...options, 'config with spaces.json']).flat());
        const instances = JSON.parse(fs.readFileSync(f.directory + '/submitted.json')).instances;
        assert.deepEqual(Object.keys(instances), ['node-test space']);
        assert.deepEqual(instances['node-test space'].command, [f.runtime + '/service/process.sh', '', ...valid.command]);
        assert.deepEqual(instances['node-test space'].env, valid.env);
        const log = fs.readFileSync(f.directory + '/log/hijpass.log', 'utf8');
        assert.match(log, /Prepare instance broken \(test space\): invalid core configuration/);
        assert.match(log, /Prepare instance broken \(test space\) failed: exit=7/);
    });
}
