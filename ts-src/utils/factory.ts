import { CoreAdapter, ProxyNode } from '../module/luci'
import { SingBoxUtils } from '../core/singbox/builder'
import { XrayUtils } from '../core/xray/builder'
import { CommandUtils } from '../core/custom/builder'

export const FactoryType = {
    SING_BOX: 'sing-box',
    XRAY: 'xray',
    COMMAND: 'command',
} as const

export const ShuntConfFactory = {
    getShuntUtils: function (type: string): CoreAdapter {
        switch (type) {
            case FactoryType.SING_BOX: return SingBoxUtils
            case FactoryType.XRAY: return XrayUtils
            case FactoryType.COMMAND: return CommandUtils
        }
    }
}

export const LuciConverterFactory = {
    genProxyConf: function (type: string, proxyNode: ProxyNode): {} {
        switch (type) {
            case FactoryType.SING_BOX: return SingBoxUtils.genProxyConf(proxyNode)
            case FactoryType.XRAY: return XrayUtils.genProxyConf(proxyNode)
            case FactoryType.COMMAND: return CommandUtils.genProxyConf(proxyNode)
        }
    }
}