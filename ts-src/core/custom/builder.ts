import { CoreAdapter, CustomProxyNode, ProxyNode } from '../../module/luci'
import { ShuntUtils } from '../../utils/common'

export const CommandUtils: CoreAdapter = {
    genShuntConf,
    genProxyConf
}

function genShuntConf() {
    return ShuntUtils.getShuntSection()
}

function genProxyConf(proxyNode: ProxyNode) {
    const node = proxyNode as CustomProxyNode
    return {
        command: node.command,
        listen_port: node.listen_port,
        socks_port: node.socks_port,
        log_enabled: node.log_enabled,
        log_path: node.log_path,
        procd_env: node.procd_env,
    }
}
