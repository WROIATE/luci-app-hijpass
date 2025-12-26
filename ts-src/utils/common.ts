import {LuciFlied} from "../enum/hijpass";
import {
    RuleDTO,
    DnsNode,
    DnsSection,
    RouteSection,
    ShuntRouteRule,
    ShuntSection,
    LoadBalanceNode, RuleSetDTO
} from "../module/luci";
import rpc from "rpc";
import poll from "poll";
import uci from "uci";
import fs from "fs";
import form from "form";
import ui from "ui";
import {ShuntConfFactory} from "./factory";
import {SingBoxUtils} from "./singbox";
import notificationManager from "../module/notification";
import b from "baseclass";


const callServiceList = rpc.declare({
    object: 'service',
    method: 'list',
    params: ['name'],
    expect: {'': {}}
})

const MiscUtils = {
    getServiceInfo: async function () {
        const hijpass = await callServiceList(LuciFlied.CONF_NAME);
        const hijserver = await callServiceList(LuciFlied.SERVER_CONF_NAME);
        let serverInstances = hijserver?.[LuciFlied.SERVER_CONF_NAME]?.['instances'] ?? {};
        let instances = hijpass?.[LuciFlied.CONF_NAME]?.['instances'] ?? {};
        return {
            proxyInfos: MiscUtils.getInstanceName(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE).map(
                (name) => {
                    return instances?.[name] ?? undefined;
                }
            ).filter(instance => instance),
            shuntInfo: instances?.[MiscUtils.getInstanceName(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE)[0]] ?? undefined,
            dnsInfo: instances?.[MiscUtils.getInstanceName(LuciFlied.CONF_NAME, LuciFlied.DNS_SECTION_TYPE)[0]] ?? undefined,
            serverInfos: MiscUtils.getInstanceName(LuciFlied.SERVER_CONF_NAME, LuciFlied.SERVER_NODE_TYPE).map(
                (name) => {
                    return serverInstances?.[name] ?? undefined;
                }
            ).filter(instance => instance),
        }
    },

    renderServiceStatus: function (res: any, type?: string) {
        let renderHTML = "";
        let spanTemp = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';
        let isProxyRunning = (res?.proxyInfos ?? [])
            .filter(instance => instance?.running)
            .length > 0
        let isServerRunning = (res?.serverInfos ?? [])
            .filter(instance => instance?.running)
            .length > 0
        let isShuntRunning = res?.shuntInfo?.running ?? false
        let isDnsRunning = res?.dnsInfo?.running ?? false

        let getColorSpan = function (title: string, isRunning: any) {
            if (isRunning) {
                return spanTemp.format('green', _(title), _("运行中"));
            } else {
                return spanTemp.format('red', _(title), _("未运行"));
            }
        }

        switch (type) {
            case 'dns':
                renderHTML += getColorSpan(_("DNS"), isDnsRunning)
                break;
            case 'shunt':
                renderHTML += getColorSpan(_("分流服务"), isShuntRunning)
                break;
            case 'server':
                renderHTML += getColorSpan(_("服务端"), isServerRunning)
                break;
            case 'proxy':
                renderHTML += getColorSpan(_("代理节点"), isProxyRunning)
                break;
            default:
                renderHTML += getColorSpan(_("代理节点"), isProxyRunning)
                renderHTML += getColorSpan(_("分流服务"), isShuntRunning)
                renderHTML += getColorSpan(_("DNS"), isDnsRunning)
                renderHTML += getColorSpan(_("服务端"), isServerRunning)
        }

        return renderHTML;
    },

    getInstanceName: function (confName: string, sectionType: string): string[] {
        return uci.sections(confName, sectionType).map((section) => {
            let cid = section['.name'];
            let name = section['name'] ?? section['tag'] ?? section['dns_service']
            if (!name) {
                name = sectionType
            }
            return cid + '-' + name;
        })
    },

    parseRuleSetPath: function (line: string, type: string): RuleSetDTO {
        let pathOrUrl = line.substring(type === 'remote' ? 16 : 15);
        let filename = pathOrUrl.split('/').pop();
        let tag = filename.substring(0, filename.lastIndexOf('.')) || filename;
        let format = (type === 'remote' ? pathOrUrl : filename).endsWith('srs') ? 'binary' : 'source';
        return {tag: tag, type: type, format: format, pathOrUrl: pathOrUrl}
    },

    camelToSnake: function (str: string) {
        return str.replace(/([A-Z])/g, function (match) {
            return '_' + match.toLowerCase();
        });
    },

    transFromUci: function (object: any, section: any) {
        Object.keys(object).forEach(key => {
            let uciOption = MiscUtils.camelToSnake(key)
            if (section[uciOption]) {
                object[key] = section[uciOption]
            }
        });
    },
};

const LuciUtils = {
    refreshServiceStatus: function (type: string) {
        return async function () {
            const res = await L.resolveDefault(MiscUtils.getServiceInfo());
            let view = document.getElementById("service_status");
            if (view) view.innerHTML = MiscUtils.renderServiceStatus(res, type);
        }
    },

    renderServiceStatus: function (type?: string) {
        return function () {
            poll.add(LuciUtils.refreshServiceStatus(type));

            return E('div', {class: 'cbi-map'},
                E('fieldset', {class: 'cbi-section'}, [
                    E('p', {id: 'service_status', style: 'display: flex; gap: 1rem;'},
                        _('正在获取状态...'))
                ])
            );
        }
    },

    genHandleSaveApply: function () {
        return async function (ev: Event) {
            try {
                if (uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'type') === 'sing-box') {
                    SingBoxUtils.writeGeoRule()
                }
                let data = ShuntUtils.getShuntConfData()
                await this.handleSave(ev)
                if (uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'config_type') === 'tmpl') {
                    await fs.write(WebUtils.getFilePath('shunt_conf'), data);
                }
                ui.changes.apply(true);
            } catch (e) {
                WebUtils.showErrorNotification("配置应用失败", _(e.message), 5000);
            }
        }
    },
}

const ShuntUtils = {
    getShuntSection: function () {
        let shuntSection = new ShuntSection();
        let uSection = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE);
        MiscUtils.transFromUci(shuntSection, uSection)
        shuntSection.loadBalance = ShuntUtils.getLoadBalanceSection()
        shuntSection.dns = ShuntUtils.getDnsSection()
        shuntSection.route = ShuntUtils.getRouteSection()
        return shuntSection;
    },

    getRouteSection: function () {
        let shuntSection = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE)
        let routeSection = new RouteSection();
        MiscUtils.transFromUci(routeSection, shuntSection)

        uci.sections(LuciFlied.CONF_NAME, LuciFlied.SHUNT_ROUTE_RULE_TYPE, function (section) {
            let rule = new ShuntRouteRule()
            MiscUtils.transFromUci(rule, section)
            routeSection.rules.push(rule)
        })
        return routeSection;
    },

    getDnsSection: function () {
        let shuntSection = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE)
        let dnsSection = new DnsSection();
        dnsSection.nodes = []
        MiscUtils.transFromUci(dnsSection, shuntSection)

        uci.sections(LuciFlied.CONF_NAME, LuciFlied.SHUNT_DNS_NODE_TYPE, function (section) {
            let server = new DnsNode()
            MiscUtils.transFromUci(server, section)
            dnsSection.nodes.push(server)
        })
        return dnsSection;
    },

    getLoadBalanceSection: function () {
        let shuntSection = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE)
        let loadBalanceSection = new LoadBalanceNode();
        MiscUtils.transFromUci(loadBalanceSection, shuntSection)
        return loadBalanceSection;
    },

    /**
     * 解析规则列表，根据前缀分类
     * @returns {RuleDTO} 包含不同类型规则的对象
     */
    parseRuleList: function (rule: ShuntRouteRule): RuleDTO {
        // 初始化结果对象
        let result = new RuleDTO();
        let domainRules = rule.domainList
        let ipRules = rule.ipList

        result.network = rule.network ? rule.network : []
        result.protocol = rule.protocol ? rule.protocol : []

        if (rule.port) {
            result.port = rule.port
                .map(port => parseInt(port, 10))
                .filter(port => !isNaN(port))
        }

        if (rule.portRange) {
            result.portRange = rule.portRange
                .map(range => range.replace('-', ':'))
                .filter(range => range.length > 0)
        }

        if (domainRules && domainRules.trim() !== '') {
            // 按行分割并处理
            let lines = domainRules.split('\n');

            for (let line of lines) {
                line = line.trim();

                // 跳过空行和注释
                if (line === '' || line.startsWith('#')) {
                    continue;
                }

                // 处理rule-set（域名和IP通用）
                if (line.startsWith('rule-set:')) {
                    let type = line.startsWith('rule-set:remote:') ? 'remote' : 'local';
                    let ruleSet = MiscUtils.parseRuleSetPath(line, type);
                    result.ruleSet.push(ruleSet);
                    continue;
                }

                // 处理域名特有规则
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
            }
        }

        if (ipRules && ipRules.trim() !== '') {
            // 按行分割并处理
            let lines = ipRules.split('\n');
            for (let line of lines) {
                // 跳过空行和注释
                if (line === '' || line.startsWith('#')) {
                    continue;
                }

                // 处理rule-set（域名和IP通用）
                if (line.startsWith('rule-set:')) {
                    let type = line.startsWith('rule-set:remote:') ? 'remote' : 'local';
                    let ruleSet = MiscUtils.parseRuleSetPath(line, type);
                    result.ruleSet.push(ruleSet);
                    continue;
                }

                if (line.startsWith('geoip:')) {
                    result.geoIp.push(line)
                } else {
                    result.ipCidr.push(line);
                }
            }
        }

        return result;
    },

    getShuntConfData: function () {
        let data = "";
        if (uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'config_type') === 'tmpl') {
            let type = uci.get_first(LuciFlied.CONF_NAME,
                LuciFlied.SHUNT_SECTION_TYPE, 'type')
            data = JSON.stringify(ShuntConfFactory.getShuntUtils(type).genShuntConf(), ShuntUtils.omitEmptyReplacer, 2)
        }
        return data;
    },

    omitEmptyReplacer: function (_: string, value: any) {
        // 过滤 value 本身为空数组的情况
        if (Array.isArray(value) && value.length === 0) {
            return undefined;  // JSON.stringify 会跳过该属性
        }
        if (value === null) {
            return undefined;
        }
        if (typeof value === 'number' && !Number.isFinite(value)) {
            return undefined;
        }
        if (typeof value === 'string' && !value.trim()) {
            return undefined;
        }
        return value;
    }
}

const WebUtils = {
    // 创建标签验证器
    createTagValidator: function (confName: string, sectionType: string, fieldName: string) {
        return function (section_id: any, value: any) {
            // 验证名称格式
            let formatResult = WebUtils.validateNameFormat(section_id, value);
            if (formatResult !== true) {
                return formatResult;
            }

            // 验证标签是否重复
            let duplicate = false;
            uci.sections(confName, sectionType, function (section) {
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


    // 端口冲突检查函数
    validateProxyPortConflict: function (sectionId, value) {
        // 检查是否与shunt配置的端口冲突
        let shuntSection = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE)
        if (shuntSection && shuntSection['.name'] != sectionId) {
            if ((shuntSection.dns_listen_port && shuntSection.dns_listen_port === value)
                || (shuntSection.shunt_listen_port && shuntSection.shunt_listen_port === value)) {
                return _('端口 %s 已被分流配置占用').format(value);
            }
        }

        // 检查是否与其他proxy节点的端口冲突
        let proxySections = uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE);
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

    validateNameFormat: function (sectionId: any, value: any) {
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
            if (!uci.get(LuciFlied.CONF_NAME, result)) {
                break
            }
        }

        return result;
    },

    setAnonymousGridSectionMembers: function (section: any) {
        WebUtils.setGridSectionMembers(section);
        section.anonymous = true;
        section.sectiontitle = function (sectionId: any) {
            return uci.get(LuciFlied.CONF_NAME, sectionId, 'name')
                || uci.get(LuciFlied.CONF_NAME, sectionId, 'tag')
                || sectionId;
        };
    },

    setGridSectionMembers: function (section: any) {
        section.anonymous = false;
        section.addremove = true;
        section.sortable = true;
        section.nodescriptions = true;
        section.rowcolors = true;
    },

    simpleHash: function (str: string) {
        let hash = 0;
        str = str ? str : '';
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0; // 转32位整数
        }
        return hash;
    },

    setEditorOptionMembers: function (o: LuCI.form.TextValue, filePath: string, fieldName: string) {
        o.rows = 30;
        // 从文件读取内容
        o.load = function (_) {
            return fs.trimmed(filePath);
        };

        async function writeFile(sectionId: string, formvalue: string) {
            let currentHash = WebUtils.simpleHash(formvalue)
            let oldHash = uci.get_first(LuciFlied.CONF_NAME, sectionId, fieldName)
            if (currentHash == oldHash) {
                return
            }
            uci.set(LuciFlied.CONF_NAME, sectionId, fieldName, WebUtils.simpleHash(formvalue))
            await fs.write(filePath, (formvalue || '').trim().replace(/\r\n/g, '\n') + '\n');
        }

        // 写入文件
        o.write = writeFile
        o.monospace = true;

        return o;
    },

    createTextOption: function (s: LuCI.form.AbstractSection, tabName: string,
                                fieldName: string, title: string, description: string, filePath: string) {
        let o = s.taboption(tabName, form.TextValue, fieldName, title, description);
        WebUtils.setEditorOptionMembers(o, filePath, fieldName);
        return o;
    },

    getFilePath: function (option: any) {
        let path = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.GLOBAL_SECTION_TYPE, option)
        if (path) {
            return path
        }
        console.log(option + ' path is empty')
        return ''
    },

    // 设置TypedSection为单例
    setAnonymousSection: function (subsection: any) {
        subsection.anonymous = true;
        subsection.addremove = false;
    },

    /**
     * 显示通知（支持 title 和 content）
     */
    showNotification: function (options: any) {
        return notificationManager.show(options);
    },

    /**
     * 显示成功通知（支持 title 和 content）
     */
    showSuccessNotification: function (title: string, content?: string, duration?: number) {
        return notificationManager.show({title, content, type: 'success', duration});
    },

    /**
     * 显示错误通知（支持 title 和 content）
     */
    showErrorNotification: function (title: string, content?: string, duration?: number) {
        return notificationManager.show({title, content, type: 'error', duration});
    },

    /**
     * 显示警告通知（支持 title 和 content）
     */
    showWarningNotification: function (title: string, content?: string, duration?: number) {
        return notificationManager.show({title, content, type: 'warning', duration});
    },

    /**
     * 显示信息通知（支持 title 和 content）
     */
    showInfoNotification: function (title: string, content?: string, duration?: number) {
        return notificationManager.show({title, content, type: 'info', duration});
    },

    /**
     * 清空所有通知
     */
    clearNotifications: function () {
        return notificationManager.clear();
    },

    createLogFlagOption: function (s: LuCI.form.AbstractSection, conf_type: string, tab: string) {
        let log_dir = uci.get_first(conf_type, conf_type, 'log_dir');

        let o = tab ? s.taboption(tab, form.Flag, 'log_enabled', _('记录日志'))
            : s.option(form.Flag, 'log_enabled', _('记录日志'));
        o.write = function (section_id: string, value: string) {
            let log_file = 'shunt.log'
            let name = uci.get(conf_type, section_id, 'name');
            if (name) {
                log_file = name + '-' + section_id + '.log'
            }

            uci.set(conf_type, section_id, 'log_path', log_dir + '/' + log_file);
        }
        o.remove = function (section_id: string) {
            uci.unset(conf_type, section_id, 'log_path');
        }
        o.load = function (section_id: string) {
            if (uci.get(conf_type, section_id, 'log_path')) {
                return '1'
            }
            return '0'
        }
        o.rmempty = true;
        return o;
    },

    createServiceStatusSection: function (m: LuCI.form.Map, type?: string) {
        let s = m.section(form.TypedSection);
        s.anonymous = true;
        s.render = LuciUtils.renderServiceStatus(type);
        return s;
    }
}

export {LuciUtils, WebUtils, ShuntUtils}