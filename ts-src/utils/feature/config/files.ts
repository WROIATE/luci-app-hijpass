import fs from 'fs';
import uci from 'uci';
import { LuciFlied } from '../../../enum/hijpass';
import { FilePathUtils } from '../../base/files/paths';
import { FormUtils } from '../../base/luci/form';

// JSON construction belongs to the ucode backend. This retains the existing LuCI file and
// network operations used by Save & Apply.
async function prepareProxy(section: any, config: any) {
    const host = section.server;
    if (section.upstream_proxy_node && host
        && !/^(\d{1,3}\.){3}\d{1,3}$/.test(host) && !/^[0-9a-fA-F:]+$/.test(host)) {
        const result = await fs.exec_direct('/usr/lib/hijpass/net.uc', ['resolve', host], 'json');
        if (!result?.address) throw new Error(_('Resolve proxy server failed: %s').format(host));
        const outbound = config.outbounds?.[0];
        if (outbound?.server) outbound.server = result.address;
        else if (outbound?.settings?.address) outbound.settings.address = result.address;
        else throw new Error(_('Unsupported proxy config server field: %s').format(section.name || host));
    }
    return { path: FilePathUtils.getProxyConfigFilePath(section), data: JSON.stringify(config, null, 2) };
}

async function writeGeneratedConfigs(generated: { nodes: Record<string, any>; shunt?: any }) {
    const files: { path: string; data: string }[] = [];
    const sections = uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE);
    for (const section of sections) {
        if (!Object.prototype.hasOwnProperty.call(generated.nodes, section['.name'])) continue;
        const config = generated.nodes[section['.name']];
        if (config) files.push(await prepareProxy(section, config));
    }
    let shuntData: string | undefined;
    if (generated.shunt) {
        shuntData = JSON.stringify(generated.shunt, null, 2);
        files.push({ path: FilePathUtils.getFilePath('shunt_conf'), data: shuntData });
    }
    // Resolve all chained addresses before writing any configuration or applying UCI.
    for (const file of files) await fs.write(file.path, file.data);
    if (shuntData !== undefined) {
        uci.set_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE,
            'shunt_hash', String(FormUtils.simpleHash(shuntData)));
    }
}

const ConfigFileUtils = { writeGeneratedConfigs };
export { ConfigFileUtils };
