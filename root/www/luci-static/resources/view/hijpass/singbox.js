'use strict';
'require uci';
'require network'
'require baseclass';
'require view.hijpass.hijpass as hj'

class Log {
    constructor() {
        this.disabled = false
        this.level = 'info'
        this.timestamp = true
    }
}

// DNS Server Template
class DnsServer {
    constructor(type, tag, server, detour) {
        this.type = type
        this.tag = tag
        this.server = server
        this.detour = detour
    }
}

// DNS Global Template
class DNS {
    constructor() {
        this.servers = []
        this.rules = []
        this.strategy = 'prefer_ipv6'
        this.disable_cache = true
        this.disable_expire = true
    }
}

// Rule Template
class Rule {
    constructor() {
        this.protocol = undefined
        this.port = undefined
        this.port_range = undefined
        this.domain = undefined
        this.domain_suffix = undefined
        this.domain_keyword = undefined
        this.domain_regex = undefined
        this.rule_set = undefined
    }
}

class RouteRule extends Rule {
    constructor(rule, action, outbound) {
        super();
        if (rule) {
            this.protocol = rule.protocol;
            this.port = rule.port;
            this.port_range = rule.port_range;
            this.domain = rule.domain;
            this.domain_suffix = rule.domain_suffix;
            this.domain_keyword = rule.domain_keyword;
            this.domain_regex = rule.domain_regex;
            this.rule_set = rule.rule_set;
        }
        this.action = action
        this.outbound = outbound
    }
}

class DnsRule extends Rule {
    constructor(rule, action, server) {
        super();
        if (rule) {
            this.domain = rule.domain;
            this.domain_suffix = rule.domain_suffix;
            this.domain_keyword = rule.domain_keyword;
            this.domain_regex = rule.domain_regex;
            this.rule_set = rule.rule_set;
        }
        this.action = action
        this.server = server
        this.disable_cache = true
    }
}

// Rule Set Template
class RuleSet {
    constructor(type, url) {
        this.type = type
        // tag名为url或path的文件名
        let filename = url.split('/').pop();
        this.tag = filename.substring(0, filename.lastIndexOf('.'));
        // 如果url结尾为srs，format为binary，否则为json
        if (url.endsWith('srs')) {
            this.format = 'binary'
        } else {
            this.format = 'source'
        }
        if (type === "local") {
            this.path = url
        } else {
            this.url = url
        }
    }
}

// Route Global Template
class Route {
    constructor() {
        this.rules = [
            {
                action: 'sniff'
            },
            {
                protocol: 'dns',
                action: 'hijack-dns'
            }
        ]
        this.rule_set = []
        this.default_domain_resolver = ''
        this.final = ''
    }
}

class Outbound {
    constructor(type, tag) {
        this.type = type
        this.tag = tag
    }
}

class Socks extends Outbound {
    constructor(server, server_port, tag) {
        super('socks', tag);
        this.server = server
        this.server_port = server_port
        this.version = '5'
    }
}

class Inbound {
    constructor(type, port, tag) {
        this.type = type
        this.tag = tag
        this.listen = "::"
        this.listen_port = port
    }
}

function genConf() {
    let rulesMap = {}
    let ruleSetMap = new Map();
    uci.sections(hj.CONF_NAME, 'shunt_rules_group', function (section) {
        let rule = new Rule()
        let name = section.name
        rule.network = section.network
        rule.protocol = section.protocol
        if (section.port) {
            rule.port = section.port.map(port => parseInt(port, 10))
        }
        if (section.port_range) {
            rule.port_range = section.port_range.map(range => range.replace('-', ':'))
        }

        let domainMap = parseDomainList(section.domain_list)
        rule.domain = domainMap.domain
        rule.domain_suffix = domainMap.domain_suffix
        rule.domain_keyword = domainMap.domain_keyword
        rule.domain_regex = domainMap.domain_regex
        rule.rule_set = domainMap.rule_set
        rulesMap[name] = rule;

        let ipMap = parseIPList(section.ip_list)
        rule.ip_cidr = ipMap.ip_cidr
        if (ipMap.rule_set) {
            rule.rule_set = rule.rule_set ? rule.rule_set.concat(ipMap.rule_set) : ipMap.rule_set
        }

        if (domainMap._ruleSetPaths) {
            for (let ruleSet of domainMap._ruleSetPaths) {
                ruleSetMap.set(ruleSet.tag, ruleSet);
            }
        }
        if (ipMap._ruleSetPaths) {
            for (let ruleSet of ipMap._ruleSetPaths) {
                ruleSetMap.set(ruleSet.tag, ruleSet);
            }
        }
    });
    console.log(ruleSetMap)
    console.log(rulesMap)
    let dnsServerMap = {}
    let dns = new DNS()
    uci.sections(hj.CONF_NAME, 'shunt_dns_server', function (section) {
        let server = new DnsServer(section.type, section.tag, section.server, undefined)
        dnsServerMap[section.tag] = server
        // dns.servers.push(server)
    })

    let route = new Route()
    uci.sections(hj.CONF_NAME, 'shunt_route', function (section) {
        if (section.enabled === "1" && rulesMap[section.rule_name]) {
            let rule = rulesMap[section.rule_name];
            let action = "route"
            let serverTag = section.dns_server
            let outbound = section.proxy_node

            if (section.proxy_node === "hijpass-direct") {
                outbound = "direct-out"
            } else if (section.proxy_node === "hijpass-block") {
                action = "reject"
                outbound = undefined
                serverTag = undefined
            }

            // 添加路由规则
            route.rules.push(new RouteRule(rule, action, outbound))

            // 检查规则中是否存在域名相关规则
            let hasDomainRule = rule.domain || rule.domain_suffix ||
                rule.domain_keyword || rule.domain_regex ||
                (rule.rule_set && rule.rule_set.length > 0);

            // 只有存在域名规则时才添加DNS规则
            if (hasDomainRule) {
                let commonServer = dnsServerMap[serverTag];
                if (commonServer) {
                    let server = new DnsServer(commonServer.type, section.rule_name + '-dns',
                        commonServer.server, outbound === "direct-out" ? undefined : outbound)
                    dns.servers.push(server)
                    dns.rules.push(new DnsRule(rule, action, section.rule_name + '-dns'))
                }
            }
        }
    })

    ruleSetMap.forEach((value, key) => {
        route.rule_set.push(value)
    });
    route.default_domain_resolver = uci.get_first(hj.CONF_NAME, 'shunt', 'default_dns')
    route.final = uci.get_first(hj.CONF_NAME, 'shunt', 'default_outbound')
    route.final = route.final === "hijpass-direct" ? "direct-out" : route.final
    if (route.default_domain_resolver && route.final) {
        let commonServer = dnsServerMap[route.default_domain_resolver]
        let defaultServer = new DnsServer(commonServer.type, route.default_domain_resolver,
            commonServer.server, route.final === "direct-out" ? undefined : route.final)
        dns.servers.push(defaultServer)
    }

    let outbounds = [new Outbound('direct', 'direct-out'), new Outbound('block', 'block')]
    uci.sections(hj.CONF_NAME, hj.PROXY_NODE_TYPE, function (section) {
        if (section.enabled === '1') {
            let proxyNode = new Socks("127.0.0.1", parseInt(section.socks_port, 10), section.name)
            outbounds.push(proxyNode)
        }
    })

    let inbounds = [
        new Inbound("tproxy", parseInt(uci.get_first(hj.CONF_NAME, 'shunt', 'shunt_listen_port'), 10), "tproxy-in"),
        new Inbound("direct", parseInt(uci.get_first(hj.CONF_NAME, 'shunt', 'dns_listen_port'), 10), "dns-in")
    ]

    let fullConfig = {}
    fullConfig['log'] = new Log()
    fullConfig['dns'] = dns
    fullConfig['inbounds'] = inbounds
    fullConfig['outbounds'] = outbounds
    fullConfig['route'] = route
    console.log(fullConfig)
    return fullConfig
}

/**
 * 解析域名列表，根据前缀分类
 * @param {string} domainList - 域名列表字符串，每行一个规则
 * @returns {Object} 包含不同类型域名规则的对象
 */
function parseDomainList(domainList) {
    if (!domainList || domainList.trim() === '') {
        return {};
    }

    let result = {
        domain: [],           // full: 完整匹配
        domain_suffix: [],    // domain: 子域名匹配
        domain_keyword: [],   // 无前缀: 关键词匹配
        domain_regex: [],     // regexp: 正则表达式
        rule_set: []          // rule-set: 规则集引用
    };

    let ruleSetPaths = [];  // 存储完整的rule-set路径信息

    // 按行分割并处理
    let lines = domainList.split('\n');

    for (let line of lines) {
        // 去除首尾空格
        line = line.trim();

        // 跳过空行和注释
        if (line === '' || line.startsWith('#')) {
            continue;
        }

        // 根据前缀分类
        if (line.startsWith('regexp:')) {
            // 正则表达式
            let regex = line.substring(7); // 去掉 'regexp:' 前缀
            result.domain_regex.push(regex);
        }
        else if (line.startsWith('domain:')) {
            // 子域名匹配（domain suffix）
            let domain = line.substring(7); // 去掉 'domain:' 前缀
            result.domain_suffix.push(domain);
        }
        else if (line.startsWith('full:')) {
            // 完整匹配
            let full = line.substring(5); // 去掉 'full:' 前缀
            result.domain.push(full);
        }
        else if (line.startsWith('rule-set:remote:')) {
            // 远程规则集
            let url = line.substring(16); // 去掉 'rule-set:remote:' 前缀
            let filename = url.split('/').pop();
            let tag = filename.substring(0, filename.lastIndexOf('.')) || filename;
            result.rule_set.push(tag);

            // 存储完整信息供后续生成rule-set数组使用
            ruleSetPaths.push(new RuleSet('remote', url));

        }
        else if (line.startsWith('rule-set:local:')) {
            // 本地规则集
            let path = line.substring(15); // 去掉 'rule-set:local:' 前缀
            let filename = path.split('/').pop();
            let tag = filename.substring(0, filename.lastIndexOf('.')) || filename;
            result.rule_set.push(tag);

            // 存储完整信息供后续生成rule-set数组使用
            ruleSetPaths.push(new RuleSet('local', path));
        }
        else {
            // 无前缀 - 关键词匹配
            result.domain_keyword.push(line);
        }
    }

    // 删除空数组
    for (let key in result) {
        if (result[key].length === 0) {
            delete result[key];
        }
    }

    // 附加rule-set路径信息
    result._ruleSetPaths = ruleSetPaths;

    return result;
}

/**
 * 解析IP列表，根据前缀分类
 * @param {string} ipList - IP列表字符串，每行一个规则
 * @returns {Object} 包含不同类型IP规则的对象
 */
function parseIPList(ipList) {
    if (!ipList || ipList.trim() === '') {
        return {};
    }

    let result = {
        ip_cidr: [],    // IP或CIDR
        rule_set: []    // rule-set: 规则集引用
    };

    let ruleSetPaths = [];  // 存储完整的rule-set路径信息

    // 按行分割并处理
    let lines = ipList.split('\n');

    for (let line of lines) {
        // 去除首尾空格
        line = line.trim();

        // 跳过空行和注释
        if (line === '' || line.startsWith('#')) {
            continue;
        }

        // 根据前缀分类
        if (line.startsWith('rule-set:remote:')) {
            // 远程规则集
            let url = line.substring(16); // 去掉 'rule-set:remote:' 前缀
            let filename = url.split('/').pop();
            let tag = filename.substring(0, filename.lastIndexOf('.')) || filename;
            result.rule_set.push(tag);

            // 存储完整信息供后续生成rule-set数组使用
            ruleSetPaths.push(new RuleSet('remote', url));
        }
        else if (line.startsWith('rule-set:local:')) {
            // 本地规则集
            let path = line.substring(15); // 去掉 'rule-set:local:' 前缀
            let filename = path.split('/').pop();
            let tag = filename.substring(0, filename.lastIndexOf('.')) || filename;
            result.rule_set.push(tag);

            // 存储完整信息供后续生成rule-set数组使用
            ruleSetPaths.push(new RuleSet('local', path));
        }
        else {
            // IP或CIDR
            result.ip_cidr.push(line);
        }
    }

    // 删除空数组
    for (let key in result) {
        if (result[key].length === 0) {
            delete result[key];
        }
    }

    // 附加rule-set路径信息
    result._ruleSetPaths = ruleSetPaths;

    return result;
}

return baseclass.extend({
    genConf: genConf
});