const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const interpreter = process.env.UCODE || 'ucode';

function run(script, args = [], input, extra = {}) {
    // Older ucode builds use getopt(), which can consume script flags such as --stdin on glibc hosts.
    return spawnSync(interpreter, ['-S', '-L', path.join(root, 'root/usr/share/ucode'), '--', path.join(root, script), ...args], {
        encoding: 'utf8', input: input === undefined ? undefined : JSON.stringify(input), ...extra,
    });
}
function config(args, input, extra) {
    return run('root/usr/bin/hijpass-config', args, input, extra);
}
module.exports = { root, interpreter, run, config };
