'use strict';
'require uci';
'require baseclass';
'require view';
'require form';
'require ui';
'require fs';
'require rpc';
'require poll';

const HijpassEnum = {
    CONF_NAME: 'hijpass',
    // 匿名节点类型
    GLOBAL_SECTION_TYPE: 'hijpass',
    SHUNT_SECTION_TYPE: 'shunt',
    FIREWALL_SECTION_TYPE: 'firewall',
    DNS_SECTION_TYPE: 'dns',
    RULE_SECTION_TYPE: 'rule',
    // 命名节点类型
    SHUNT_ROUTE_RULE_TYPE: 'shunt_route_rule',
    SHUNT_DNS_NODE_TYPE: 'shunt_dns_node',
    PROXY_NODE_TYPE: 'proxy_node',
    DNS_STRATEGY_VALUES: ['64', '46', '6', '4'],
    SING_BOX_LOG_LEVELS: ['info', 'warn', 'error', 'debug'],
    SHUNT_CONF_TYPE: ['xray', 'sing-box']
}

const ShuntTagEnum = {
    DIRECT_OUTBOUND_TAG: "hijpass-direct",
    BLOCK_OUTBOUND_TAG: "hijpass-block",
    LOAD_BALANCE_OUTBOUND_TAG: "hijpass-slb",
}

class DnsNode {
    constructor() {
        this.tag = undefined;
        this.type = undefined;
        this.server = undefined;
        this.port = undefined;
    }
}

class DnsSection {
    constructor() {
        this.defaultDnsNode = undefined;
        this.defaultStrategy = undefined;
        this.nodes = [];
    }
}

class ShuntRouteRule {
    constructor() {
        this.enabled = undefined;
        this.name = undefined;
        this.proxyNode = undefined;

        this.action = undefined;
        this.protocol = undefined;
        this.network = undefined;
        this.port = undefined;
        this.portRange = undefined;
        this.domainList = undefined;
        this.ipList = undefined;

        this.dnsNode = undefined;
        this.dnsProxyNode = undefined;
        this.dnsStrategy = undefined;
    }
}

class RouteSection {
    constructor() {
        this.defaultProxyNode = undefined;
        this.rules = [];
    }
}

class LoadBalanceNode {
    constructor() {
        this.tag = undefined;
        this.lbNodeList = [];
        this.url = undefined;
        this.interval = undefined;
        this.timeout = undefined;
    }
}

class ShuntSection {
    constructor() {
        this.type = undefined;
        this.configType = undefined;
        this.shuntListenPort = undefined;
        this.dnsListenPort = undefined;
        this.logLevel = undefined;
        this.logPath = undefined;
        this.route = undefined;
        this.dns = undefined;
        this.loadBalance = undefined;
    }
}

const callServiceList = rpc.declare({
    object: 'service',
    method: 'list',
    params: ['name'],
    expect: {'': {}}
})

const SelfUtils = {

    checkServiceRunning: function () {
        return L.resolveDefault(callServiceList(HijpassEnum.CONF_NAME), {}).then(function (res) {
            let isRunning = false;
            try {
                uci.sections(HijpassEnum.CONF_NAME, HijpassEnum.PROXY_NODE_TYPE, (section) => {
                    let sectionName = section['.name'] + "-" + section.name
                    if (res && res[HijpassEnum.CONF_NAME] && res[HijpassEnum.CONF_NAME]['instances']
                        && res[HijpassEnum.CONF_NAME]['instances'][sectionName]) {
                        isRunning = isRunning
                            || res[HijpassEnum.CONF_NAME]['instances'][sectionName]['running'];
                    }
                })
            } catch (e) {
                console.error('Error getting service status:', e);
            }
            return isRunning;
        });
    },

    renderServiceStatus: function (isRunning) {
        let renderHTML = "";
        let spanTemp = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';

        if (isRunning) {
            renderHTML += String.format(spanTemp, 'green', _("HiJpass"), _("运行中"));
        } else {
            renderHTML += String.format(spanTemp, 'red', _("HiJpass"), _("未运行"));
        }

        return renderHTML;
    },


    parseRuleSetPath: function (line, type) {
        let pathOrUrl = line.substring(type === 'remote' ? 16 : 15);
        let filename = pathOrUrl.split('/').pop();
        let tag = filename.substring(0, filename.lastIndexOf('.')) || filename;
        let format = (type === 'remote' ? pathOrUrl : filename).endsWith('srs') ? 'binary' : 'source';
        return {tag: tag, type: type, format: format, pathOrUrl: pathOrUrl}
    },

    camelToSnake: function (str) {
        return str.replace(/([A-Z])/g, function (match) {
            return '_' + match.toLowerCase();
        });
    },

    transFromUci: function (object, section) {
        Object.keys(object).forEach(key => {
            let uciOption = SelfUtils.camelToSnake(key)
            if (section[uciOption]) {
                object[key] = section[uciOption]
            }
        });
    },
};

const ShuntUtils = {
    getShuntSection: function () {
        let shuntSection = new ShuntSection();
        let uSection = uci.get_first(HijpassEnum.CONF_NAME, HijpassEnum.SHUNT_SECTION_TYPE);
        SelfUtils.transFromUci(shuntSection, uSection)
        shuntSection.loadBalance = ShuntUtils.getLoadBalanceSection()
        shuntSection.dns = ShuntUtils.getDnsSection()
        shuntSection.route = ShuntUtils.getRouteSection()
        return shuntSection;
    },

    getRouteSection: function () {
        let shuntSection = uci.get_first(HijpassEnum.CONF_NAME, HijpassEnum.SHUNT_SECTION_TYPE)
        let routeSection = new RouteSection();
        SelfUtils.transFromUci(routeSection, shuntSection)

        uci.sections(HijpassEnum.CONF_NAME, HijpassEnum.SHUNT_ROUTE_RULE_TYPE, function (section) {
            let rule = new ShuntRouteRule()
            SelfUtils.transFromUci(rule, section)
            routeSection.rules.push(rule)
        })
        return routeSection;
    },

    getDnsSection: function () {
        let shuntSection = uci.get_first(HijpassEnum.CONF_NAME, HijpassEnum.SHUNT_SECTION_TYPE)
        let dnsSection = new DnsSection();
        SelfUtils.transFromUci(dnsSection, shuntSection)

        uci.sections(HijpassEnum.CONF_NAME, HijpassEnum.SHUNT_DNS_NODE_TYPE, function (section) {
            let server = new DnsNode()
            SelfUtils.transFromUci(server, section)
            dnsSection.nodes.push(server)
        })
        return dnsSection;
    },

    getLoadBalanceSection: function () {
        let shuntSection = uci.get_first(HijpassEnum.CONF_NAME, HijpassEnum.SHUNT_SECTION_TYPE)
        let loadBalanceSection = new LoadBalanceNode();
        SelfUtils.transFromUci(loadBalanceSection, shuntSection)
        return loadBalanceSection;
    },

    /**
     * 解析规则列表，根据前缀分类
     * @param {string} ruleList - 规则列表字符串，每行一个规则
     * @param {string} type - 'domain' 或 'ip'
     * @returns {Object} 包含不同类型规则的对象
     */
    parseRuleList: function (ruleList, type) {
        if (!ruleList || ruleList.trim() === '') {
            return {};
        }

        // 初始化结果对象
        let result = {
            ruleSet: [],
        };

        if (type === 'domain') {
            result.domain = [];
            result.domainSuffix = [];
            result.domainKeyword = [];
            result.domainRegex = [];
            result.geoSite = []
        } else {
            result.ipCidr = [];
            result.geoIp = []
        }

        // 按行分割并处理
        let lines = ruleList.split('\n');

        for (let line of lines) {
            line = line.trim();

            // 跳过空行和注释
            if (line === '' || line.startsWith('#')) {
                continue;
            }

            // 处理rule-set（域名和IP通用）
            if (line.startsWith('rule-set:')) {
                let type = line.startsWith('rule-set:remote:') ? 'remote' : 'local';
                let ruleSet = SelfUtils.parseRuleSetPath(line, type);
                result.ruleSet.push(ruleSet);
                continue;
            }

            // 处理域名特有规则
            if (type === 'domain') {
                if (line.startsWith('regexp:')) {
                    result.domainRegex.push(line.substring(7));
                } else if (line.startsWith('domain:')) {
                    result.domainSuffix.push(line.substring(7));
                } else if (line.startsWith('full:')) {
                    result.domain.push(line.substring(5));
                } else if (line.startsWith('geosite:')) {
                    result.geoSite.push(line)
                } else {
                    result.domainKeyword.push(line);
                }
            } else { // 处理IP规则
                if (line.startsWith('geoip:')) {
                    result.geoIp.push(line)
                } else {
                    result.ipCidr.push(line);
                }
            }
        }

        // 删除空数组
        for (let key in result) {
            if (Array.isArray(result[key]) && result[key].length === 0) {
                delete result[key];
            }
        }

        return result;
    }

}


const Luci = {
    renderServiceStatus: function (section_id) {
        poll.add(function () {
            return L.resolveDefault(SelfUtils.checkServiceRunning()).then(function (res) {
                let view = document.getElementById("service_status");
                if (view) view.innerHTML = SelfUtils.renderServiceStatus(res);
            });
        });

        return E('div', {class: 'cbi-map'},
            E('fieldset', {class: 'cbi-section'}, [
                E('p', {id: 'service_status'},
                    _('正在获取状态...'))
            ])
        );
    },
}

const WebUtils = {
    // 创建标签验证器
    createTagValidator: function (sectionType, fieldName) {
        return function (section_id, value) {
            // 验证名称格式
            let formatResult = WebUtils.validateNameFormat(section_id, value);
            if (formatResult !== true) {
                return formatResult;
            }

            // 验证标签是否重复
            let duplicate = false;
            uci.sections(HijpassEnum.CONF_NAME, sectionType, function (section) {
                if (section['.name'] !== section_id && section[fieldName] === value) {
                    duplicate = true;
                }
            });

            if (duplicate) {
                return _('%s已存在，请使用其他%s').format(fieldName === 'tag' ? _('标签') : _('名称'), fieldName === 'tag' ? _('标签') : _('名称'));
            }

            return true;
        };
    },
    // 封装：动态加载代理节点选项
    loadProxyNodeOptions: function (option, includeSLB) {
        option.load = function (section_id) {
            delete this.keylist;
            delete this.vallist;

            this.value(ShuntTagEnum.DIRECT_OUTBOUND_TAG, _('直连'));
            if (includeSLB !== false) {
                this.value(ShuntTagEnum.BLOCK_OUTBOUND_TAG, _('阻止'));
            }

            uci.sections(HijpassEnum.CONF_NAME, HijpassEnum.PROXY_NODE_TYPE, function (section) {
                if (section.name) {
                    let displayName = section.name;
                    if (section.socks_port) {
                        displayName += ' (' + section.socks_port + ')';
                    }
                    this.value(section.name, displayName);
                }
            }.bind(this));

            if (includeSLB !== false) {
                let slbOutbounds = uci.get_first(
                    HijpassEnum.CONF_NAME, HijpassEnum.SHUNT_SECTION_TYPE, 'lb_node_list');
                if (slbOutbounds && slbOutbounds.length > 0) {
                    this.value(ShuntTagEnum.LOAD_BALANCE_OUTBOUND_TAG, _('负载均衡'));
                }
            }

            return form.ListValue.prototype.load.apply(this, [section_id]);
        };
    },

    // 封装：动态加载DNS服务器选项
    loadDNSServerOptions: function (option, includeDefault) {
        option.load = function (section_id) {
            delete this.keylist;
            delete this.vallist;

            if (includeDefault) {
                this.value('', _('使用全局默认DNS'));
            }

            uci.sections(HijpassEnum.CONF_NAME, HijpassEnum.SHUNT_DNS_NODE_TYPE, function (section) {
                if (section.tag) {
                    let displayName = section.tag;
                    if (section.server) {
                        displayName += ' (' + section.server + ')';
                    }
                    this.value(section.tag, displayName);
                }
            }.bind(this));

            return form.ListValue.prototype.load.apply(this, [section_id]);
        };
    },

    // 节点重命名函数
    renameSection: function (section_id, node_type, name) {
        if (name && name !== section_id) {
            uci.clone(HijpassEnum.CONF_NAME, node_type, section_id, true, name)
            uci.remove(HijpassEnum.CONF_NAME, section_id)
        }
        return true;
    },

    // 端口冲突检查函数
    validateProxyPortConflict: function (sectionId, value) {
        // 检查是否与shunt配置的端口冲突
        let shuntSection = uci.get_first(HijpassEnum.CONF_NAME, HijpassEnum.SHUNT_SECTION_TYPE)
        if (shuntSection && shuntSection['.name'] != sectionId) {
            if ((shuntSection.dns_listen_port && shuntSection.dns_listen_port === value)
                || (shuntSection.shunt_listen_port && shuntSection.shunt_listen_port === value)) {
                return _('端口 %s 已被分流配置占用').format(value);
            }
        }

        // 检查是否与其他proxy节点的端口冲突
        let proxySections = uci.sections(HijpassEnum.CONF_NAME, HijpassEnum.PROXY_NODE_TYPE);
        for (let i = 0; i < proxySections.length; i++) {
            let section = proxySections[i]
            let sectionName = section['.name'];

            // 跳过当前正在编辑的节点
            if (sectionName === sectionId) {
                continue;
            }

            if (section.listen_port && section.listen_port === value) {
                return _('端口 %s 已被代理节点 "%s" 使用').format(value, section.name);
            }
        }
        return true;
    },

    validateNameFormat: function (sectionId, value) {
        if (!value || value === '') {
            return _('节点名称不能为空');
        }

        // 检查是否只包含英文字符、数字、下划线和连字符
        if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
            return _('节点名称只能包含英文字母、数字、下划线和连字符');
        }

        return true;
    },

    // 生成唯一的section ID
    generateUniqueSectionId: function () {
        let chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';

        for (; ;) {
            result = '';
            // 生成8位随机字符串
            for (let i = 0; i < 8; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }

            // 检查是否已存在（检查所有可能的section类型）
            if (!uci.get(HijpassEnum.CONF_NAME, result)) {
                break
            }
        }

        return result;
    },

    setAnonymousGridSectionMembers: function (section) {
        WebUtils.setGridSectionMembers(section);
        section.anonymous = true;
        section.sectiontitle = function (sectionId) {
            return uci.get(HijpassEnum.CONF_NAME, sectionId, 'name')
                || uci.get(HijpassEnum.CONF_NAME, sectionId, 'tag')
                || sectionId;
        };
    },

    setGridSectionMembers: function (section) {
        section.anonymous = false;
        section.addremove = true;
        section.sortable = true;
        section.nodescriptions = true;
        section.rowcolors = true;
    },

    simpleHash: function (str) {
        let hash = 0;
        str = str ? str : '';
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0; // 转32位整数
        }
        return hash;
    },

    setEditorOptionMembers: function (o, filePath, fieldName) {
        o.rows = 20;
        // 从文件读取内容
        o.load = function (sectionId) {
            return fs.trimmed(filePath);
        };

        function writeFile(sectionId, formvalue) {
            let curretnHash = WebUtils.simpleHash(formvalue)
            let oldHash = uci.get_first(HijpassEnum.CONF_NAME, sectionId, fieldName)
            if (curretnHash == oldHash) {
                return
            }
            uci.set(HijpassEnum.CONF_NAME, sectionId, fieldName, WebUtils.simpleHash(formvalue))
            return fs.write(filePath, (formvalue || '').trim().replace(/\r\n/g, '\n') + '\n');
        }

        // 写入文件
        o.write = writeFile
        o.remove = writeFile
        o.monospace = true;

        return o;
    },

    getFilePath: function (option) {
        let path = uci.get_first(HijpassEnum.CONF_NAME, HijpassEnum.GLOBAL_SECTION_TYPE, option)
        if (path) {
            return path
        }
        console.log(option + ' path is empty')
        return ''
    },

    // 设置TypedSection为单例
    setAnonymousSection: function (subsection) {
        subsection.anonymous = true;
        subsection.addremove = false;
    },

    // 创建SectionValue容器
    createSectionContainer: function (s, tab, id, sectionType, sectionName, title) {
        let o = s.taboption(tab, form.SectionValue, id, sectionType, sectionName, title);
        o.depends({config_type: "tmpl"});
        return o;
    },

    // 创建必填的ListValue
    createRequiredListValue: function (section, name, title, description, validator) {
        let o = section.option(form.ListValue, name, title, description);
        o.rmempty = false;
        if (validator) {
            o.validate = validator;
        }
        return o;
    },

    // 创建DynamicList并添加校验
    createValidatedDynamicList: function (section, name, title, description, getSectionType, getItemName) {
        let o = section.option(form.DynamicList, name, title, description);

        // 动态加载选项
        o.load = function (section_id) {
            delete this.keylist;
            delete this.vallist;

            uci.sections(HijpassEnum.CONF_NAME, getSectionType(), function (section) {
                let itemName = getItemName(section);
                if (itemName) {
                    this.value(itemName.value, itemName.display);
                }
            }.bind(this));

            return form.DynamicList.prototype.load.apply(this, [section_id]);
        };

        // 校验输入值是否存在
        o.validate = function (section_id, value) {
            if (!value || value === '') {
                return true;
            }

            let availableItems = [];
            uci.sections(HijpassEnum.CONF_NAME, getSectionType(), function (section) {
                let itemName = getItemName(section);
                if (itemName) {
                    availableItems.push(itemName.value);
                }
            });

            if (availableItems.indexOf(value) === -1) {
                return _('%s "%s" 不存在，请从下拉列表中选择或先在配置中添加').format(title, value);
            }

            return true;
        };

        return o;
    },


}

return baseclass.extend({
    Luci: Luci,
    ShuntUtils: ShuntUtils,
    WebUtils: WebUtils,
    ShuntTagEnum: ShuntTagEnum,
    HijpassEnum: HijpassEnum,
});