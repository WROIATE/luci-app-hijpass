import view from "view";

import {LuciFlied} from "../enum/hijpass";
import form from "form";
import uci from "uci";
import { LogPanelUtils } from "../utils/feature/log/panel";

const v = view.extend({
    load: function () {
        return Promise.all([
            uci.load(LuciFlied.CONF_NAME),
            uci.load(LuciFlied.SERVER_CONF_NAME)
        ]);
    },
    handleSaveApply: null,
    handleReset: null,
    handleSave: null,
    render: function () {

        let m = new form.Map(LuciFlied.CONF_NAME, _('View Logs'),
            _('View and Manage Logs'));

        let s = m.section(form.TypedSection, 'logs_display');
        s.anonymous = true;
        s.addremove = false;
        s.render = function () {
            return LogPanelUtils.createLogControlPanel();
        };

        return m.render();
    }
});

export default v;
