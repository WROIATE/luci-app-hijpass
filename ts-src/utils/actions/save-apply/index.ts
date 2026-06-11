import { LuciFlied } from "../../../enum/hijpass";
import fs from "fs";
import uci from "uci";
import ui from "ui";
import { SingBoxUtils } from "../../../core/singbox/builder";
import { FactoryType } from "../../../core/adapter";
import { NodeFileCleanupUtils } from "./node-file-cleanup";
import { FilePathUtils } from "../../base/files/paths";
import { ShuntConfigUtils } from "../../feature/shunt/config-file";
import { NotificationUtils } from "../../base/luci/notification";
import { ProxyConfigFileUtils } from "../../feature/proxy/config-file";
import { FormUtils } from "../../base/luci/form";
import { PrecheckUtils } from "./precheck";

const SaveApplyUtils = {
    genHandleSaveApply: function () {
        return async function (ev: Event) {
            try {
                await this.handleSave(ev)

                if (!PrecheckUtils.runSaveApplyPrechecks()) {
                    return;
                }

                // 生成分流配置并写入文件
                const shuntCoreType = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'type')
                if (shuntCoreType === FactoryType.SING_BOX
                    && uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'ruleset_convert') === '1') {
                    SingBoxUtils.writeGeoRule()
                }
                const shuntConfigType = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'config_type')
                if (shuntConfigType === 'tmpl') {
                    let data = ShuntConfigUtils.getShuntConfData()
                    await fs.write(FilePathUtils.getFilePath('shunt_conf'), data);
                    uci.set_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE,
                        'shunt_hash', data ? String(FormUtils.simpleHash(data)) : '-1');
                }

                let changes = await uci.changes()
                await NodeFileCleanupUtils.cleanupChangedNodeFiles(changes)

                // 生成各代理节点客户端配置文件
                await ProxyConfigFileUtils.writeGeneratedProxyConfigs();

                await ui.changes.apply(true);
            } catch (e) {
                console.log(e)
                NotificationUtils.error("配置应用失败", _(e.message), 5000);
            }
        }
    },
}

export { SaveApplyUtils }
