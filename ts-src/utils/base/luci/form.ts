import { LuciFlied, ShuntTag } from "../../../enum/hijpass";
import { Backend, Editor } from "../../backend";
import form from "form";
import uci from "uci";

const FormUtils = {
    setAnonymousGridSectionMembers: function (section: any) {
        FormUtils.setGridSectionMembers(section);
        section.anonymous = true;
        section.sectiontitle = function (sectionId: any) {
            return uci.get(LuciFlied.CONF_NAME, sectionId, 'name')
                || uci.get(LuciFlied.CONF_NAME, sectionId, 'tag')
                || sectionId;
        };
    },

    setGridSectionMembers: function (section: any) {
        section.anonymous = false;
        section.addremove = true;
        section.sortable = true;
        section.nodescriptions = true;
        section.rowcolors = true;
    },

    setAnonymousSection: function (subsection: any) {
        subsection.anonymous = true;
        subsection.addremove = false;
    },

    simpleHash: function (str: string) {
        let hash = 0;
        str = str ? str : '';
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    },

    setEditorOptionMembers: function (o: LuCI.form.TextValue, editor: Editor, fieldName: string) {
        o.rows = 30;
        o.load = function (_) {
            return Backend.readEditor(editor).then(content => content.trim());
        };

        async function writeFile(sectionId: string, formvalue?: string) {
            let currentHash = String(FormUtils.simpleHash(formvalue))
            let oldHash = uci.get(LuciFlied.CONF_NAME, sectionId, fieldName)
            if (currentHash === oldHash) {
                return
            }
            await Backend.writeEditor(editor, formvalue || '');
            uci.set(LuciFlied.CONF_NAME, sectionId, fieldName, currentHash);
        }

        o.write = writeFile
        o.remove = writeFile
        o.monospace = true;

        return o;
    },

    setConfContentOptionMembers: function (
        o: LuCI.form.TextValue,
        confName: string,
    ) {
        o.monospace = true;
        o.rows = 20;

        o.load = async function (section_id: string) {
            return Backend.readEditor({ resource: confName === LuciFlied.SERVER_CONF_NAME ? 'server_config' : 'proxy_config', section: section_id });
        };
        o.write = async function (section_id: string, value: string) {
            const text = (value || '').trim().replace(/\r\n/g, '\n');
            const content = text ? text + '\n' : '';
            await Backend.writeEditor({ resource: confName === LuciFlied.SERVER_CONF_NAME ? 'server_config' : 'proxy_config',
                section: section_id, name: this.section.formvalue(section_id, 'name') || uci.get(confName, section_id, 'name') || section_id }, content);
            uci.set(confName, section_id, 'custom_conf_hash', String(FormUtils.simpleHash(content)));
        };
        o.remove = async function (section_id: string) {
            await Backend.writeEditor({ resource: confName === LuciFlied.SERVER_CONF_NAME ? 'server_config' : 'proxy_config',
                section: section_id, name: this.section.formvalue(section_id, 'name') || uci.get(confName, section_id, 'name') || section_id }, '');
            uci.set(confName, section_id, 'custom_conf_hash', '');
        };
    },

    createTextOption: function (s: LuCI.form.AbstractSection, tabName: string,
        fieldName: string, title: string, description: string, editor: Editor) {
        let o = s.taboption(tabName, form.TextValue, fieldName, title, description);
        FormUtils.setEditorOptionMembers(o, editor, fieldName);
        return o;
    },

    createLogFlagOption: function (s: LuCI.form.AbstractSection, conf_type: string, tab: string) {
        let o = tab ? s.taboption(tab, form.Flag, 'log_enabled', _('Record Logs'))
            : s.option(form.Flag, 'log_enabled', _('Record Logs'));
        o.modalonly = true;
        o.write = async function (section_id: string) {
            const name = this.section.formvalue(section_id, 'name') || uci.get(conf_type, section_id, 'name') || '';
            const settings = await Backend.logSettings(conf_type, section_id, name);
            uci.set(conf_type, section_id, 'log_path', settings.path);
        };
        o.remove = function (section_id: string) {
            uci.unset(conf_type, section_id, 'log_path');
        }
        o.load = function (section_id: string) {
            if (uci.get(conf_type, section_id, 'log_path')) {
                return '1'
            }
            return '0'
        }
        o.rmempty = true;
        return o;
    },

    appendEnabledNodeListenPorts: function (option: LuCI.form.ListValue) {
        uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, (section: any) => {
            if (section.listen_port && section.enabled === '1') {
                let displayName = _('Proxy node %s: %s').format(section.name, section.listen_port);
                option.value(section.listen_port, displayName);
            }
        });
    },

    loadProxyNodeOptions: function (option: LuCI.form.AbstractValue, includeSlb: boolean = true) {
        option.load = function (section_id: string) {
            delete this.keylist;
            delete this.vallist;

            this.value(ShuntTag.DIRECT_OUTBOUND_TAG, _('Direct'));
            if (includeSlb) {
                this.value(ShuntTag.BLOCK_OUTBOUND_TAG, _('Block'));
            }

            uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, function (section: any) {
                if (section.name && section.enabled === '1') {
                    let displayName = section.name;
                    if (section.socks_port) displayName += ' (' + section.socks_port + ')';
                    this.value(section.name, displayName);
                }
            }.bind(this));

            return form.ListValue.prototype.load.apply(this, [section_id]);
        };
    },

    getEnabledProxyNodeOptions: function (includeSpecial: boolean = true): { value: string, label: string }[] {
        const options: { value: string, label: string }[] = [];

        if (includeSpecial) {
            options.push({ value: ShuntTag.DIRECT_OUTBOUND_TAG, label: _('Direct') });
            options.push({ value: ShuntTag.BLOCK_OUTBOUND_TAG, label: _('Block') });
        }

        uci.sections(LuciFlied.CONF_NAME, LuciFlied.PROXY_NODE_TYPE, (section: any) => {
            if (section.name && section.enabled === '1') {
                let label = section.name;
                if (section.socks_port) label += ' (' + section.socks_port + ')';
                options.push({ value: section.name, label });
            }
        });

        return options;
    },
}

export { FormUtils }
