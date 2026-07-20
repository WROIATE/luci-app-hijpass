import fs from "fs";
import form from "form";
import network from "network";

type AclContext = {
    hostHints: any,
    devices: any[],
}

function buildMacLabel(hostHints: any, mac: string) {
    let name = hostHints[mac]?.name;
    let ip = hostHints[mac]?.ipaddrs?.[0];
    let label = ((name ?? '') + ' ' + (ip ?? '')).trim();
    return mac + (label ? ' (' + label + ')' : '');
}

const FirewallFormUtils = {
    loadAclContext: async function (): Promise<AclContext> {
        let hostHints: any = {};
        let devices: any[] = [];
        await Promise.all([
            network.getHostHints().then((r: any) => { hostHints = r?.hosts ?? {}; }),
            network.getDevices().then((r: any) => { devices = r ?? []; }),
        ]);
        return {hostHints, devices};
    },

    appendHostHintOptions: function (option: LuCI.form.Value, hostHints: any) {
        Object.keys(hostHints).forEach((mac: any) => {
            option.value(mac, buildMacLabel(hostHints, mac));
        });
    },

    appendDeviceOptions: function (option: LuCI.form.Value, devices: any[]) {
        devices.forEach((d: any) => {
            option.value(d.device, d.device);
        });
    },

    createIfaceValidator: function (devices: any[]) {
        return function (_sectionId: string, value: string) {
            if (!value) return true;
            const exists = devices.some((d: any) => d.device === value);
            if (!exists) return _('Interface "%s" Not Found').format(value);
            return true;
        };
    },

    createNftViewOption: function (s: LuCI.form.AbstractSection) {
        let nftViewOpt = s.taboption('nftables', form.TextValue, '_nft_view');
        nftViewOpt.rows = 30;
        nftViewOpt.monospace = true;
        nftViewOpt.load = function () { return ''; };
        nftViewOpt.write = function () { };
        nftViewOpt.renderWidget = function (section_id: string, option_index: number, cfgvalue: any) {
            let widget = form.TextValue.prototype.renderWidget.call(this, section_id, option_index, cfgvalue) as HTMLElement;
            let textarea = widget.querySelector('textarea') as HTMLTextAreaElement;
            let loaded = false;
            let loading = false;
            const loadPrompt = _('Click to View Firewall Rules');

            textarea.readOnly = true;
            textarea.placeholder = loadPrompt;
            textarea.setAttribute('aria-label', loadPrompt);
            textarea.title = loadPrompt;
            textarea.style.cursor = 'pointer';

            const loadRules = function () {
                if (loaded || loading) return;

                loading = true;
                textarea.setAttribute('aria-busy', 'true');
                textarea.style.cursor = 'progress';
                textarea.value = _('Loading');

                fs.exec_direct('/usr/lib/hijpass/nft.sh', ['show'], 'text')
                    .then((res: any) => {
                        textarea.value = res?.trim() || _('No Rules');
                        textarea.setAttribute('aria-label', _('Firewall Rules'));
                        textarea.removeAttribute('title');
                        loaded = true;
                    })
                    .catch(() => { textarea.value = _('Read Failed'); })
                    .finally(() => {
                        loading = false;
                        textarea.removeAttribute('aria-busy');
                        textarea.style.cursor = loaded ? 'text' : 'pointer';
                    });
            };

            textarea.addEventListener('click', loadRules);
            textarea.addEventListener('keydown', function (event: KeyboardEvent) {
                if (!loaded && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    loadRules();
                }
            });

            return widget;
        };
    },
}

export { FirewallFormUtils }
