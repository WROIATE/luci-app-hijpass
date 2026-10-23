import * as fs from 'fs';
import { defaultTemplate } from '../firewall/generate.uc';
import { editor, logs, log } from './files.uc';
import { render } from 'hijpass.coreconfig.render';
import { writeConfigs } from '../service/prepare.uc';

// RPC 参数是业务数据。没有文件路径或通用 command/argv 入口。
const methods = {
    firewall_template_default: {}, editor_read: { resource: '', section: '', name: '' },
    editor_write: { resource: '', section: '', name: '', content: '' },
    config_write: { sections: '' }, log_list: {}, log_read: { id: '', action: '', lines: '' },
    log_clear: { id: '' },
    defaults: {}, cleanup_node: { kind: '', section: '', name: '' },
    service_restart: {}, firewall_reset: {}, firewall_show: {},
    network_connect: { url: '', timeout: '' }, network_ping: { port: '' },
    rule_update: {}, rule_query: { keyword: '' }, rule_match: { keyword: '' },
    geo_lookup: { type: '', keyword: '', mode: '' }, geo_query: { keyword: '' },
    core_version: { core: '' }, core_latest: { core: '' }, core_update: { core: '' },
    job_status: { id: '' }, job_release: { id: '' },
    trace_start: { args: [] }, trace_status: { id: '' }, trace_release: { id: '' },
};

try {
    if (ARGV[0] == 'list') { printf('%J\n', methods); exit(0); }
    let method = ARGV[1], input = fs.stdin.read(4 * 1024 * 1024 + 1);
    if (type(input) != 'string' || length(input) > 4 * 1024 * 1024) die('invalid request size');
    if (type(method) != 'string') die('missing RPC method');
    let request = json(input);
    if (type(request) != 'object' || !exists(methods, method)) die('unknown RPC method');
    for (let key, fallback in methods[method]) {
        if (request[key] == null) request[key] = fallback;
        if (type(request[key]) != type(fallback)) die(`invalid RPC argument: ${key}`);
    }
    let result;
    if (method == 'firewall_template_default') result = { content: defaultTemplate() };
    else if (method == 'editor_read' || method == 'editor_write') result = editor(request, method == 'editor_write');
    else if (method == 'log_list') result = logs();
    else if (method == 'log_read') {
        if (index(['read', 'download'], request.action) < 0) die('invalid log read action');
        result = log(request);
    }
    else if (method == 'log_clear') result = log({ id: request.id, action: 'clear' });
    else if (method == 'defaults') result = { command: '/usr/bin/xray -c {conf_path}' };
    else if (method == 'config_write') {
        let sections = json(request.sections);
        let generated = render(sections);
        for (let section in sections) if (!match(section['.name'], /^[A-Za-z0-9_-]+$/)) die('invalid section ID');
        // 快照只提供表单值；文件位置由后端常量决定。
        // 复用服务启动时的生成、上游解析和原子替换，前端不再写生成文件。
        writeConfigs(sections, generated);
        result = generated.shunt ? { shunt: sprintf('%.2J', generated.shunt) } : {};
    }
    else die('unknown data method');
    printf('%J\n', result);
}
catch (e) { printf('%J\n', { error: e.message }); }
