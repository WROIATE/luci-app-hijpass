import { ShuntConfigUtils, ProxyNode } from '../module/luci'
import { SingBoxUtils } from '../core/singbox/builder'
import { XrayUtils } from '../core/xray/builder'

export const FactoryType = {
    SING_BOX: 'sing-box',
    XRAY: 'xray',
} as const

export const ShuntConfFactory = {
    getShuntUtils: function (type: string): ShuntConfigUtils {
        switch (type) {
            case FactoryType.SING_BOX: return SingBoxUtils
            case FactoryType.XRAY: return XrayUtils
        }
    }
}

export const LuciConverterFactory = {
    genProxyConf: function (type: string, proxyNode: ProxyNode): {} {
        switch (type) {
            case FactoryType.SING_BOX: return SingBoxUtils.genProxyConf(proxyNode)
            case FactoryType.XRAY: return XrayUtils.genProxyConf(proxyNode)
        }
    }
}