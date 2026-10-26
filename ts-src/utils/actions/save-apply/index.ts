import { LuciFlied } from "../../../enum/hijpass";
import uci from "uci";
import ui from "ui";
import { NodeFileCleanupUtils } from "./node-file-cleanup";
import { NotificationUtils } from "../../base/luci/notification";
import { Backend } from "../../backend";
import { FormUtils } from "../../base/luci/form";
import { PrecheckUtils } from "./precheck";

function isGlobalServiceDisabled() {
    return uci.get_first(LuciFlied.CONF_NAME, LuciFlied.GLOBAL_SECTION_TYPE, 'enabled') === '0';
}

const SaveApplyUtils = {
    genHandleSaveApply: function () {
        return async function (ev: Event, mode?: string | number) {
            try {
                await this.handleSave(ev)

                if (isGlobalServiceDisabled()) {
                    await uci.save();
                    await ui.changes.apply(mode == '0');
                    return;
                }

                if (!await PrecheckUtils.runSaveApplyPrechecks()) {
                    return;
                }

                const written = await Backend.writeConfigs(JSON.stringify(uci.sections(LuciFlied.CONF_NAME, undefined)));
                if (written.shunt !== undefined) uci.set_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE,
                    'shunt_hash', String(FormUtils.simpleHash(written.shunt)));

                await uci.save();
                let changes = await uci.changes()
                await NodeFileCleanupUtils.cleanupChangedNodeFiles(changes)

                await ui.changes.apply(mode == '0');
            } catch (e) {
                console.log(e)
                NotificationUtils.error(_('Configuration Apply Failed'), _(e.message), 5000);
            }
        }
    },
}

export { SaveApplyUtils }
