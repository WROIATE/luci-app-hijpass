import uci from "uci";
import { CORE_TYPE, LuciFlied, normalizeCoreType } from "../../../enum/hijpass";
import type { ProxyNode } from "../../../module/luci";

export const MAX_PROXY_CHAIN_NODES = 3;

export interface ResolvedUpstreamProxy {
    name: string;
    socksPort: number;
    tag: string;
    core: string;
    section: any;
}

function getProxyName(section: any): string {
    return section?.name || section?.['.name'] || '';
}

function getProxyCore(section: any): string {
    return normalizeCoreType(section?.core || CORE_TYPE.SING_BOX);
}

function isPort(value: any): boolean {
    if (!value) return false;
    const port = Number(value);
    return Number.isInteger(port) && port > 0 && port <= 65535;
}

function getProxySections(): any[] {
    const sections: any[] = [];
    uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, function (section: any) {
        sections.push(section);
    });
    return sections;
}

function getProxySectionMap(): Map<string, any> {
    const sections = new Map<string, any>();
    getProxySections().forEach((section) => {
        const name = getProxyName(section);
        if (name) sections.set(name, section);
    });
    return sections;
}

function getUpstreamProxyOutboundTag(name: string): string {
    return 'upstream-' + name;
}

function resolveUpstreamProxy(
    proxyNode: ProxyNode,
    sections: Map<string, any> = getProxySectionMap()
): ResolvedUpstreamProxy | undefined {
    const upstreamName = proxyNode.upstream_proxy_node;
    if (!upstreamName) return undefined;
    if (upstreamName === proxyNode.name) {
        throw new Error('Upstream proxy node cannot be itself: ' + upstreamName);
    }

    const upstreamSection = sections.get(upstreamName);
    if (!upstreamSection) {
        throw new Error('Upstream proxy node not found: ' + upstreamName);
    }
    if (upstreamSection.enabled !== '1') {
        throw new Error('Upstream proxy node disabled: ' + upstreamName);
    }
    if (!isPort(upstreamSection.socks_port)) {
        throw new Error('Upstream proxy node SOCKS port invalid: ' + upstreamName);
    }

    return {
        name: upstreamName,
        socksPort: Number(upstreamSection.socks_port),
        tag: getUpstreamProxyOutboundTag(upstreamName),
        core: getProxyCore(upstreamSection),
        section: upstreamSection,
    };
}

function collectProxyChain(startName: string, sections: Map<string, any>) {
    const chain: string[] = [];
    const seen = new Set<string>();
    let currentName = startName;

    while (currentName) {
        if (seen.has(currentName)) {
            chain.push(currentName);
            return { chain, cycle: true };
        }

        seen.add(currentName);
        chain.push(currentName);

        const section = sections.get(currentName);
        if (!section || !section.upstream_proxy_node) break;
        currentName = section.upstream_proxy_node;
    }

    return { chain, cycle: false };
}

const ProxyChainUtils = {
    getProxyName,
    getProxyCore,
    getProxySections,
    getProxySectionMap,
    isPort,
    getUpstreamProxyOutboundTag,
    resolveUpstreamProxy,
    collectProxyChain,
}

export { ProxyChainUtils }
