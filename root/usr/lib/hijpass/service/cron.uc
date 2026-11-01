// init 提供任务内容；这里只过滤当前服务的旧任务，并可靠地替换 crontab。
import * as fs from 'fs';
import { atomic, text } from 'hijpass.common';
import { run } from 'hijpass.command.runtime';

run(ARGV, args => {
    let packageName = args[0], schedule = args[1], logs = args[2];
    if (length(args) != 3 || index(['hijpass', 'hijserver'], packageName) < 0 || index(['0', '1'], logs) < 0)
        die('invalid cron arguments');
    if (schedule && (!match(schedule, /^[A-Za-z0-9*\/,? -]+$/) || length(split(trim(schedule), /[ \t]+/)) != 5))
        die('invalid update schedule');

    let path = '/etc/crontabs/root';
    let entries = filter(split(fs.lstat(path) ? text(path) : '', '\n'), line => {
        if (!line) return false;
        let fields = split(trim(line) || '', /[ \t]+/);
        let position = substr(fields[0], 0, 1) == '@' ? 1 : 5;
        if (fields[position] == '/usr/lib/hijpass/maintenance/logs.sh' && fields[position + 1] == packageName)
            return false;
        return packageName != 'hijpass' || fields[position] != '/usr/lib/hijpass/rules/update.sh';
    });
    if (schedule) push(entries, `${schedule} /usr/lib/hijpass/rules/update.sh update --scheduled`);
    if (logs == '1') push(entries, `*/10 * * * * /usr/lib/hijpass/maintenance/logs.sh ${packageName}`);
    atomic(path, join('\n', entries) + '\n');
});
