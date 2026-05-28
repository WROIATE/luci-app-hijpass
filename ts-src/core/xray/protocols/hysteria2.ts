import type { ProxyNode } from '../../../module/luci'
import { Hysteria2Config } from '../../../module/luci'
import type { Outbound, TlsObject } from '../models'
import { xrayRegistry, type XrayProtocol } from './protocol'

interface HysteriaSettings {
    version: 2
    auth: string
    udpIdleTimeout?: number
}

interface Hysteria2StreamSettings {
    network: 'hysteria'
    security: 'tls'
    tlsSettings: TlsObject
    hysteriaSettings: HysteriaSettings
}

export class Hysteria2Outbound implements Outbound {
    settings: { version: 2; address: string; port: number }
    protocol: string
    tag: string
    streamSettings: Hysteria2StreamSettings

    constructor(
        address: string,
        port: number,
        tag: string,
        password: string,
        serverName: string,
        allowInsecure: boolean = false,
        udpIdleTimeout?: number
    ) {
        this.protocol = 'hysteria'
        this.tag = tag
        this.settings = { version: 2, address, port }
        this.streamSettings = {
            network: 'hysteria',
            security: 'tls',
            tlsSettings: { serverName, allowInsecure, alpn: ['h3'] },
            hysteriaSettings: {
                version: 2,
                auth: password,
                ...(udpIdleTimeout !== undefined ? { udpIdleTimeout } : {})
            }
        }
    }
}

const hysteria2Protocol: XrayProtocol = {
    type: 'hysteria2',
    build(config: ProxyNode): Outbound {
        const c = config as Hysteria2Config
        const udpIdleTimeout = c.udp_idle_timeout ? Number(c.udp_idle_timeout) : undefined
        return new Hysteria2Outbound(
            c.server,
            Number(c.server_port),
            c.name,
            c.password || '',
            c.tls_server_name || c.server,
            c.tls_insecure === '1',
            udpIdleTimeout
        )
    }
}

xrayRegistry.register(hysteria2Protocol)
