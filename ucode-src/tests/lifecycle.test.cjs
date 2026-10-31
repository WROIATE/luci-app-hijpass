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
    const script = (file, text) => fs.writeFileSync(file, '#!/usr/bin/busybox ash\n' + text, { mode: 0o755 });
    for (const [file, name] of [['service.sh', 'hijpass'], ['server.sh', 'hijserver']]) {
        script(runtime + '/service/' + file, `
echo '${name}:'"$1" >>"$EVENTS"
[ "$FAIL_PHASE" != "$1" ] || exit 1
case "$1" in
prepare) if [ "$DISABLED" = 1 ]; then echo '{"instances":[]}'; else cat "$PLAN"; fi ;;
esac
`);
    }
    const plan = { instances: [{ id: 'node', name: 'test space', command: ['sing-box', 'run', '-c', directory + '/config space.json'],
        env: ['TEST_CORE_ENV=value with spaces'], user: 'root', log: null, shunt: false }] };
    const planPath = directory + '/plan.json';
    fs.writeFileSync(planPath, JSON.stringify(plan));
    fs.mkdirSync(directory + '/lib/functions', { recursive: true });
    fs.mkdirSync(directory + '/bin');
    script(directory + '/bin/sleep', ':\n');
    for (const core of ['sing-box', 'xray']) script(directory + '/bin/' + core, `
echo "check:${core}:$TEST_CORE_ENV:$*" >>"$EVENTS"
[ "$FAIL_PHASE" != check ]
`);
    fs.writeFileSync(directory + '/lib/functions.sh', `list_contains() { return 0; }\nsleep() { :; }\n`);
    fs.writeFileSync(directory + '/lib/functions/service.sh', `
procd_running() {
    echo "$1:running:$2" >>"$EVENTS"
    json_init
    json_add_string name "$1"
    json_cleanup
    return 1
}
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
    test(`${service}: 提交前撤流，提交后直接设置辅助配置，不查询进程状态`, t => {
        const f = fixture(t, service), result = f.run('start');
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(f.events(), [service + ':prepare', `check:sing-box:value with spaces:check -c ${f.directory}/config space.json`,
            service + ':clear_aux', service + ':submit', service + ':setup_aux']);
        assert.equal(f.run('start').status, 0);
        assert.ok(!f.events().some(event => /:kill$|:running:/.test(event)), 'start must not kill the service or poll processes');
        assert.ok(f.events().indexOf(service + ':clear_aux') < f.events().indexOf(service + ':submit'));
    });
    for (const failure of ['prepare', 'check', 'setup_aux', 'clear_aux']) {
        test(`${service}: ${failure} 失败返回错误并阻止后续不安全步骤`, t => {
            const f = fixture(t, service), result = f.run(failure === 'clear_aux' ? 'stop' : 'start', failure);
            assert.notEqual(result.status, 0, result.stderr);
            const events = f.events();
            if (failure === 'prepare' || failure === 'check') {
                assert.ok(!events.includes(service + ':submit'));
                assert.ok(!events.includes(service + ':setup_aux'));
            } else if (failure === 'clear_aux') {
                assert.deepEqual(events, [service + ':clear_aux']);
            } else {
                if (failure !== 'setup_aux') assert.ok(!events.includes(service + ':setup_aux'));
                assert.deepEqual(events.slice(-2), [service + ':clear_aux', service + ':kill']);
            }
        });
    }
    test(`${service}: stop 先撤流再停实例；reload 沿用原项目 restart 语义`, t => {
        const f = fixture(t, service);
        assert.equal(f.run('stop').status, 0);
        assert.deepEqual(f.events(), [service + ':clear_aux', service + ':kill']);
        assert.equal(f.run('reload').status, 0);
        assert.deepEqual(f.events().slice(0, 3), [service + ':clear_aux', service + ':kill', service + ':prepare']);
        assert.equal(f.events().at(-1), service + ':setup_aux');
    });
    for (const action of ['start', 'restart']) test(`${service}: ${action} 撤流失败不提交实例、不停核心`, t => {
        const f = fixture(t, service), result = f.run(action, 'clear_aux');
        assert.notEqual(result.status, 0);
        assert.ok(!f.events().some(event => /:(kill|submit|setup_aux)$/.test(event)));
    });
    for (const plan of ['', '{', '{}', '{"instances":{}}', '{"instances":null}', '{"instances":[null]}', '{"instances":[{"command":[]}]}']) {
        test(`${service}: 拒绝无效计划 ${plan || '(empty)'}，不当作禁用服务`, t => {
            const f = fixture(t, service);
            fs.writeFileSync(f.planPath, plan);
            const result = f.run('start');
            assert.notEqual(result.status, 0);
            assert.ok(!f.events().some(event => /:(clear_aux|kill|submit|setup_aux)$/.test(event)));
        });
    }
    test(`${service}: 禁用时撤流后提交空实例，不重新激活网络`, t => {
        const f = fixture(t, service), result = f.run('start', '', { DISABLED: '1' });
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(f.events(), [service + ':prepare', service + ':clear_aux', service + ':submit']);
        assert.deepEqual(JSON.parse(fs.readFileSync(f.directory + '/submitted.json')).instances, {});
    });
}

test('自定义命令配置路径保持原样，不替换成运行快照，也不作为标准核心命令执行检查', t => {
    const f = fixture(t);
    f.plan.instances[0].command = ['/bin/sh', '-c', "program -c '/etc/hijpass/client/custom.json'"];
    fs.writeFileSync(f.planPath, JSON.stringify(f.plan));
    const result = f.run('start');
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!f.events().some(event => event.startsWith('check:')));
    assert.deepEqual(JSON.parse(fs.readFileSync(f.directory + '/submitted.json')).instances['node-test space'].command,
        [f.runtime + '/service/process.sh', '', ...f.plan.instances[0].command]);
    assert.equal(fs.existsSync(f.directory + '/runtime/service/transaction.uc'), false);
});

test('多个实例全部声明后直接应用辅助配置', t => {
    const f = fixture(t);
    f.plan.instances.push({ ...f.plan.instances[0], id: 'second', name: 'node' });
    fs.writeFileSync(f.planPath, JSON.stringify(f.plan));
    assert.equal(f.run('start').status, 0);
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(f.directory + '/submitted.json')).instances),
        ['node-test space', 'second-node']);
    assert.ok(!f.events().some(event => event.includes(':running:')));
    assert.equal(f.events().at(-1), 'hijpass:setup_aux');
});
