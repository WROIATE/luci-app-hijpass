import { CoreAdapter, ProxyNode } from '../module/luci'
import { SingBoxUtils } from './singbox/builder'
import { XrayUtils } from './xray/builder'

const FactoryType = {
    SING_BOX: 'sing-box',
    XRAY: 'xray',
    CUSTOM: 'custom',
} as const

function normalizeCoreType(type: string) {
    return type === 'singbox' ? FactoryType.SING_BOX : type;
}

const CoreAdapterFactory = {
    getCoreAdapter: function (type: string): CoreAdapter {
        switch (normalizeCoreType(type)) {
            case FactoryType.SING_BOX: return SingBoxUtils
            case FactoryType.XRAY: return XrayUtils
            default: throw new Error('Unsupported core: ' + type)
        }
    }
}

const LuciConverterFactory = {
    genProxyConf: function (type: string, proxyNode: ProxyNode): {} {
        switch (normalizeCoreType(type)) {
            case FactoryType.SING_BOX: return SingBoxUtils.genProxyConf(proxyNode)
            case FactoryType.XRAY: return XrayUtils.genProxyConf(proxyNode)
            default: throw new Error('Unsupported core: ' + type)
        }
    }
}

export { FactoryType, CoreAdapterFactory, LuciConverterFactory }
