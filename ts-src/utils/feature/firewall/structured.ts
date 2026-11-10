import editor from 'hijpass.editor';
import { NotificationUtils } from '../../base/luci/notification';
import { parseTemplate, editRule, replaceFragment, validPorts, type Fragment } from './template';

const chainTitles = () => ({
    'pre-filter': _('Client filtering'), 'out-route': _('Router traffic'),
    'tproxy-shunt': _('Destination routing'), 'tproxy-mark': _('Policy routing mark'),
    'proxy-port-filter': _('Port filtering'), 'dns-forward': _('Client DNS forwarding'),
    'dns-forward-output': _('Router DNS forwarding'),
});

export function mountTemplateEditor(widget: HTMLElement, label: string) {
    const textarea = widget.querySelector('textarea') as HTMLTextAreaElement;
    const native = L.dom.findClassInstance(widget) as LuCI.ui.AbstractElement;
    const code = editor.mount(widget, 'firewall', label);
    const raw = E('div', { class: 'hijpass-template-raw' }) as HTMLElement;
    while (widget.firstChild) raw.appendChild(widget.firstChild);
    const structured = E('div', { class: 'hijpass-template-structure' }) as HTMLElement;
    const message = E('p', { role: 'status', class: 'hijpass-template-status' });
    let mode: 'structured' | 'raw' = 'structured';
    const tabs = E('div', { class: 'hijpass-template-modes', role: 'group', 'aria-label': _('Editor view') }) as HTMLElement;
    const buttons = ['structured', 'raw'].map(value => E('button', {
        type: 'button', class: 'btn cbi-button',
        click: () => switchMode(value as typeof mode),
    }, value === 'structured' ? _('Structured') : _('Raw template'))) as HTMLButtonElement[];
    tabs.append(...buttons);
    widget.classList.add('hijpass-template-editor');
    widget.append(E('style', {}, `
.hijpass-template-editor { min-width:0; width:100%; }
.hijpass-template-editor [hidden] { display:none !important; }
.hijpass-template-modes { display:flex; flex-wrap:wrap; gap:.5rem; margin-bottom:.75rem; }
.hijpass-template-modes [aria-pressed="true"] { outline:2px solid currentColor; outline-offset:-2px; font-weight:bold; }
.hijpass-template-status:empty { display:none; }
.hijpass-template-group { border:1px solid var(--border-color,#7778); border-radius:3px; margin-bottom:.75rem; padding:.75rem; }
.hijpass-template-editor summary { cursor:pointer; overflow-wrap:anywhere; }
.hijpass-template-group > summary { font-weight:bold; }
.hijpass-template-rule { display:flex; flex-wrap:wrap; align-items:center; gap:.75rem; padding:.75rem 0; border-bottom:1px solid #7774; }
.hijpass-template-rule > label:first-child { flex:1 1 16rem; display:flex; gap:.5rem; align-items:center; }
.hijpass-template-rule input[type="text"] { box-sizing:border-box; width:100%; min-width:0; }
.hijpass-template-ports { flex:1 1 18rem; min-width:0; }
.hijpass-template-code { margin:.5rem 0; }
.hijpass-template-code pre { font-size:.85rem; max-height:14rem; overflow:auto; white-space:pre; }
.hijpass-template-code button { margin-top:.5rem; }
`), tabs, message, structured, raw);

    function switchMode(next: typeof mode, fragment?: Fragment) {
        mode = next;
        if (mode === 'structured' && !render()) mode = 'raw';
        structured.hidden = mode !== 'structured';
        raw.hidden = mode !== 'raw';
        buttons.forEach((button, index) => button.setAttribute('aria-pressed', String((index === 0) === (mode === 'structured'))));
        if (mode === 'raw' && fragment) code.focusRange(fragment.start, fragment.end);
    }
    function sourceBlock(fragment: Fragment, title = _('Custom code / template logic')) {
        return E('details', { class: 'hijpass-template-code' }, [
            E('summary', {}, title),
            E('pre', {}, fragment.text),
            E('button', { type: 'button', class: 'btn cbi-button', click: () => switchMode('raw', fragment) }, _('Edit source')),
        ]);
    }
    function update(fragment: Fragment, enabled: boolean, ports?: string) {
        try {
            const text = editRule(fragment, enabled, ports);
            native.setValue(replaceFragment(textarea.value, fragment, text));
        } catch (error) {
            NotificationUtils.error(_('Edit Failed'), error.message, 5000);
        }
        render();
    }
    function render(): boolean {
        const groups = parseTemplate(textarea.value);
        message.textContent = groups ? '' : _('This template cannot be safely displayed as structured rules. Edit it in Raw template view.');
        const open = new Map(Array.from(structured.querySelectorAll<HTMLDetailsElement>('.hijpass-template-group')).map(group => [group.dataset.chain, group.open]));
        const active = (document.activeElement as HTMLElement)?.dataset?.control;
        structured.replaceChildren();
        if (!groups) return false;
        const titles = chainTitles();
        for (const group of groups) {
            if (!group.chain) {
                for (const fragment of group.fragments) if (fragment.text.trim()) structured.append(sourceBlock(fragment));
                continue;
            }
            const body = E('details', { class: 'hijpass-template-group', 'data-chain': group.chain,
                open: (open.get(group.chain) ?? group.chain === 'proxy-port-filter') || null }, [
                E('summary', {}, group.chain ? `${titles[group.chain] || group.chain} · ${group.chain}` : _('Template code and sets')),
            ]) as HTMLDetailsElement;
            for (const fragment of group.fragments) {
                if (!fragment.rule) {
                    if (fragment.text.trim()) body.append(sourceBlock(fragment));
                    continue;
                }
                const rule = fragment.rule;
                const toggle = E('input', { type: 'checkbox', 'data-control': `${fragment.start}-toggle`, checked: rule.enabled || null,
                    disabled: textarea.readOnly || textarea.disabled || null }) as HTMLInputElement;
                const row = E('div', { class: 'hijpass-template-rule' }, [E('label', {}, [toggle, rule.title])]) as HTMLElement;
                const ports = rule.ports === undefined ? null : E('input', { type: 'text', value: rule.ports, 'data-control': `${fragment.start}-ports`,
                    disabled: textarea.readOnly || textarea.disabled || null,
                    'aria-label': rule.title + ' — ' + _('Ports') }) as HTMLInputElement;
                toggle.addEventListener('change', () => update(fragment, toggle.checked, rule.ports));
                if (ports) {
                    ports.addEventListener('change', () => {
                        if (!validPorts(ports.value, rule.portList)) {
                            ports.value = rule.ports;
                            NotificationUtils.error(_('Edit Failed'), _('Use ports from 1 to 65535, separated by commas; ranges use a hyphen.'), 5000);
                            return;
                        }
                        update(fragment, rule.enabled, ports.value);
                    });
                    row.append(E('label', { class: 'hijpass-template-ports' }, [E('span', {}, _('Ports')), ports]));
                }
                body.append(row, sourceBlock(fragment, _('Rule source')));
            }
            structured.append(body);
        }
        if (!groups.length) structured.append(E('p', {}, _('The template is empty. Edit Raw template or restore the default template.')));
        if (active) structured.querySelector<HTMLElement>(`[data-control="${active}"]`)?.focus();
        return true;
    }
    // 包括“恢复默认”和外部 setValue；不持有第二份配置草稿。
    textarea.addEventListener('change', () => { if (mode === 'structured') switchMode('structured'); });
    switchMode('structured');
}
