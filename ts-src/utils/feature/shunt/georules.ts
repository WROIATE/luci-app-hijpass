import uci from 'uci';
import { LuciFlied } from '../../../enum/hijpass';
import { ShuntUtils } from './section';

// Preserve the UCI metadata consumed by the existing geoview.sh conversion flow.
function updateGeoRules() {
    const type = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'type');
    if ((type !== 'sing-box' && type !== 'singbox')
        || uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'enabled') === '0'
        || uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'ruleset_convert') !== '1') return;
    const sites = new Set<string>();
    const ips = new Set<string>();
    for (const rule of ShuntUtils.getRouteSection().rules) {
        if (rule.enabled !== '1') continue;
        const parsed = ShuntUtils.parseRuleList(rule);
        for (const geo of parsed.geoSite) sites.add(geo.replace('geosite:', ''));
        for (const geo of parsed.geoIp) ips.add(geo.replace('geoip:', ''));
    }
    for (const [key, values] of [['geosite_ruleset', [...sites]], ['geoip_ruleset', [...ips]]] as const) {
        const previous = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, key) ?? [];
        if (JSON.stringify(previous) !== JSON.stringify(values)) {
            uci.set_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, key, values.length ? values : undefined);
        }
    }
}

const GeoRuleUtils = { updateGeoRules };
export { GeoRuleUtils };
