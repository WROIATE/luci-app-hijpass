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
            uci.load(hj.HijpassEnum.CONF_NAME)
        ]);
    },

    render: function () {
        var m, s, o;

        m = new form.Map(hj.HijpassEnum.CONF_NAME, _('HiJpass'));

        s = m.section(form.TypedSection);
        s.anonymous = true;
        s.render = hj.Luci.renderServiceStatus;

        s = m.section(form.TypedSection, hj.HijpassEnum.GLOBAL_SECTION_TYPE);
        s.anonymous = true;
        s.addremove = false;

        o = s.option(form.Flag, 'enabled', _('启用'),
            _('启用或禁用 HiJpass'));
        o.default = '0';
        o.rmempty = false;

        o = s.option(form.Value, 'delay_time', _('延迟时间'),
            _('服务启动前的延迟时间（秒）'));
        o.datatype = 'uinteger';
        o.default = '60'
        o.rmempty = false;

        o = s.option(form.ListValue, 'log_level', _('日志等级'),
            _('服务日志等级'));
        o.modalonly = true;
        o.value('DEBUG', _('调试'));
        o.value('INFO', _('信息'));
        o.value('WARN', _('警告'));
        o.value('ERROR', _('错误'));
        o.default = 'INFO';
        o.rmempty = false;

        // 添加操作按钮区域
        o = s.option(form.Button, '_actions');
        o.render = function () {
            return createActionButtons();
        };

        return m.render();
    }
});
// 创建操作按钮
function createActionButtons() {
    requestAnimationFrame(function () {
        setupActionListeners();
    });

    return E('div', { 'class': 'cbi-value', 'style': 'margin-bottom: 2rem;' }, [
        E('label', { 'class': 'cbi-value-title' }, _('服务控制')),
        E('div', { 'class': 'cbi-value-field' }, [
            E('button', {
                'class': 'cbi-button cbi-button-action',
                'id': 'restart-service',
                'style': 'margin-right: 10px;'
            }, _('重启服务')),
            E('button', {
                'class': 'cbi-button cbi-button-neutral',
                'id': 'reload-firewall',
                'style': 'margin-right: 10px;'
            }, _('刷新防火墙')),
            E('span', {
                'id': 'action-status',
                'style': 'margin-left: 10px; font-size: 12px; color: #666;'
            })
        ])
    ])
}

// 设置按钮事件监听器
function setupActionListeners() {
    // 重启服务按钮
    let restartBtn = document.getElementById('restart-service');
    if (restartBtn) {
        restartBtn.addEventListener('click', function () {
            restartService();
        });
    }

    // 刷新防火墙按钮
    let reloadBtn = document.getElementById('reload-firewall');
    if (reloadBtn) {
        reloadBtn.addEventListener('click', function () {
            reloadFirewall();
        });
    }
}

// 重启服务
function restartService() {
    updateActionStatus(_('正在重启服务...'));

    fs.exec('/etc/init.d/hijpass', ['restart']).then(function (result) {
        if (result.code === 0) {
            updateActionStatus(_('服务重启成功'));
            // 延迟刷新页面状态
            setTimeout(function () {
                location.reload();
            }, 2000);
        } else {
            updateActionStatus(_('服务重启失败: ') + (result.stderr || result.stdout));
        }
    }).catch(function (error) {
        updateActionStatus(_('服务重启失败: ') + error.message);
    });
}

// 刷新防火墙
function reloadFirewall() {
    updateActionStatus(_('正在刷新防火墙...'));

    fs.exec('/usr/lib/hijpass/nft.sh', ['reset']).then(function (result) {
        if (result.code === 0) {
            updateActionStatus(_('防火墙刷新成功'));
        } else {
            updateActionStatus(_('防火墙刷新失败: ') + (result.stderr || result.stdout));
        }
    }).catch(function (error) {
        updateActionStatus(_('防火墙刷新失败: ') + error.message);
    });
}

// 更新操作状态
function updateActionStatus(message) {
    let statusElement = document.getElementById('action-status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.style.color = message.includes('成功') ? '#4caf50' :
            message.includes('失败') ? '#f44336' : '#666';
    }
}