import { CoreAdapter, ProxyNode } from '../../module/luci'
import { LuciFlied } from '../../enum/hijpass'
import { getCachedConf } from './cache'

export const CommandUtils: CoreAdapter = {
    genShuntConf,
    genProxyConf
}

function genShuntConf() {
    return getCachedConf('shunt_conf')
}

function genProxyConf(proxyNode: ProxyNode) {
    return getCachedConf(LuciFlied.CONF_NAME + ':' + proxyNode.cfgid)
}
