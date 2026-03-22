import view from "view";
import uci from "uci";
import form from "form";
import fs from "fs";
import {LuciFlied} from "../enum/hijpass";
import {LuciUtils} from "../utils/common";

const v = view.extend({
    load: function () {
        return Promise.all([
            uci.load(LuciFlied.CONF_NAME)
        ]);
    },

    handleSaveApply: LuciUtils.genHandleSaveApply(),

    render: function () {
        let m = new form.Map(LuciFlied.CONF_NAME, _('规则配置'), _('路由相关文件规则配置'));

        let s = m.section(form.TypedSection, LuciFlied.RULE_SECTION_TYPE);
        s.anonymous = true;
        s.addremove = false;

        s.tab("config", _("配置"))
        s.tab("query", _("查询"))

        // 下载所有文件按钮
        let downloadButton = s.taboption('config', form.Button, '_download_all', _('更新所有规则'),
            _('立即下载更新所有规则文件和数据库文件'));
        downloadButton.inputtitle = _('更新');
        downloadButton.render = function () {
            return createUpdateButtons();
        }

        // CHN List 下载地址列表
        let chnDomainList = s.taboption('config', form.DynamicList, 'chn_domain_list', _('CHN Domain List 下载地址'),
            _('配置中国域名列表的下载地址'));
        chnDomainList.default = 'https://fastly.jsdelivr.net/gh/felixonmars/dnsmasq-china-list/accelerated-domains.china.conf';
        chnDomainList.rmempty = true;

        // CHN Route IPv4 下载地址列表
        let chnV4Route = s.taboption('config', form.DynamicList, 'chn_v4_route', _('CHN IPv4 Route 下载地址'),
            _('配置中国IPv4路由的下载地址'));
        chnV4Route.default = 'https://fastly.jsdelivr.net/gh/gaoyifan/china-operator-ip@ip-lists/china.txt';
        chnV4Route.rmempty = true;

        // CHN Route IPv6 下载地址列表
        let chnV6Route = s.taboption('config', form.DynamicList, 'chn_v6_route', _('CHN IPv6 Route 下载地址'),
            _('配置中国IPv6路由的下载地址'));
        chnV6Route.default = 'https://fastly.jsdelivr.net/gh/gaoyifan/china-operator-ip@ip-lists/china6.txt';
        chnV6Route.rmempty = true;

        // GFW List 下载地址列表
        let gfwList = s.taboption('config', form.Value, 'gfw_list', _('GFW List 下载地址'),
            _('配置GFW域名列表的下载地址'));
        gfwList.default = 'https://fastly.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/gfw.txt';
        gfwList.rmempty = true;

        // Geo Site 下载地址
        let geosite = s.taboption('config', form.Value, 'geosite', _('Geo Site 下载地址'),
            _('配置 GeoSite 数据库文件的下载地址'));
        geosite.default = 'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat';
        geosite.rmempty = false;

        // Geo IP 下载地址
        let geoip = s.taboption('config', form.Value, 'geoip', _('Geo IP 下载地址'),
            _('配置 GeoIP 数据库文件的下载地址'));
        geoip.default = 'https://github.com/Loyalsoldier/geoip/releases/latest/download/geoip.dat';
        geoip.rmempty = false;

        // 自动更新时间
        let updateSchedule = s.taboption('config', form.ListValue, 'update_schedule', _('自动更新时间'),
            _('设置规则文件的自动更新时间'));
        updateSchedule.value('', _('禁用自动更新'));
        updateSchedule.value('0 5 * * *', _('每天凌晨5点'));
        updateSchedule.value('0 0 * * *', _('每天午夜12点'));
        updateSchedule.value('0 5 * * 0', _('每周日凌晨5点'));
        updateSchedule.value('0 5 * * 1', _('每周一凌晨5点'));
        updateSchedule.value('0 5 1 * *', _('每月1日凌晨5点'));
        updateSchedule.default = '0 5 * * 1';
        updateSchedule.rmempty = true;

        let downloadTimeout = s.taboption('config', form.Value, 'download_timeout', _('下载超时时间'),
            _('单次下载的超时时间（秒）'));
        downloadTimeout.datatype = 'uinteger';
        downloadTimeout.default = '3';
        downloadTimeout.rmempty = false;

        // 查询标签页
        let queryTab = s.taboption('query', form.DummyValue, '_query_tab');
        queryTab.render = function () {
            return createQueryPanel();
        };

        return m.render();
    }
});

// 下载规则文件函数
function updateRuleFile() {
    updateUpdateStatus('正在更新规则...');
    fs.exec('/usr/lib/hijpass/rules.sh', ['update'])
        .then(function (result) {
            if (result.code === 0) {
                updateUpdateStatus('规则文件更新成功！');
            } else {
                updateUpdateStatus('规则文件更新失败: ' + (result.stderr || result.stdout));
            }
        })
        .catch(function (error) {
            updateUpdateStatus('更新过程中发生错误：' + error.message);
        });
}

function createUpdateButtons() {
    let view = E('div', {'class': 'cbi-section'}, [
        E('div', {'class': 'cbi-section-node'}, [
            E('div', {'class': 'cbi-value'}, [
                E('label', {'class': 'cbi-value-title'}, _('规则更新')),
                E('div', {'class': 'cbi-value-field'}, [
                    E('button', {
                        'class': 'cbi-button cbi-button-neutral',
                        'id': 'update-rule',
                        'style': 'margin-right: 10px;'
                    }, _('更新规则文件')),
                    E('span', {
                        'id': 'update-status',
                        'style': 'margin-left: 10px; font-size: 12px; color: #666;'
                    })
                ])
            ])
        ])
    ]);
    requestAnimationFrame(function () {
        setupUpdateListeners();
    });
    return view
}

// 设置按钮事件监听器
function setupUpdateListeners() {
    let reloadBtn = document.getElementById('update-rule');
    if (reloadBtn) {
        reloadBtn.addEventListener('click', function () {
            updateRuleFile();
        });
    }
}

// 更新操作状态
function updateUpdateStatus(message: string) {
    let statusElement = document.getElementById('update-status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.style.color = message.includes('成功') ? '#4caf50' :
            message.includes('失败') ? '#f44336' : '#666';
    }
}

// 创建查询面板
function createQueryPanel() {
    let view = E('div', {'class': 'cbi-section'}, [
        E('div', {'class': 'cbi-section-node'}, [
            // 查询类型选择
            E('div', {'class': 'cbi-value', 'style': 'margin-bottom: 20px;'}, [
                E('label', {'class': 'cbi-value-title'}, _('查询类型')),
                E('div', {'class': 'cbi-value-field'}, [
                    E('select', {
                        'id': 'query-type',
                        'class': 'cbi-input-select',
                        'style': 'width: 200px; margin-right: 10px;'
                    }, [
                        E('option', {'value': 'domain'}, _('域名查询')),
                        E('option', {'value': 'geosite'}, _('GeoSite')),
                        E('option', {'value': 'shunt'}, _('分流查询')),
                    ])
                ])
            ]),
            // 查询输入区域
            E('div', {'class': 'cbi-value', 'style': 'margin-bottom: 20px;'}, [
                E('label', {'class': 'cbi-value-title'}, _('查询关键词')),
                E('div', {'class': 'cbi-value-field'}, [
                    E('input', {
                        'type': 'text',
                        'id': 'query-keyword',
                        'class': 'cbi-input-text',
                        'placeholder': _('输入域名或GeoSite标签'),
                        'style': 'margin-right: 10px;'
                    }),
                    E('button', {
                        'class': 'cbi-button cbi-button-action',
                        'id': 'query-btn',
                        'style': 'margin-right: 10px;'
                    }, _('查询')),
                    E('span', {
                        'id': 'query-status',
                        'style': 'margin-left: 10px; font-size: 12px; color: #666;'
                    })
                ])
            ]),

            // 输出区域
            E('div', {'class': 'cbi-value'}, [
                E('label', {'class': 'cbi-value-title', 'style': 'visibility: hidden'}, _('查询结果')),
                E('div', {'class': 'cbi-value-field'}, [
                    E('textarea', {
                        'id': 'query-output',
                        'class': 'cbi-input-textarea',
                        'readonly': 'readonly',
                        'style': 'width: 100%; height: 300px;'
                    })
                ])
            ])
        ])
    ]);

    requestAnimationFrame(function () {
        setupQueryListeners();
    });

    return view;
}

// 设置查询事件监听器
function setupQueryListeners() {
    let queryBtn = document.getElementById('query-btn');
    let keywordInput = document.getElementById('query-keyword');

    if (queryBtn) {
        queryBtn.addEventListener('click', function () {
            performQuery();
        });
    }

    // 支持回车键查询
    if (keywordInput) {
        keywordInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                performQuery();
            }
        });
    }
}

// 执行查询
function performQuery() {
    let keyword = (document.getElementById('query-keyword') as HTMLInputElement).value.trim();
    let queryType = (document.getElementById('query-type') as HTMLSelectElement).value;
    let statusElement = document.getElementById('query-status');
    let outputElement = document.getElementById('query-output');

    if (!keyword) {
        if (statusElement) {
            statusElement.textContent = _('请输入查询关键字');
            statusElement.style.color = '#f44336';
        }
        return;
    }

    if (statusElement) {
        statusElement.textContent = _('正在查询...');
        statusElement.style.color = '#666';
    }

    // 根据查询类型调用不同的查询函数
    switch (queryType) {
        case 'domain':
            queryDomain(keyword, outputElement, statusElement);
            break;
        case 'geosite':
            queryGeoTag(keyword, 'geosite', outputElement, statusElement);
            break;
        case 'shunt':
            queryShunt(keyword, outputElement, statusElement);
            break;
        default:
            if (statusElement) {
                statusElement.textContent = _('未知的查询类型');
                statusElement.style.color = '#f44336';
            }
    }
}

// 查询域名
function queryDomain(keyword: string, outputElement, statusElement) {
    clearQuery()
    fs.exec('/usr/lib/hijpass/geoview.sh', ['-l', 'geosite', keyword])
        .then(setOutput(outputElement, statusElement, '# geosite\n'))
        .catch(setError(statusElement))
    fs.exec('/usr/lib/hijpass/rules.sh', ['query', keyword])
        .then(setOutput(outputElement, statusElement, '# 本地规则文件\n'))
        .catch(setError(statusElement));
}

function queryShunt(keyword: string, outputElement, statusElement) {
    clearQuery()
    fs.exec('/usr/lib/hijpass/route-match.sh', [keyword])
        .then(setOutput(outputElement, statusElement, '# 分流规则\n'))
        .catch(setError(statusElement))
}

// 查询 GEO Tag
function queryGeoTag(keyword, geoType, outputElement, statusElement) {
    clearQuery()
    // 使用 strings 命令提取二进制文件中的可读字符串
    fs.exec_direct('/usr/lib/hijpass/geoview.sh', ['-e', geoType, keyword])
        .then(function (result) {
            if (result) {
                if (outputElement) {
                    if (outputElement.value) {
                        outputElement.value += '\n';
                    }
                    outputElement.value += '# ' + geoType + '\n';
                    outputElement.value += result;
                }
                if (statusElement) {
                    statusElement.textContent = _('查询完成');
                    statusElement.style.color = '#4caf50';
                }
            } else {
                throw new Error(result.stderr || '查询失败');
            }
        })
        .catch(setError(statusElement));
}

// 清空查询
function clearQuery() {
    (document.getElementById('query-output') as HTMLTextAreaElement).value = '';
}

function setOutput(outputElement: HTMLTextAreaElement, statusElement, comment: string) {
    return function (result: any) {
        if (result.code === 0) {
            if (outputElement && result.stdout) {
                if (outputElement.value) {
                    outputElement.value += '\n';
                }
                outputElement.value += comment;
                outputElement.value += result.stdout;
            }
            if (statusElement) {
                statusElement.textContent = _('查询完成');
                statusElement.style.color = '#4caf50';
            }
        } else {
            throw new Error(result.stderr || '查询失败');
        }
    }
}

function setError(statusElement) {
    return function (error) {
        console.log(error)
        statusElement.textContent = _('查询失败');
        statusElement.style.color = '#f44336';
    }
}

export default v;