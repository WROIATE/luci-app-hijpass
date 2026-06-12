import fs from "fs";
import form from "form";
import uci from "uci";
import ui from "ui";
import { LuciFlied } from "../../../enum/hijpass";
import { FilePathUtils } from "../../base/files/paths";
import { FormUtils } from "../../base/luci/form";
import { NotificationUtils } from "../../base/luci/notification";
import { ShuntConfigUtils } from "./config-file";

function setCoreVersion(versionEl: HTMLElement, core: string) {
    fs.exec_direct('/usr/lib/hijpass/core-update.sh', ['version', core], 'json')
        .then((res: any) => {
            versionEl.textContent = (res && res.version) ? res.version : _('Unknown');
        })
        .catch(() => {
            versionEl.textContent = _('Unknown');
        });
}

function updateCore(core: string, title: string, versionEl: HTMLElement, btn: HTMLButtonElement) {
    btn.disabled = true;
    btn.textContent = _('Updating...');
    fs.exec_direct('/usr/lib/hijpass/core-update.sh', ['update', core], 'json')
        .then((res: any) => {
            if (res && res.success) {
                versionEl.textContent = res.version || _('Updated');
                NotificationUtils.success(title, _('Updated to %s').format(res.version), 4000);
            } else {
                NotificationUtils.error(title, _('Update failed: %s').format((res && res.error) || 'unknown'), 5000);
            }
        })
        .catch((e: any) => {
            NotificationUtils.error(title, _(e.message || 'Update failed'), 5000);
        })
        .finally(() => {
            btn.disabled = false;
            btn.textContent = _('Update');
        });
}

function makeSelect(id: string, options: { value: string, label: string }[]) {
    const sel = E('select', {id, class: 'cbi-input-select', style: 'width:100%'}) as HTMLSelectElement;
    options.forEach(({value, label}) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        sel.appendChild(opt);
    });
    return sel;
}

const ShuntFormUtils = {
    renderCoreVersionWidget: function (core: string, title: string) {
        const versionEl = E('span', {style: 'margin-right:12px;color:#666'}, _('Loading...')) as HTMLElement;
        const updateBtn = E('button', {
            class: 'btn cbi-button',
            style: 'background-color:#1a6a8a;border-color:#1a6a8a',
            click: function (ev: MouseEvent) {
                updateCore(core, title, versionEl, ev.currentTarget as HTMLButtonElement);
            }
        }, _('Update'));

        setCoreVersion(versionEl, core);
        return E('div', {style: 'display:flex;align-items:center;gap:8px'}, [versionEl, updateBtn]);
    },

    configureConfigEditor: function (o: LuCI.form.TextValue) {
        o.rows = 30;
        o.monospace = true;
        o.load = async function (_: string) {
            return L.resolveDefault(fs.read(FilePathUtils.getFilePath('shunt_conf')), '');
        };
        o.write = async function (sectionId: string, value: string) {
            const content = (value || '').trim().replace(/\r\n/g, '\n');
            await fs.write(FilePathUtils.getFilePath('shunt_conf'), content ? content + '\n' : '');
            uci.set(LuciFlied.CONF_NAME, sectionId, 'shunt_hash', String(FormUtils.simpleHash(content)));
        };
        o.remove = async function (sectionId: string) {
            if (uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'config_type') !== 'tmpl') {
                await fs.write(FilePathUtils.getFilePath('shunt_conf'), '');
                uci.set(LuciFlied.CONF_NAME, sectionId, 'shunt_hash', '-1');
            }
        };
        o.rmempty = false;
    },

    showPreview: function () {
        try {
            let configJson = ShuntConfigUtils.getShuntConfData()
            let shuntType = uci.get_first(LuciFlied.CONF_NAME, LuciFlied.SHUNT_SECTION_TYPE, 'type') || 'xray'
            ui.showModal(_('Preview Configuration'), [
                E('div', {'class': 'cbi-section'}, [
                    E('div', {'class': 'cbi-section-descr'},
                        _('Generated %s JSON Configuration').format(shuntType)),
                    E('pre', {
                        'style': 'max-height: 500px; overflow: auto; padding: 10px; border-radius: 4px;',
                        'id': 'config-preview-content'
                    }, configJson)
                ]),
                E('div', {
                    'class': 'right',
                    'style': 'display: flex; justify-content: flex-end; align-items: center; gap: 10px;'
                }, [
                    E('button', {
                        'class': 'btn cbi-button',
                        'click': ui.hideModal
                    }, _('关闭')),
                    E('button', {
                        'class': 'btn cbi-button-action',
                        'click': function (ev) {
                            ev.preventDefault();
                            ev.stopPropagation();
                            let content = document.getElementById('config-preview-content').textContent;
                            navigator.clipboard.writeText(content).then(function () {
                                NotificationUtils.success("成功", "配置已复制到剪贴板", 3000);
                            })
                        }
                    }, _('Copy Configuration'))
                ])
            ]);
        } catch (err) {
            console.log(err);
            NotificationUtils.error("配置生成失败", _(err.message), 5000);
        }
    },

    showBulkReplaceModal: function () {
        const usedNodeValues = new Set<string>();
        uci.sections(LuciFlied.CONF_NAME, LuciFlied.SHUNT_ROUTE_RULE_TYPE, function (section: any) {
            if (section.proxy_node) usedNodeValues.add(section.proxy_node);
        });

        const allNodeOptions = FormUtils.getEnabledProxyNodeOptions(true);
        const fromNodeOptions = allNodeOptions.filter(o => usedNodeValues.has(o.value));

        const fromSel = makeSelect('replace-from', fromNodeOptions);
        const toSel = makeSelect('replace-to', allNodeOptions);

        ui.showModal(_('Bulk Replace Nodes'), [
            E('div', {class: 'cbi-section'}, [
                E('div', {style: 'display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:center'}, [
                    E('div', {}, [E('label', {}, _('From Node')), fromSel]),
                    E('div', {}, [E('label', {}, _('Replace With')), toSel]),
                ])
            ]),
            E('div', {class: 'right', style: 'display:flex;justify-content:flex-end;gap:10px'}, [
                E('button', {class: 'btn cbi-button', click: ui.hideModal}, _('Cancel')),
                E('button', {
                    class: 'btn cbi-button-action',
                    click: async function () {
                        const fromVal = fromSel.value;
                        const toVal = toSel.value;
                        if (fromVal === toVal) {
                            ui.hideModal();
                            return;
                        }
                        uci.sections(LuciFlied.CONF_NAME, LuciFlied.SHUNT_ROUTE_RULE_TYPE, function (section: any) {
                            if (section.proxy_node === fromVal) {
                                uci.set(LuciFlied.CONF_NAME, section['.name'], 'proxy_node', toVal);
                            }
                        });
                        await uci.save();
                        ui.hideModal();
                        location.reload();
                    }
                }, _('Confirm Replace'))
            ])
        ]);
    },

    loadProxyNodeOptions: function (option: LuCI.form.AbstractValue, includeSLB: boolean) {
        FormUtils.loadProxyNodeOptions(option, includeSLB);
    },

    loadDNSServerOptions: function (option: LuCI.form.AbstractValue, includeDefault: boolean) {
        option.load = function (section_id) {
            delete this.keylist;
            delete this.vallist;

            if (includeDefault) {
                this.value('', _('Use Global Default DNS'));
            }

            uci.sections(LuciFlied.CONF_NAME, LuciFlied.SHUNT_DNS_NODE_TYPE, function (section: any) {
                if (section.tag) {
                    let displayName = section.tag;
                    if (section.server) {
                        displayName += ' (' + section.server + ')';
                    }
                    this.value(section.tag, displayName);
                }
            }.bind(this));

            return form.ListValue.prototype.load.apply(this, [section_id]);
        };
    },

    createSectionContainer: function <T extends LuCI.form.AbstractSection>(
        s: LuCI.form.AbstractSection,
        tab: string,
        id: string,
        sectionType: T,
        sectionName: string,
        title: string
    ) {
        let o = s.taboption(tab, form.SectionValue, id, sectionType, sectionName, title);
        o.depends({config_type: "tmpl"});
        return o;
    },

    createRequiredListValue: function (
        section: LuCI.form.AbstractSection,
        name: string,
        title: string,
        description: string,
        validator?: Function
    ) {
        let o = section.option(form.ListValue, name, title, description);
        o.rmempty = false;
        if (validator) {
            o.validate = validator;
        }
        return o;
    },

    createValidatedDynamicList: function (
        section: LuCI.form.AbstractSection,
        name: string,
        title: string,
        description: string,
        sectionType: string,
        getItemName: (section: any) => any
    ) {
        let o = section.option(form.DynamicList, name, title, description);

        o.load = function (section_id: any) {
            delete this.keylist;
            delete this.vallist;

            uci.sections(LuciFlied.CONF_NAME, sectionType, function (section: any) {
                let itemName = getItemName(section);
                if (itemName) {
                    this.value(itemName.value, itemName.display);
                }
            }.bind(this));

            return form.DynamicList.prototype.load.apply(this, [section_id]);
        };

        o.validate = function (section_id: string, value: string) {
            if (!value || value === '') {
                return true;
            }

            let availableItems = [];
            uci.sections(LuciFlied.CONF_NAME, sectionType, function (section) {
                let itemName = getItemName(section);
                if (itemName) {
                    availableItems.push(itemName.value);
                }
            });

            if (availableItems.indexOf(value) === -1) {
                return _('Item Not Found').format(title, value);
            }

            return true;
        };

        return o;
    },
}

export { ShuntFormUtils }
