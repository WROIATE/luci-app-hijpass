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

export const HijpassValues = {
    DNS_STRATEGY_VALUES: [
        {label: '优先v6（仅sing-box，xray默认双栈）', value: '64'},
        {label: '优先v4（仅sing-box，xray默认双栈）', value: '46'},
        {label: '只使用v6', value: '6'},
        {label: '只使用v4', value: '4'}
    ],
    SHUNT_LOG_LEVELS: ['info', 'warn', 'error', 'debug'] as const,
    SHUNT_CONF_TYPE: ['xray', 'sing-box'] as const
}

export enum ShuntTag {
    DIRECT_OUTBOUND_TAG = "hijpass-direct",
    BLOCK_OUTBOUND_TAG = "hijpass-block",
    LOAD_BALANCE_OUTBOUND_TAG = "hijpass-slb",
}