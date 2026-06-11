import { LuciFlied } from "../../../enum/hijpass";
import uci from "uci";

function normalizeFileContent(value?: string) {
    const content = (value || '').trim().replace(/\r\n/g, '\n');
    return content ? content + '\n' : '';
}

function getFilePath(option: any, confName: string = LuciFlied.CONF_NAME) {
    let path = uci.get_first(confName, confName, option)
    if (path) {
        return path
    }
    console.log(option + ' path is empty')
    return ''
}

function getNodeConfigFilePath(confName: string, dirPath: string, sectionId: string, optionContext?: any) {
    if (!dirPath) {
        throw new Error(_('配置文件目录为空'));
    }

    const formName = optionContext?.section?.formvalue?.(sectionId, 'name');
    const name = formName || uci.get(confName, sectionId, 'name') || sectionId;
    return dirPath + '/' + name + '-' + sectionId + '.json';
}

function getProxyConfigFilePath(section: any) {
    const name = section.name || section['.name'];
    return getFilePath('client_dir') + '/' + name + '-' + section['.name'] + '.json';
}

function getServerConfigFilePath(section: any) {
    const name = section.name || section['.name'];
    return getFilePath('server_dir', LuciFlied.SERVER_CONF_NAME) + '/' + name + '-' + section['.name'] + '.json';
}

const FilePathUtils = {
    normalizeFileContent,
    getFilePath,
    getNodeConfigFilePath,
    getProxyConfigFilePath,
    getServerConfigFilePath,
}

export { FilePathUtils }
