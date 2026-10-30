import { LuciFlied } from "../../../enum/hijpass";
import uci from "uci";
import ui from "ui";
import { NotificationUtils } from "../../base/luci/notification";
import { Backend } from "../../backend";
import { PrecheckUtils } from "./precheck";

function isGlobalServiceDisabled() {
    return uci.get_first(LuciFlied.CONF_NAME, LuciFlied.GLOBAL_SECTION_TYPE, 'enabled') === '0';
}

const SaveApplyUtils = {
    watchApplyStatus: function () {
        let attempts = 0;
        const reported = new Set<string>();
        const refresh = async () => {
            try {
                const result = await Backend.serviceApplyStatus();
                for (const name of ['hijpass', 'hijserver']) {
                    const status = result[name];
                    if (status?.state === 'failed' && !reported.has(name + status.updated)) {
                        reported.add(name + status.updated);
                        const message = status.rollback === 'restored'
                            ? _('Configuration saved, but service apply failed. Previous runtime restored; see main log.')
                            : _('Configuration saved, but service apply failed. Check service status and main log.');
                        NotificationUtils.error(_('Configuration Apply Failed'), name + ': ' + message, 0);
                    }
                }
                if (Object.values(result).some(status => status?.state === 'applying') && ++attempts < 120)
                    window.setTimeout(refresh, 1000);
            } catch (e) { console.error(e); }
        };
        void refresh();
    },
    genHandleSaveApply: function () {
        return async function (ev: Event, mode?: string | number) {
            try {
                await this.handleSave(ev)

                if (isGlobalServiceDisabled()) {
                    await uci.save();
                    ui.changes.apply(mode == '0');
                    return;
                }

                if (!await PrecheckUtils.runSaveApplyPrechecks()) {
                    return;
                }

                await Backend.validateConfigs(JSON.stringify(uci.sections(LuciFlied.CONF_NAME, undefined)));
                await uci.save();

                ui.changes.apply(mode == '0');
            } catch (e) {
                console.log(e)
                NotificationUtils.error(_('Configuration Apply Failed'), _(e.message), 5000);
            }
        }
    },
}

export { SaveApplyUtils }
