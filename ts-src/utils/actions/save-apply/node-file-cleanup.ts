import { LuciFlied } from "../../../enum/hijpass";
import { Backend } from "../../backend";
import uci from "uci";

async function cleanupChangedNodeFiles(changes: any) {
    async function cleanup(kind: string, section: string, name: string = '') {
        const result = await Backend.cleanupNode(kind, section, name);
        if (result.code !== 0) throw new Error(result.stderr || _('Configuration cleanup failed'));
    }

    if (changes?.hijpass) {
        for (let change of changes.hijpass) {
            if (change.length === 2 && change[0] === 'remove') {
                await cleanup('proxy', change[1]);
            }
            if (change.length === 4 && change[0] === 'set' && change[2] === 'name') {
                const section = uci.get(LuciFlied.CONF_NAME, change[1]);
                const name = section?.name || section?.['.name'] || '';
                await cleanup('proxy', change[1], name);
            }
        }
    }

    if (changes?.hijserver) {
        for (let change of changes.hijserver) {
            if (change.length === 2 && change[0] === 'remove') {
                await cleanup('server', change[1]);
            }
            if (change.length === 4 && change[0] === 'set' && change[2] === 'name') {
                const section = uci.get(LuciFlied.SERVER_CONF_NAME, change[1]);
                const name = section?.name || section?.['.name'] || '';
                await cleanup('server', change[1], name);
            }
        }
    }
}

const NodeFileCleanupUtils = {
    cleanupChangedNodeFiles,
}

export { NodeFileCleanupUtils }
