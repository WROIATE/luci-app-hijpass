import rpc from 'rpc';
import uci from 'uci';
import { LuciFlied } from '../../../enum/hijpass';

const renderConfig = rpc.declare({
    object: 'hijpass-config', method: 'render', params: ['sections', 'target'], expect: { '': {} },
});
const validateConfig = rpc.declare({
    object: 'hijpass-config', method: 'validate', params: ['sections'], expect: { '': {} },
});

function snapshot() {
    return JSON.stringify(uci.sections(LuciFlied.CONF_NAME, undefined));
}

async function preview(target: string) {
    const result = await renderConfig(snapshot(), target);
    if (result.error) throw new Error(result.error);
    return result.config;
}

const GeneratedConfigUtils = {
    preview,
    validate: async function () {
        const result = await validateConfig(snapshot());
        if (result.error) throw new Error(result.error);
        if (!result.ok) throw new Error(_('Configuration validation failed'));
    },
};

export { GeneratedConfigUtils };
