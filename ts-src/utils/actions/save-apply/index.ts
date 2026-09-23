import { LuciFlied } from "../../../enum/hijpass";
import uci from "uci";
import ui from "ui";
import { NodeFileCleanupUtils } from "./node-file-cleanup";
import { NotificationUtils } from "../../base/luci/notification";
import { GeneratedConfigUtils } from "../../feature/config/backend";
import { ConfigFileUtils } from "../../feature/config/files";
import { GeoRuleUtils } from "../../feature/shunt/georules";
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

                const generated = await GeneratedConfigUtils.render();
                await ConfigFileUtils.writeGeneratedConfigs(generated);
                GeoRuleUtils.updateGeoRules();

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
