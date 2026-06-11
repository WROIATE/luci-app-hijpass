import { LuciFlied, ShuntTag } from "../../../enum/hijpass";
import uci from "uci";
import { CoreAdapterFactory } from "../../../core/adapter";
import { JsonUtils } from "../../base/files/json";

function checkLoadBalanceUsage() {
    const lbNodeList = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'lb_node_list');
    const lbEmpty = !lbNodeList || (Array.isArray(lbNodeList) && lbNodeList.filter((v: string) => v).length === 0);

    if (!lbEmpty) {
        return;
    }

    let inUse = false;
    uci.sections(LuciFlied.CONF_NAME, LuciFlied.SHUNT_ROUTE_RULE_TYPE, function (section: any) {
        if (section.proxy_node === ShuntTag.LOAD_BALANCE_OUTBOUND_TAG) inUse = true;
    });

    if (!inUse) {
        const defaultNode = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'default_proxy_node');
        if (defaultNode === ShuntTag.LOAD_BALANCE_OUTBOUND_TAG) inUse = true;
    }

    if (inUse) {
        throw new Error(_('负载均衡节点列表为空，但仍有规则使用负载均衡出口，请先移除相关规则或添加节点'));
    }
}

const ShuntConfigUtils = {
    getShuntConfData: function () {
        const shuntEnabled = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'enabled');
        if (shuntEnabled === '0') {
            return "";
        }

        const configType = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'config_type');
        if (configType !== 'tmpl') {
            return "";
        }

        checkLoadBalanceUsage();

        let type = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'type');
        return JSON.stringify(CoreAdapterFactory.getCoreAdapter(type).genShuntConf(), JsonUtils.omitEmptyReplacer, 2);
    },
}

export { ShuntConfigUtils }
