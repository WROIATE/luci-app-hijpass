'use strict';
'require rpc';
'require baseclass';

const CONF_PATH = '/etc/hijpass'

const callServiceList = rpc.declare({
    object: 'service',
    method: 'list',
    params: ['name'],
    expect: { '': {} }
});

function isRunning() {
    return L.resolveDefault(callServiceList('hijpass'), {}).then(function (res) {
        var isRunning = false;
        try {
            if (res && res['hijpass'] && res['hijpass']['instances'] && res['hijpass']['instances']['hijpass-proxy']) {
                isRunning = res['hijpass']['instances']['hijpass-proxy']['running'];
            }
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
return baseclass.extend({
    getServiceStatus: getServiceStatus,
    CONF_PATH: CONF_PATH
});