export enum LuciFlied {
    CONF_NAME = 'hijpass',
    SERVER_CONF_NAME = 'hijserver',

    // 匿名节点类型
    GLOBAL_SECTION_TYPE = 'hijpass',

    SHUNT_SECTION_TYPE = 'shunt',

    FIREWALL_SECTION_TYPE = 'firewall',
    DNS_SECTION_TYPE = 'dns',
    RULE_SECTION_TYPE = 'rule',

    // 命名节点类型
    SHUNT_ROUTE_RULE_TYPE = 'shunt_route_rule',
    SHUNT_DNS_NODE_TYPE = 'shunt_dns_node',
    PROXY_NODE_TYPE = 'proxy_node',
    SERVER_NODE_TYPE = 'server_node'
}

export const PROXY_TYPE = {
    CUSTOM: 'custom',
    HYSTERIA2: 'hysteria2',
    SHADOWSOCKS: 'shadowsocks',
    TUIC: 'tuic',
    SHADOWTLS: 'shadowtls',
    VLESS: 'vless'
} as const;

export const HijpassValues = {
    DNS_STRATEGY_VALUES: [
        {label: '优先v6（仅sing-box，xray默认双栈）', value: '64'},
        {label: '优先v4（仅sing-box，xray默认双栈）', value: '46'},
        {label: '只使用v6', value: '6'},
        {label: '只使用v4', value: '4'}
    ],
    SHUNT_LOG_LEVELS: ['info', 'warn', 'error', 'debug'] as const,
    SHUNT_CONF_TYPE: ['xray', 'sing-box'] as const,
    PROXY_TYPES: [
        {label: 'Shadowsocks', value: 'shadowsocks'},
        {label: 'Hysteria2', value: 'hysteria2'},
        {label: 'TUIC', value: 'tuic'},
        {label: 'ShadowTLS', value: 'shadowtls'},
        {label: 'VLESS', value: 'vless'},
        {label: '自定义', value: 'custom'}
    ] as const,
    SHADOWSOCKS_METHODS: [
        {label: '2022-blake3-aes-128-gcm', value: '2022-blake3-aes-128-gcm'},
        {label: '2022-blake3-aes-256-gcm', value: '2022-blake3-aes-256-gcm'},
        {label: '2022-blake3-chacha20-poly1305', value: '2022-blake3-chacha20-poly1305'},
        {label: 'aes-128-gcm', value: 'aes-128-gcm'},
        {label: 'aes-192-gcm', value: 'aes-192-gcm'},
        {label: 'aes-256-gcm', value: 'aes-256-gcm'},
        {label: 'chacha20-ietf-poly1305', value: 'chacha20-ietf-poly1305'},
        {label: 'xchacha20-ietf-poly1305', value: 'xchacha20-ietf-poly1305'}
    ] as const,
    MULTIPLEX_PROTOCOLS: [
        {label: 'smux', value: 'smux'},
        {label: 'yamux', value: 'yamux'},
        {label: 'h2mux', value: 'h2mux'}
    ] as const,
    TUIC_CONGESTION_CONTROLS: [
        {label: 'cubic', value: 'cubic'},
        {label: 'new_reno', value: 'new_reno'},
        {label: 'bbr', value: 'bbr'}
    ] as const,
    TUIC_UDP_RELAY_MODES: [
        {label: '原生UDP', value: 'native'},
        {label: 'QUIC流', value: 'quic'}
    ] as const,
    SHADOWTLS_VERSIONS: [
        {label: 'v1', value: '1'},
        {label: 'v2', value: '2'},
        {label: 'v3', value: '3'}
    ] as const,
    VLESS_FLOWS: [
        {label: '无', value: ''},
        {label: 'xtls-rprx-vision', value: 'xtls-rprx-vision'}
    ] as const,
    VLESS_PACKET_ENCODINGS: [
        {label: '禁用', value: ''},
        {label: 'packetaddr', value: 'packetaddr'},
        {label: 'xudp', value: 'xudp'}
    ] as const,
    V2RAY_TRANSPORT_TYPES: [
        {label: '无', value: ''},
        {label: 'HTTP', value: 'http'},
        {label: 'WebSocket', value: 'ws'},
        {label: 'gRPC', value: 'grpc'},
        {label: 'HTTPUpgrade', value: 'httpupgrade'},
        {label: 'XHTTP', value: 'xhttp'}
    ] as const,
    HYSTERIA2_OBFS_TYPES: [
        {label: '禁用', value: ''},
        {label: 'Salamander', value: 'salamander'}
    ] as const
}

export enum ShuntTag {
    DIRECT_OUTBOUND_TAG = "hijpass-direct",
    BLOCK_OUTBOUND_TAG = "hijpass-block",
    LOAD_BALANCE_OUTBOUND_TAG = "hijpass-slb",
}