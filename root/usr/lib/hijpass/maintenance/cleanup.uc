import { CLIENT_DIR, SERVER_DIR, nodeFilename } from 'hijpass.config.paths';
import { run } from 'hijpass.common';

// 清理计划只包含固定目录和当前需保留的文件；实际删除由相邻 Shell 完成。
run(() => {
    let kind = ARGV[0], id = ARGV[1], name = ARGV[2];
    if (kind != 'proxy' && kind != 'server') {
        die('unknown node kind');
    }
    let file = nodeFilename({ '.name': id }, name);
    let directory = kind == 'proxy' ? CLIENT_DIR : SERVER_DIR;
    return { directory, keep: name ? `${directory}/${file}.json` : '' };
});
