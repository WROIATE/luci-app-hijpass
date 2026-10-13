const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const root = path.resolve(__dirname, '../..');
const interpreter = process.env.UCODE || 'ucode';
let shellDirectory;

function shellRuntime() {
    if (shellDirectory) return shellDirectory;
    shellDirectory = fs.mkdtempSync('/tmp/hijpass-shell-runtime-');
    fs.cpSync(path.join(root, 'root/usr/lib/hijpass'), shellDirectory, { recursive: true });
    for (const folder of fs.readdirSync(shellDirectory, { withFileTypes: true })) {
        const files = folder.isDirectory() ? fs.readdirSync(path.join(shellDirectory, folder.name)).map(name => path.join(shellDirectory, folder.name, name)) : [path.join(shellDirectory, folder.name)];
        // 在测试安装副本中映射固定路径，生产脚本无需支持可变安装目录。
        for (const file of files) if (file.endsWith('.sh'))
            fs.writeFileSync(file, fs.readFileSync(file, 'utf8')
                .replace('#!/bin/sh', '#!/usr/bin/busybox ash')
                .replaceAll('/usr/lib/hijpass', shellDirectory));
    }
    const common = path.join(shellDirectory, 'common.sh');
    fs.writeFileSync(common, fs.readFileSync(common, 'utf8').replace('/usr/share/libubox/jshn.sh',
        process.env.JSHN_SH || '/usr/share/libubox/jshn.sh'));
    const bin = path.join(shellDirectory, 'testbin');
    fs.mkdirSync(bin);
    const quote = text => "'" + text.replaceAll("'", "'\\''") + "'";
    fs.writeFileSync(path.join(bin, 'ucode'), '#!/bin/sh\nexec ' + quote(interpreter) +
        ' -L ' + quote(path.join(root, 'root/usr/share/ucode')) + ' "$@"\n', { mode: 0o755 });
    process.on('exit', () => fs.rmSync(shellDirectory, { recursive: true, force: true }));
    return shellDirectory;
}

function runShell(script, args = [], extra = {}) {
    const directory = shellRuntime();
    const env = { ...process.env, ...(extra.env || {}) };
    env.PATH = path.join(directory, 'testbin') + ':' + env.PATH;
    const target = path.join(directory, script.replace('root/usr/lib/hijpass/', ''));
    // OpenWrt 的 /bin/sh 是 BusyBox ash；jshn 使用 ash 的 export -n。
    return spawnSync('/usr/bin/busybox', ['ash', target, ...args], { encoding: 'utf8', ...extra, env });
}

// 将快照写成真实 UCI 文件，系统操作测试通过公开 Shell 入口读取它。
function withConfig(sections, callback) {
    const directory = fs.mkdtempSync('/tmp/hijpass-test-config-');
    const quote = text => "'" + String(text).replaceAll("'", "'\\''") + "'";
    let source = '';
    for (const section of sections) {
        source += 'config ' + section['.type'] + (section['.name'] ? ' ' + quote(section['.name']) : '') + '\n';
        for (const [key, value] of Object.entries(section)) {
            if (key.startsWith('.')) continue;
            if (Array.isArray(value)) for (const item of value) source += ` list ${key} ${quote(item)}\n`;
            else source += ` option ${key} ${quote(value)}\n`;
        }
    }
    fs.writeFileSync(path.join(directory, 'hijpass'), source);
    try { return callback(directory); }
    finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

function run(script, args = [], input, extra = {}) {
    if (script.endsWith('.sh')) return runShell(script, args, extra);
    // Older ucode builds use getopt(), which can consume script flags such as --stdin on glibc hosts.
    return spawnSync(interpreter, ['-S', '-L', path.join(root, 'root/usr/share/ucode'), '--', path.join(root, script), ...args], {
        encoding: 'utf8', input: input === undefined ? undefined : JSON.stringify(input), ...extra,
    });
}
function config(args, input, extra) {
    return run('root/usr/bin/hijpass-config', args, input, extra);
}
module.exports = { root, interpreter, run, config, runShell, shellRuntime, withConfig };
