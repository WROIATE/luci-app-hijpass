import view from "view";
import uci from "uci";
import form from "form";
import {LuciFlied} from "../enum/hijpass";
import {SaveApplyUtils} from "../utils/actions/save-apply/index";
import { RulePanelUtils } from "../utils/feature/rule/panel";

const v = view.extend({
    load: function () {
        return Promise.all([
            uci.load(LuciFlied.CONF_NAME)
        ]);
    },

    handleSaveApply: SaveApplyUtils.genHandleSaveApply(),

    render: function () {
        let m = new form.Map(LuciFlied.CONF_NAME, _('Rule Configuration'), _('Route Rule Configuration'));

        let s = m.section(form.TypedSection, LuciFlied.RULE_SECTION_TYPE);
        s.anonymous = true;
        s.addremove = false;

        s.tab("config", _("配置"))
        s.tab("query", _("查询"))

        let downloadButton = s.taboption('config', form.Button, '_download_all', _('Update All Rules'),
            _('Download All Rules Now'));
        downloadButton.inputtitle = _('更新');
        downloadButton.render = function () {
            return RulePanelUtils.createUpdateButtons();
        }

        let chnDomainList = s.taboption('config', form.DynamicList, 'chn_domain_list', _('CHN Domain List Download URL'),
            _('CHN Domain List URL'));
        chnDomainList.default = 'https://fastly.jsdelivr.net/gh/felixonmars/dnsmasq-china-list/accelerated-domains.china.conf';
        chnDomainList.rmempty = true;

        let chnV4Route = s.taboption('config', form.DynamicList, 'chn_v4_route', _('CHN IPv4 Route Download URL'),
            _('CHN IPv4 Route URL'));
        chnV4Route.default = 'https://fastly.jsdelivr.net/gh/gaoyifan/china-operator-ip@ip-lists/china.txt';
        chnV4Route.rmempty = true;

        let chnV6Route = s.taboption('config', form.DynamicList, 'chn_v6_route', _('CHN IPv6 Route Download URL'),
            _('CHN IPv6 Route URL'));
        chnV6Route.default = 'https://fastly.jsdelivr.net/gh/gaoyifan/china-operator-ip@ip-lists/china6.txt';
        chnV6Route.rmempty = true;

        let gfwList = s.taboption('config', form.Value, 'gfw_list', _('GFW List Download URL'),
            _('GFW List URL'));
        gfwList.default = 'https://fastly.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/gfw.txt';
        gfwList.rmempty = true;

        let geosite = s.taboption('config', form.Value, 'geosite', _('GeoSite Database Download URL'),
            _('GeoSite Database URL'));
        geosite.default = 'https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat';
        geosite.rmempty = false;

        let geoip = s.taboption('config', form.Value, 'geoip', _('GeoIP Database Download URL'),
            _('GeoIP Database URL'));
        geoip.default = 'https://github.com/Loyalsoldier/geoip/releases/latest/download/geoip.dat';
        geoip.rmempty = false;

        let updateSchedule = s.taboption('config', form.ListValue, 'update_schedule', _('Auto Update Time'),
            _('Set Auto Update Time'));
        updateSchedule.value('', _('Disable Auto Update'));
        updateSchedule.value('0 5 * * *', _('Every Day 5 AM'));
        updateSchedule.value('0 0 * * *', _('Every Day Midnight'));
        updateSchedule.value('0 5 * * 0', _('Every Sunday 5 AM'));
        updateSchedule.value('0 5 * * 1', _('Every Monday 5 AM'));
        updateSchedule.value('0 5 1 * *', _('1st Day of Month 5 AM'));
        updateSchedule.default = '0 5 * * 1';
        updateSchedule.rmempty = true;

        let downloadTimeout = s.taboption('config', form.Value, 'download_timeout', _('Download Timeout'),
            _('Single Download Timeout'));
        downloadTimeout.datatype = 'uinteger';
        downloadTimeout.default = '3';
        downloadTimeout.rmempty = false;

        let queryTab = s.taboption('query', form.DummyValue, '_query_tab');
        queryTab.render = function () {
            return RulePanelUtils.createQueryPanel();
        };

        return m.render();
    }
});

export default v;
