import { LuciFlied } from "../../../enum/hijpass";
import form from "form";
import poll from "poll";
import rpc from "rpc";
import uci from "uci";

const callServiceList = rpc.declare({
    object: 'service',
    method: 'list',
    params: ['name'],
    expect: { '': {} }
})

const statusRefreshers: Record<string, () => Promise<void>> = {};

function getStatusKey(type?: string) {
    return type || 'all';
}

function getStatusElementId(type?: string) {
    return 'service_status_' + getStatusKey(type);
}

const ServiceUtils = {
    getServiceInstances: async function (confName: string): Promise<any> {
        const res = await callServiceList(confName);
        return res?.[confName]?.['instances'] ?? {};
    },

    getServiceInfo: async function () {
        const hijpass = await callServiceList(LuciFlied.CONF_NAME);
        const hijserver = await callServiceList(LuciFlied.SERVER_CONF_NAME);
        let serverInstances = hijserver?.[LuciFlied.SERVER_CONF_NAME]?.['instances'] ?? {};
        let instances = hijpass?.[LuciFlied.CONF_NAME]?.['instances'] ?? {};
        return {
            proxyInfos: ServiceUtils.getInstanceName(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE).map(
                (name) => {
                    return instances?.[name] ?? undefined;
                }
            ).filter(instance => instance),
            shuntInfo: instances?.[ServiceUtils.getInstanceName(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE)[0]] ?? undefined,
            dnsInfo: instances?.[ServiceUtils.getInstanceName(LuciFlied.CONF_NAME, LuciFlied.DNS_SECTION_TYPE)[0]] ?? undefined,
            serverInfos: ServiceUtils.getInstanceName(LuciFlied.SERVER_CONF_NAME, LuciFlied.SERVER_NODE_TYPE).map(
                (name) => {
                    return serverInstances?.[name] ?? undefined;
                }
            ).filter(instance => instance),
        }
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

    renderServiceStatusText: function (res: any, type?: string) {
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

    refreshServiceStatus: function (type?: string) {
        const key = getStatusKey(type);
        if (!statusRefreshers[key]) {
            const elementId = getStatusElementId(type);
            statusRefreshers[key] = async function () {
                const res = await L.resolveDefault(ServiceUtils.getServiceInfo());
                let view = document.getElementById(elementId);
                if (view) view.innerHTML = ServiceUtils.renderServiceStatusText(res, type);
            }
        }
        return statusRefreshers[key];
    },

    renderServiceStatus: function (type?: string) {
        return function () {
            const refresh = ServiceUtils.refreshServiceStatus(type);
            poll.add(refresh);
            window.setTimeout(refresh, 0);

            return E('div', { class: 'cbi-map' },
                E('fieldset', { class: 'cbi-section' }, [
                    E('p', { id: getStatusElementId(type), style: 'display: flex; gap: 1rem;' },
                        _('正在获取状态...'))
                ])
            );
        }
    },

    createStatusSection: function (m: LuCI.form.Map, type?: string) {
        let s = m.section(form.TypedSection);
        s.anonymous = true;
        s.render = ServiceUtils.renderServiceStatus(type);
        return s;
    },
}

export { ServiceUtils }
