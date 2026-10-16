import rpc from 'rpc';

export type EditorResource = 'ip_direct' | 'ip_proxy' | 'domain_direct' | 'domain_proxy'
    | 'nft_hook' | 'dns_hook' | 'shunt_conf' | 'firewall_template' | 'proxy_config' | 'server_config';
export type Editor = { resource: EditorResource; section?: string; name?: string };
export type Log = { id: string; kind: 'main' | 'shunt' | 'proxy' | 'server'; name: string };

// 页面只使用业务方法。文件布局、命令位置以及参数组装由后端负责。
function method(name: string, params: string[] = []) {
    const call = rpc.declare({ object: 'hijpass', method: name, params, reject: true,
        expect: { '': { error: 'Invalid backend response' } } });
    return async (...args: any[]) => {
        const result = await call(...args);
        if (result.error) throw new Error(result.error);
        return result;
    };
}

const editorRead = method('editor_read', ['resource', 'section', 'name']);
const editorWrite = method('editor_write', ['resource', 'section', 'name', 'content']);
const logRead = method('log_read', ['id', 'action', 'lines']);
const firewallShow = method('firewall_show');
const firewallDefault = method('firewall_template_default');
const logs = method('log_list');
const jobStatus = method('job_status', ['id']);
const jobRelease = method('job_release', ['id']);

// 每次轮询都是短 RPC；页面等待不会占住一次持续下载的 RPC 请求。
async function runJob(start: (...args: any[]) => Promise<any>, jsonOutput: boolean, ...args: any[]) {
    const { id } = await start(...args);
    if (typeof id !== 'string' || !/^[A-Za-z0-9]{8}$/.test(id)) throw new Error('Invalid job ID');
    let finished = false;
    try {
        const deadline = Date.now() + 30 * 60 * 1000;
        while (Date.now() < deadline) {
            const status = await jobStatus(id);
            if (!status.running) {
                finished = true;
                const result = jsonOutput ? JSON.parse(status.stdout || '{}') : status;
                if (result.error) throw new Error(result.error);
                if (status.code !== 0) throw new Error(status.stderr || 'Backend job failed');
                return result;
            }
            await new Promise(resolve => window.setTimeout(resolve, 1000));
        }
        throw new Error('Timed out waiting for backend job');
    } finally { if (finished) await jobRelease(id).catch(console.error); }
}

const coreCalls = {
    version: method('core_version', ['core']),
    latest: method('core_latest', ['core']),
    update: (core: string) => runJob(method('core_update', ['core']), true, core),
};

export const Backend = {
    defaultFirewallTemplate: async (): Promise<string> => (await firewallDefault()).content,
    readEditor: async (editor: Editor): Promise<string> =>
        (await editorRead(editor.resource, editor.section || '', editor.name || '')).content,
    writeEditor: (editor: Editor, content: string) =>
        editorWrite(editor.resource, editor.section || '', editor.name || '', content),
    writeConfigs: method('config_write', ['sections']),
    logList: async (): Promise<Log[]> => (await logs()).logs,
    readLog: async (id: string, lines: string = '200'): Promise<string> => (await logRead(id, 'read', lines)).content,
    downloadLog: (id: string) => logRead(id, 'download', ''),
    clearLog: method('log_clear', ['id']),
    logSettings: method('log_settings', ['package', 'section', 'name']),
    defaults: method('defaults'),
    cleanupNode: method('cleanup_node', ['kind', 'section', 'name']),
    restartService: () => runJob(method('service_restart'), false),
    resetFirewall: method('firewall_reset'),
    showFirewall: async (): Promise<string> => {
        const result = await firewallShow();
        if (result.code !== 0) throw new Error(result.stderr || 'Cannot read firewall rules');
        return result.stdout;
    },
    connect: method('network_connect', ['url', 'timeout']),
    ping: method('network_ping', ['port']),
    updateRules: () => runJob(method('rule_update'), true),
    queryRules: method('rule_query', ['keyword']),
    matchRule: method('rule_match', ['keyword']),
    lookupGeo: method('geo_lookup', ['type', 'keyword', 'mode']),
    queryGeo: method('geo_query', ['keyword']),
    coreAction: (action: 'version' | 'latest' | 'update', core: string) => coreCalls[action](core),
    startTrace: method('trace_start', ['args']),
    traceStatus: method('trace_status', ['id']),
    releaseTrace: method('trace_release', ['id']),
};
