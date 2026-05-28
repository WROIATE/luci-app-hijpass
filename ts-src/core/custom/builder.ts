import uci from 'uci'
import { CoreAdapter, CustomProxyNode, ProxyNode } from '../../module/luci'
import { LuciFlied } from '../../enum/hijpass'

export const CommandUtils: CoreAdapter = {
    genShuntConf,
    genProxyConf
}

function genShuntConf() {
    return uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'shunt_conf_data') || ''
}

function genProxyConf(proxyNode: ProxyNode) {
    return (proxyNode as CustomProxyNode).custom_conf || ''
}
