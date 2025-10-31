'use strict';
'require rpc';
'require baseclass';
'require uci';
'require form';
'require fs';

const CONF_NAME = 'hijpass'
// 匿名节点类型
const GLOBAL_SECTION_TYPE = 'hijpass'
const SHUNT_SECTION_TYPE = 'shunt'
const FIREWALL_SECTION_TYPE = 'firewall'
const SHUNT_ROUTING_SECTION_TYPE = 'shunt_routing'
const DNS_SECTION_TYPE = 'dns'
const RULE_SECTION_TYPE = 'rule'
// 命名节点类型
const SHUNT_RULE_TYPE = 'shunt_rule'
const SHUNT_DNS_NODE_TYPE = 'shunt_dns_node'
const PROXY_NODE_TYPE = 'proxy_node'

const callServiceList = rpc.declare({
    object: 'service',
    method: 'list',
    params: ['name'],
    expect: { '': {} }
});

function isRunning() {
    return L.resolveDefault(callServiceList('hijpass'), {}).then(function (res) {
        let isRunning = false;
        try {
            uci.sections(CONF_NAME, PROXY_NODE_TYPE, (section) => {
                let sectionName = section['.name'] + "-" + section.name
                if (res && res['hijpass'] && res['hijpass']['instances'] && res['hijpass']['instances'][sectionName]) {
                    isRunning = isRunning || res['hijpass']['instances'][sectionName]['running'];
                }
            })
        } catch (e) {
            console.error('Error getting service status:', e);
        }
        return isRunning;
    });
}

function renderStatus(isRunning) {
    var renderHTML = "";
    var spanTemp = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';

    if (isRunning) {
        renderHTML += String.format(spanTemp, 'green', _("HiJpass"), _("运行中"));
    } else {
        renderHTML += String.format(spanTemp, 'red', _("HiJpass"), _("未运行"));
    }

    return renderHTML;
}

function getServiceStatus(section_id) {
    L.Poll.add(function () {
        return L.resolveDefault(isRunning()).then(function (res) {
            let view = document.getElementById("service_status");
            if (view) view.innerHTML = renderStatus(res);
        });
    });

    return E('div', { class: 'cbi-map' },
        E('fieldset', { class: 'cbi-section' }, [
            E('p', { id: 'service_status' },
                _('正在获取状态...'))
        ])
    );
}

// 节点重命名函数
function renameSection(section_id, node_type, name) {
    if (name && name !== section_id) {
        uci.clone('hijpass', node_type, section_id, true, name)
        uci.remove('hijpass', section_id)
    }
    return true;
}

// 端口冲突检查函数
function validateProxyPortConflict(sectionId, value) {

    // 检查是否与shunt配置的端口冲突
    let shuntSection = uci.get_first(CONF_NAME, SHUNT_SECTION_TYPE)
    if (shuntSection && shuntSection['.name'] != sectionId) {
        if ((shuntSection.dns_listen_port && shuntSection.dns_listen_port === value)
            || (shuntSection.shunt_listen_port && shuntSection.shunt_listen_port === value)) {
            return _('端口 %s 已被分流配置占用').format(value);
        }
    }

    // 检查是否与其他proxy节点的端口冲突
    var proxySections = uci.sections(CONF_NAME, PROXY_NODE_TYPE);
    for (var i = 0; i < proxySections.length; i++) {
        let section = proxySections[i]
        var sectionName = section['.name'];

        // 跳过当前正在编辑的节点
        if (sectionName === sectionId) {
            continue;
        }

        if (section.listen_port && section.listen_port === value) {
            return _('端口 %s 已被代理节点 "%s" 使用').format(value, section.name);
        }
    }
    return true;
}

function validateNameFormat(sectionId, value) {
    if (!value || value === '') {
        return _('节点名称不能为空');
    }

    // 检查是否只包含英文字符、数字、下划线和连字符
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
        return _('节点名称只能包含英文字母、数字、下划线和连字符');
    }

    return true;
};

// 生成唯一的section ID
function generateUniqueSectionId() {
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var result = '';

    for (; ;) {
        result = '';
        // 生成8位随机字符串
        for (var i = 0; i < 8; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        // 检查是否已存在（检查所有可能的section类型）
        if (!uci.get(CONF_NAME, result)) {
            break
        }
    }

    return result;
}

function setAnonymousGridSectionMembers(section) {
    setGridSectionMembers(section);
    section.anonymous = true;
    section.sectiontitle = function (sectionId) {
        return uci.get(CONF_NAME, sectionId, 'name') || sectionId;
    };

    // 自定义添加新节点的逻辑
    section.handleAdd = function (ev) {
        // 生成唯一的section ID
        var sectionId = generateUniqueSectionId();
        // 创建新section
        uci.add(CONF_NAME, this.sectiontype, sectionId);
        this.renderMoreOptionsModal(sectionId);
    };
}

function setGridSectionMembers(section) {
    section.anonymous = false;
    section.addremove = true;
    section.sortable = true;
    section.nodescriptions = true;
}

function simpleHash(str) {
    let hash = 0;
    str = str ? str : '';
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0; // 转32位整数
    }
    return hash;
}

function setEditorOptionMembers(o, filePath, fieldName) {
    o.rows = 20;
    // 从文件读取内容
    o.load = function (sectionId) {
        return fs.trimmed(filePath);
    };

    function writeFile(sectionId, formvalue) {
        let curretnHash = simpleHash(formvalue)
        let oldHash = uci.get_first(CONF_NAME, sectionId, fieldName)
        if (curretnHash == oldHash) {
            return
        }
        uci.set(CONF_NAME, sectionId, fieldName, simpleHash(formvalue))
        return fs.write(filePath, (formvalue || '').trim().replace(/\r\n/g, '\n') + '\n');
    }

    // 写入文件
    o.write = writeFile
    o.monospace = true;

    return o;
}



function getFilePath(option) {
    let path = uci.get_first(CONF_NAME, GLOBAL_SECTION_TYPE, option)
    if (path) {
        return path
    }
    console.log(option + ' path is empty')
    return ''
}

return baseclass.extend({
    CONF_NAME: CONF_NAME,

    GLOBAL_SECTION_TYPE: GLOBAL_SECTION_TYPE,
    SHUNT_SECTION_TYPE: SHUNT_SECTION_TYPE,
    FIREWALL_SECTION_TYPE: FIREWALL_SECTION_TYPE,
    SHUNT_ROUTING_SECTION_TYPE: SHUNT_ROUTING_SECTION_TYPE,
    DNS_SECTION_TYPE: DNS_SECTION_TYPE,
    SHUNT_RULE_TYPE: SHUNT_RULE_TYPE,
    PROXY_NODE_TYPE: PROXY_NODE_TYPE,
    SHUNT_DNS_NODE_TYPE: SHUNT_DNS_NODE_TYPE,
    RULE_SECTION_TYPE: RULE_SECTION_TYPE,

    getFilePath: getFilePath,
    getServiceStatus: getServiceStatus,
    renameSection: renameSection,
    validateNameFormat: validateNameFormat,
    validateProxyPortConflict: validateProxyPortConflict,
    generateUniqueSectionId: generateUniqueSectionId,
    setAnonymousGridSectionMembers: setAnonymousGridSectionMembers,
    setGridSectionMembers: setGridSectionMembers,
    setEditorOptionMembers: setEditorOptionMembers,
    simpleHash: simpleHash
});