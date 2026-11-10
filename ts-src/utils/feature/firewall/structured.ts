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
    editor.mount(widget, 'firewall', label);
    const raw = E('div', { class: 'hijpass-template-raw' }) as HTMLElement;
    while (widget.firstChild) raw.appendChild(widget.firstChild);
    const structured = E('div', { class: 'hijpass-template-structure' }) as HTMLElement;
    const message = E('p', { role: 'status', class: 'hijpass-template-status' });
    let mode: 'structured' | 'raw' = 'structured', selected = 'proxy-port-filter';
    const modes = E('div', { class: 'hijpass-template-modes', role: 'group', 'aria-label': _('Editor view') }) as HTMLElement;
    const buttons = ['structured', 'raw'].map(value => E('button', {
        type: 'button', click: () => switchMode(value as typeof mode),
    }, value === 'structured' ? _('Template editor') : _('Raw template'))) as HTMLButtonElement[];
    modes.append(...buttons);
    widget.classList.add('hijpass-template-editor');
    widget.append(E('style', {}, `
.hijpass-template-editor { min-width:0; width:100%; --hp-border:var(--border-color,#80808040); --hp-tint:rgba(128,128,128,.08); }
.hijpass-template-editor [hidden] { display:none !important; }
.hijpass-template-editor button { font:inherit; color:inherit; cursor:pointer; }
.hijpass-template-editor button:focus-visible, .hijpass-template-editor input:focus-visible { outline:2px solid var(--primary-color,#3b70c4); outline-offset:2px; }
.hijpass-template-modes { display:inline-flex; gap:.25rem; padding:.25rem; margin-bottom:1.25rem; border:1px solid var(--hp-border); border-radius:6px; }
.hijpass-template-modes button { border:0; border-radius:3px; background:transparent; padding:.5rem 1rem; box-shadow:none; }
.hijpass-template-modes [aria-pressed="true"] { background:var(--hp-tint); font-weight:600; }
.hijpass-template-status:empty { display:none; }
.hijpass-template-structure { display:grid; grid-template-columns:11rem minmax(0,1fr); border:1px solid var(--hp-border); border-radius:6px; overflow:hidden; }
.hijpass-template-nav { display:flex; flex-direction:column; gap:.25rem; padding:.75rem; border-right:1px solid var(--hp-border); background:var(--hp-tint); }
.hijpass-template-nav button { text-align:left; border:0; border-left:2px solid transparent; border-radius:3px; padding:.75rem; background:transparent; box-shadow:none; white-space:nowrap; }
.hijpass-template-nav button:hover { background:var(--hp-tint); }
.hijpass-template-nav [aria-selected="true"] { border-left-color:currentColor; background:var(--hp-tint); font-weight:600; }
.hijpass-template-panel { padding:1.25rem 1.5rem; min-width:0; }
.hijpass-template-panel h3 { margin:0 0 1.25rem; font-size:1rem; font-weight:600; border:0; padding:0; }
.hijpass-template-columns,.hijpass-template-rule { display:grid; grid-template-columns:minmax(9rem,1fr) minmax(10rem,1.25fr) 3rem; align-items:center; gap:1rem; }
.hijpass-template-columns { font-size:.85rem; padding-bottom:.75rem; opacity:.7; }
.hijpass-template-rule { min-height:4.5rem; padding:1rem 0; border-top:1px solid var(--hp-border); }
.hijpass-template-panel[data-ports="false"] .hijpass-template-columns,.hijpass-template-panel[data-ports="false"] .hijpass-template-rule { grid-template-columns:minmax(0,1fr) 3rem; }
.hijpass-template-panel[data-ports="false"] .hijpass-template-columns > :nth-child(2),.hijpass-template-panel[data-ports="false"] .hijpass-template-rule > span { display:none; }
.hijpass-template-rule > label { margin:0; cursor:pointer; overflow-wrap:anywhere; }
.hijpass-template-columns > :last-child,.hijpass-template-rule > input[type="checkbox"] { justify-self:center; }
.hijpass-template-rule input[type="text"] { box-sizing:border-box; width:100%; min-width:0; max-width:none; margin:0; font:inherit; }
.hijpass-template-rule input[type="checkbox"] { appearance:auto !important; width:1rem; height:1rem; margin:0; cursor:pointer; accent-color:var(--primary-color,#3b70c4); }
@media (max-width:900px) {
 .hijpass-template-structure { grid-template-columns:minmax(0,1fr); }
 .hijpass-template-nav { flex-direction:row; overflow-x:auto; border-right:0; border-bottom:1px solid var(--hp-border); }
 .hijpass-template-nav button { border-left:0; border-bottom:2px solid transparent; }
 .hijpass-template-nav [aria-selected="true"] { border-bottom-color:currentColor; }
}
@media (max-width:600px) {
 .hijpass-template-panel { padding:1rem; }
 .hijpass-template-columns { display:none; }
 .hijpass-template-rule { grid-template-columns:minmax(0,1fr) 2rem; gap:.75rem; }
 .hijpass-template-rule > label { grid-column:1; grid-row:1; }
 .hijpass-template-rule > input[type="checkbox"] { grid-column:2; grid-row:1; }
 .hijpass-template-rule > input[type="text"] { grid-column:1 / -1; grid-row:2; }
 .hijpass-template-rule > span { display:none; }
}
`), modes, message, structured, raw);

    function switchMode(next: typeof mode) {
        mode = next;
        if (mode === 'structured' && !render()) mode = 'raw';
        structured.hidden = mode !== 'structured';
        raw.hidden = mode !== 'raw';
        buttons.forEach((button, index) => button.setAttribute('aria-pressed', String((index === 0) === (mode === 'structured'))));
    }
    function update(fragment: Fragment, enabled: boolean, ports?: string) {
        try {
            native.setValue(replaceFragment(textarea.value, fragment, editRule(fragment, enabled, ports)));
        } catch (error) { NotificationUtils.error(_('Edit Failed'), error.message, 5000); }
    }
    function render(): boolean {
        const groups = parseTemplate(textarea.value), titles = chainTitles();
        message.textContent = groups ? '' : _('This template cannot be safely displayed as structured rules. Edit it in Raw template view.');
        const active = (document.activeElement as HTMLElement)?.dataset?.control;
        structured.replaceChildren();
        if (!groups) return false;
        // 只呈现已知链中的预设规则；自定义片段仍留在原文中，既不展示也不重新生成。
        const presets = groups.filter(group => Object.hasOwn(titles, group.chain) && group.fragments.some(f => f.rule));
        if (!presets.some(group => group.chain === selected)) selected = presets[0]?.chain || '';
        if (!presets.length) {
            structured.append(E('p', { class: 'hijpass-template-panel' }, _('No preset rules found. Use Raw template to edit this configuration.')));
            return true;
        }
        const nav = E('div', { class: 'hijpass-template-nav', role: 'tablist', 'aria-label': _('Rule categories') }) as HTMLElement;
        const id = (textarea.id || 'hijpass-firewall') + '-preset';
        const navButtons = presets.map((group, index) => E('button', {
            type: 'button', role: 'tab', id: `${id}-${index}`, 'aria-controls': id,
            'aria-selected': String(selected === group.chain), tabindex: selected === group.chain ? 0 : -1,
            'data-control': `category-${index}`,
            click: () => { selected = group.chain; render(); },
            keydown: (event: KeyboardEvent) => {
                const move = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
                if (move === undefined && !['Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? presets.length - 1 : (index + move + presets.length) % presets.length;
                navButtons[next].click();
                structured.querySelector<HTMLElement>(`[data-control="category-${next}"]`)?.focus();
            },
        }, titles[group.chain])) as HTMLButtonElement[];
        nav.append(...navButtons);
        const group = presets.find(group => group.chain === selected);
        const panel = E('section', { class: 'hijpass-template-panel', role: 'tabpanel', id,
            'aria-labelledby': `${id}-${presets.indexOf(group)}`, 'data-chain': selected,
            'data-ports': String(group.fragments.some(f => f.rule?.ports !== undefined)) }, [
            E('h3', {}, titles[selected]),
            E('div', { class: 'hijpass-template-columns', 'aria-hidden': 'true' }, [_('Rule'), _('Ports'), _('Enable')].map(text => E('span', {}, text))),
        ]) as HTMLElement;
        for (const fragment of group.fragments.filter(f => f.rule)) {
            const rule = fragment.rule, control = `${id}-${fragment.start}`;
            const toggle = E('input', { type: 'checkbox', id: control, 'data-control': `${fragment.start}-toggle`, checked: rule.enabled || null,
                disabled: textarea.readOnly || textarea.disabled || null,
                change: (event: Event) => update(fragment, (event.target as HTMLInputElement).checked, rule.ports) });
            const ports = rule.ports === undefined ? E('span', {}) : E('input', {
                type: 'text', value: rule.ports, 'data-control': `${fragment.start}-ports`,
                disabled: textarea.readOnly || textarea.disabled || null, 'aria-label': rule.title + ' — ' + _('Ports'),
                change: (event: Event) => {
                    const input = event.target as HTMLInputElement;
                    if (!validPorts(input.value, rule.portList)) {
                        input.value = rule.ports;
                        NotificationUtils.error(_('Edit Failed'), _('Use ports from 1 to 65535, separated by commas; ranges use a hyphen.'), 5000);
                        return;
                    }
                    update(fragment, rule.enabled, input.value);
                },
            });
            panel.append(E('div', { class: 'hijpass-template-rule' }, [E('label', { for: control }, rule.title), ports, toggle]));
        }
        structured.append(nav, panel);
        if (active) structured.querySelector<HTMLElement>(`[data-control="${active}"]`)?.focus();
        return true;
    }
    textarea.addEventListener('change', () => { if (mode === 'structured') switchMode('structured'); });
    switchMode('structured');
}
