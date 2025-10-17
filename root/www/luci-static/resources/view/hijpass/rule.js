'use strict';
'require view';
'require form';
'require ui';
'require fs';
'require uci';
'require view.hijpass.hijpass as hj';

return view.extend({
    load: function () {
        return Promise.all([
            uci.load(hj.CONF_NAME)
        ]);
    },

    render: function () {
        var m, s, o;

        m = new form.Map(hj.CONF_NAME, _('规则配置'), _('路由相关文件规则配置'));

        s = m.section(form.TypedSection, hj.RULE_SECTION_TYPE);
        s.anonymous = true;
        s.addremove = false;


        // 下载所有文件按钮
        o = s.option(form.Button, '_download_all', _('更新所有规则'),
            _('立即下载更新所有规则文件和数据库文件'));
        o.inputtitle = _('更新');
        o.render = function () {
            return createUpdateButtons();
        }

        // CHN List 下载地址列表
        o = s.option(form.DynamicList, 'chn_domain_list', _('CHN Domain List 下载地址'),
            _('配置中国域名列表的下载地址'));
        o.default = 'https://fastly.jsdelivr.net/gh/felixonmars/dnsmasq-china-list/accelerated-domains.china.conf';
        o.rmempty = true;

        // CHN Route IPv4 下载地址列表
        o = s.option(form.DynamicList, 'chn_v4_route', _('CHN IPv4 Route 下载地址'),
            _('配置中国IPv4路由的下载地址'));
        o.default = 'https://fastly.jsdelivr.net/gh/gaoyifan/china-operator-ip@ip-lists/china.txt';
        o.rmempty = true;

        // CHN Route IPv6 下载地址列表
        o = s.option(form.DynamicList, 'chn_v6_route', _('CHN IPv6 Route 下载地址'),
            _('配置中国IPv6路由的下载地址'));
        o.default = 'https://fastly.jsdelivr.net/gh/gaoyifan/china-operator-ip@ip-lists/china6.txt';
        o.rmempty = true;

        // GFW List 下载地址列表
        o = s.option(form.Value, 'gfw_list', _('GFW List 下载地址'),
            _('配置GFW域名列表的下载地址'));
        o.default = 'https://fastly.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/gfw.txt';
        o.rmempty = true;

        // GeoSite 下载地址
        o = s.option(form.Value, 'geosite', _('GeoSite 下载地址'),
            _('配置 GeoSite 数据库文件的下载地址'));
        o.default = 'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat';
        o.rmempty = true;

        // GeoIP 下载地址
        o = s.option(form.Value, 'geoip', _('GeoIP 下载地址'),
            _('配置 GeoIP 数据库文件的下载地址'));
        o.default = 'https://github.com/Loyalsoldier/geoip/releases/latest/download/geoip.dat';
        o.rmempty = true;

        // 自动更新时间
        o = s.option(form.ListValue, 'update_schedule', _('自动更新时间'),
            _('设置规则文件的自动更新时间'));
        o.value('', _('禁用自动更新'));
        o.value('0 5 * * *', _('每天凌晨5点'));
        o.value('0 5 * * 0', _('每周日凌晨5点'));
        o.value('0 5 1 * *', _('每月1日凌晨5点'));
        o.value('0 5 * * 1', _('每周一凌晨5点'));
        o.value('0 5 * * *', _('每天午夜12点'));
        o.default = '0 5 * * 1';
        o.rmempty = true;

        o = s.option(form.Value, 'download_timeout', _('下载超时时间'),
            _('下载失败时的重试次数'));
        o.datatype = 'uinteger';
        o.default = '3';
        o.rmempty = false;

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
    let view = E('div', { 'class': 'cbi-section' }, [
        E('div', { 'class': 'cbi-section-node' }, [
            E('div', { 'class': 'cbi-value' }, [
                E('label', { 'class': 'cbi-value-title' }, _('规则更新')),
                E('div', { 'class': 'cbi-value-field' }, [
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
function updateUpdateStatus(message) {
    let statusElement = document.getElementById('update-status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.style.color = message.includes('成功') ? '#4caf50' :
            message.includes('失败') ? '#f44336' : '#666';
    }
}