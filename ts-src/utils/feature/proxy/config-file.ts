import { LuciFlied, PROXY_TYPE } from "../../../enum/hijpass";
import fs from "fs";
import uci from "uci";
import { FactoryType, LuciConverterFactory } from "../../../core/adapter";
import { JsonUtils } from "../../base/files/json";
import { FilePathUtils } from "../../base/files/paths";
import { ProxyUtils } from "./section";

async function writeGeneratedProxyConfigs() {
    const tasks: Promise<any>[] = [];

    uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, (section: any) => {
        const proxyConfig = ProxyUtils.createProxyConfigFromSection(section);
        if (!proxyConfig || proxyConfig.type === PROXY_TYPE.CUSTOM || proxyConfig.core === FactoryType.CUSTOM) {
            return;
        }

        const proxyConf = LuciConverterFactory.genProxyConf(proxyConfig.core, proxyConfig);

        const outData = typeof proxyConf === 'string'
            ? proxyConf
            : JSON.stringify(proxyConf, JsonUtils.omitEmptyReplacer, 2);
        tasks.push(fs.write(FilePathUtils.getProxyConfigFilePath(section), outData));
    });

    if (tasks.length === 0) {
        return;
    }

    const results = await Promise.allSettled(tasks);
    results.forEach(result => {
        if (result.status === 'rejected') {
            throw new Error(result.reason?.message || String(result.reason));
        }
    });
}

function generateProxyConfigFromSection(section: any) {
    const proxyConfig = ProxyUtils.createProxyConfigFromSection(section);
    if (!proxyConfig) {
        return;
    }

    return LuciConverterFactory.genProxyConf(proxyConfig.core, proxyConfig);
}

const ProxyConfigFileUtils = {
    writeGeneratedProxyConfigs,
    generateProxyConfigFromSection,
}

export { ProxyConfigFileUtils }
