import type { ProxyNode } from '../../../module/luci'
import { VlessConfig } from '../../../module/luci'
import type { Outbound, TlsObject } from '../models'
import { xrayRegistry, type XrayProtocol } from './protocol'

interface WsObject {
    path?: string
    headers?: Record<string, string>
    heartbeatPeriod?: number
}

interface GrpcObject {
    serviceName?: string
    multiMode?: boolean
    authority?: string
    user_agent?: string
    idle_timeout?: number
    health_check_timeout?: number
    permit_without_stream?: boolean
    initial_windows_size?: number
}

interface HttpObject {
    host?: string[]
    path?: string
    method?: string
}

interface HttpUpgradeObject {
    host?: string
    path?: string
    headers?: Record<string, string>
}

interface XHTTPObject {
    host?: string
    path?: string
    mode?: string
}

interface RealityObject {
    show?: boolean
    target?: string
    xver?: number
    serverNames?: string[]
    privateKey?: string
    minClientVer?: string
    maxClientVer?: string
    maxTimeDiff?: number
    shortIds?: string[]
    mldsa65Seed?: string
    fingerprint?: string
    serverName?: string
    password?: string
    shortId?: string
    mldsa65Verify?: string
    spiderX?: string
}

interface VlessStreamSettings {
    network?: string
    security: string
    xhttpSettings?: XHTTPObject
    wsSettings?: WsObject
    grpcSettings?: GrpcObject
    httpSettings?: HttpObject
    httpupgradeSettings?: HttpUpgradeObject
    realitySettings?: RealityObject
    tlsSettings?: TlsObject
}

export class VlessOutbound implements Outbound {
    settings: any
    protocol: string
    tag: string
    streamSettings?: any

    constructor(
        address: string,
        port: number,
        id: string,
        tag: string,
        encryption: string = 'none',
        flow?: string,
        level: number = 0
    ) {
        this.protocol = 'vless'
        this.tag = tag
        this.settings = { address, port, id, encryption, level }
        if (flow) this.settings.flow = flow
    }
}

const vlessProtocol: XrayProtocol = {
    type: 'vless',
    build(config: ProxyNode): Outbound {
        const c = config as VlessConfig

        const outbound = new VlessOutbound(
            c.server,
            Number(c.server_port),
            c.uuid,
            c.name,
            'none',
            c.flow || undefined,
            0
        )

        const useReality = c.tls_reality_enabled === '1'
        const realitySettings: RealityObject = useReality ? {
            fingerprint: 'chrome',
            serverName: c.tls_server_name || c.server,
            password: c.tls_reality_public_key || '',
            shortId: c.tls_reality_short_id || ''
        } : null

        const tlsSettings: TlsObject = !useReality ? {
            allowInsecure: c.tls_insecure === '1',
            alpn: ['h2', 'http/1.1'],
            serverName: c.tls_server_name || c.server,
        } : null

        const security = useReality
            ? 'reality'
            : (c.tls_server_name || c.tls_insecure ? 'tls' : 'none')

        const streamSettings: VlessStreamSettings = { network: 'raw', security }
        if (realitySettings) streamSettings.realitySettings = realitySettings
        if (tlsSettings && security === 'tls') streamSettings.tlsSettings = tlsSettings

        switch (c.transport_type || '') {
            case 'xhttp':
                streamSettings.network = 'xhttp'
                streamSettings.xhttpSettings = {
                    host: c.transport_xhttp_host || undefined,
                    path: c.transport_xhttp_path || '/',
                    mode: c.transport_xhttp_mode || 'auto'
                }
                break
            case 'ws':
                streamSettings.network = 'websocket'
                streamSettings.wsSettings = {
                    path: c.transport_ws_path || '/',
                    ...(c.transport_ws_max_early_data ? {
                        headers: { 'Sec-WebSocket-Protocol': c.transport_ws_early_data_header_name || '' }
                    } : {})
                }
                break
            case 'grpc':
                streamSettings.network = 'grpc'
                streamSettings.grpcSettings = {
                    serviceName: c.transport_grpc_service_name || 'TunService',
                    ...(c.transport_grpc_idle_timeout ? { idle_timeout: Number(c.transport_grpc_idle_timeout) } : {}),
                    ...(c.transport_grpc_permit_without_stream === '1' ? { permit_without_stream: true } : {})
                }
                break
            case 'http':
                streamSettings.network = 'h2'
                streamSettings.httpSettings = {
                    ...(c.transport_http_host ? { host: [c.transport_http_host] } : {}),
                    path: c.transport_http_path || '/',
                    ...(c.transport_http_method ? { method: c.transport_http_method } : {})
                }
                break
            case 'httpupgrade':
                streamSettings.network = 'httpupgrade'
                streamSettings.httpupgradeSettings = {
                    host: c.transport_httpupgrade_host || undefined,
                    path: c.transport_httpupgrade_path || '/'
                }
                break
        }

        outbound['streamSettings'] = streamSettings
        return outbound
    }
}

xrayRegistry.register(vlessProtocol)
