import { CoreAdapter, ProxyNode } from '../../module/luci'
import { getCachedConf } from './cache'

export const CommandUtils: CoreAdapter = {
    genShuntConf,
    genProxyConf
}

function genShuntConf() {
    return getCachedConf('shunt_conf')
}

function genProxyConf(proxyNode: ProxyNode) {
    return getCachedConf(proxyNode.cfgid)
}
