/** @typedef {import('../../../share/ucode/hijpass/types/service.uc').ServicePlan} ServicePlan */
/** @typedef {import('../../../share/ucode/hijpass/types/service.uc').ProcdServiceStatus} ProcdServiceStatus */
import * as fs from 'fs';
import { text } from 'hijpass.common';
import { run } from 'hijpass.command.runtime';

// 将监听 socket 归属到实例进程，避免同端口被其他程序占用时误判启动成功。
function sockets(pid, visited) {
    if (!pid || visited[pid]) return {};
    visited[pid] = true;
    let result = {};
    for (let name in fs.lsdir(`/proc/${pid}/fd`) || []) {
        let link = fs.readlink(`/proc/${pid}/fd/${name}`), found = match(link || '', /^socket:\[([0-9]+)\]$/);
        if (found) result[found[1]] = true;
    }
    for (let child in split(trim(fs.readfile(`/proc/${pid}/task/${pid}/children`) || ''), /\s+/))
        for (let inode in sockets(int(child), visited)) result[inode] = true;
    return result;
}

/** @param {ServicePlan} plan @param {ProcdServiceStatus} service procd service.list 返回的实例字典。 */
export function pending(plan, service) {
    let waiting = [];
    for (let instance in plan.instances) {
        let name = instance.id + '-' + instance.name, state = service.instances?.[name];
        if (!state?.running || !state.pid || !fs.stat(`/proc/${state.pid}`)) { push(waiting, name); continue; }
        let owned = sockets(state.pid, {}), listening = {};
        for (let protocol in ['tcp', 'tcp6', 'udp', 'udp6']) {
            for (let line in split(fs.readfile(`/proc/${state.pid}/net/${protocol}`) || '', '\n')) {
                let fields = split(trim(line), /\s+/);
                if (length(fields) < 10 || !owned[fields[9]]) continue;
                if (fields[3] != (substr(protocol, 0, 3) == 'tcp' ? '0A' : '07')) continue;
                let address = split(fields[1], ':');
                listening[int(address[1], 16)] = true;
            }
        }
        if (length(filter(instance.ports || [], port => !listening[port]))) push(waiting, name);
    }
    return waiting;
};

export function main() { run(ARGV, function(args) {
    let plan = json(text(args[0])), services = json(text(args[1]));
    let waiting = pending(plan, services[args[2]] || {});
    if (length(waiting)) { warn('Waiting for instances: ' + join(', ', waiting) + '\n'); exit(1); }
}); };
