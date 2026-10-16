import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting, bracketMatching } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import ui from 'ui';
import { firewallTemplateLanguage } from './syntax';

function showParameters(event: Event) {
    const button = event.currentTarget as HTMLButtonElement;
    const parameters = [
        ['proxyPort', 'integer', _('Proxy node port; 0 disables this entry.')],
        ['shuntPort', 'integer', _('Shunt node port; 0 disables this entry.')],
        ['forwardPort', 'integer', _('Local DNS forwarding port; 0 disables DNS forwarding.')],
        ['protocols', 'string[]', _('Protocols selected for transparent proxying: tcp, udp, or both.')],
        ['proxyLocal', 'boolean', _('Whether to proxy traffic originating from the router.')],
        ['allowAll', 'boolean', _('true: proxy all clients except exclusions; false: proxy only selected clients.')],
        ['proxyMark', 'integer', _('Connection mark for forced proxying (0x1).')],
        ['shuntMark', 'integer', _('Connection mark for shunt routing (0x3).')],
        ['user', 'string', _('Proxy process group excluded from interception.')],
        ['wan', 'string[]', _('WAN device names excluded from interception.')],
        ['interfaces', 'string[]', _('Client device names selected for proxying.')],
        ['macs', 'string[]', _('Client MAC addresses selected for proxying.')],
        ['excludedInterfaces', 'string[]', _('Client device names excluded when allowAll is true.')],
        ['excludedMacs', 'string[]', _('Client MAC addresses excluded when allowAll is true.')],
        ['wanNames', 'string', _('Quoted, comma-separated WAN names for nft interface matches.')],
        ['interfaceNames', 'string', _('Quoted, comma-separated selected client device names.')],
        ['excludedInterfaceNames', 'string', _('Quoted, comma-separated excluded client device names.')],
        ['domainSets', 'boolean', _('Whether to create DNS-managed address sets.')],
        ['useChn', 'boolean', _('Whether to create the CHN domain address sets.')],
        ['useChnRoute', 'boolean', _('Whether to load CHN IPv4/IPv6 route lists.')],
        ['useGfw', 'boolean', _('Whether to create the GFW domain address sets.')],
        ['ip4', 'object', _('IPv4 lists: direct (local, DNS and bypass addresses), proxy (force proxy), china (CHN routes).')],
        ['ip6', 'object', _('IPv6 lists: direct (local, DNS and bypass addresses), proxy (force proxy), china (CHN routes).')],
    ];
    const cellStyle = 'text-align:left;padding:.5rem';
    ui.showModal(_('Template Parameters'), [
        // 样式随内容移除，避免影响 LuCI 复用的其它弹窗。
        E('style', {}, '.hijpass-template-parameters { width:min(56rem, 100%); overflow:hidden; }'),
        E('div', { style: 'max-height:65vh;overflow:auto' }, [
            E('table', { class: 'table' }, [
                E('thead', {}, E('tr', { class: 'tr' }, [_('Parameter'), _('Type'), _('Description')]
                    .map((title, index) => E('th', { class: 'th', scope: 'col', style: cellStyle + (index === 0 ? ';width:40%' : '') }, title)))),
                E('tbody', {}, parameters.map(([name, type, description]) => E('tr', { class: 'tr' }, [
                    E('th', { class: 'td', scope: 'row', style: cellStyle + ';font-weight:normal;overflow-wrap:anywhere' },
                        E('span', { style: 'font-family:monospace' }, 'options.' + name)),
                    E('td', { class: 'td', style: cellStyle }, type),
                    E('td', { class: 'td', style: cellStyle }, description),
                ]))),
            ]),
        ]),
        E('div', { class: 'right' }, E('button', {
            type: 'button', class: 'btn cbi-button',
            click: () => { ui.hideModal(); button.focus(); },
        }, _('Close'))),
    ], 'hijpass-template-parameters');
}

function mount(widget: HTMLElement, label: string) {
    const textarea = widget.querySelector('textarea') as HTMLTextAreaElement;
    const native = L.dom.findClassInstance(widget) as LuCI.ui.AbstractElement;
    const color = getComputedStyle(document.body).color.match(/\d+/g)?.slice(0, 3).map(Number) || [0, 0, 0];
    const dark = color.reduce((sum, value) => sum + value, 0) > 384;
    const palette = dark
        ? { keyword: '#8cc8ff', string: '#a5d6a7', number: '#d2a8ff', comment: '#a2adb9', variable: '#ffb86c' }
        : { keyword: '#005cc5', string: '#116329', number: '#8250df', comment: '#57606a', variable: '#953800' };
    const theme = EditorView.theme({
        '&': { width: '100%', minWidth: '0', boxSizing: 'border-box', height: '38rem', minHeight: '18rem', maxWidth: '100%', color: 'inherit', backgroundColor: 'transparent',
            border: '1px solid var(--border-color, #7778)', borderRadius: '3px', resize: 'vertical', overflow: 'hidden' },
        '&.cm-focused': { outline: '2px solid currentColor', outlineOffset: '-1px' },
        '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: '.9rem' },
        '.cm-content': { padding: '.5rem 0', caretColor: 'currentColor' },
        '.cm-gutters': { color: 'inherit', borderRight: '1px solid #7774' },
        '.cm-lineNumbers .cm-gutterElement': { opacity: '.65' },
        '.cm-activeLine': { backgroundColor: dark ? '#ffffff08' : '#00000005' },
    }, { dark });
    const highlights = HighlightStyle.define([
        { tag: [tags.keyword, tags.meta], color: palette.keyword },
        { tag: tags.string, color: palette.string },
        { tag: [tags.number, tags.atom], color: palette.number },
        { tag: tags.comment, color: palette.comment },
        { tag: tags.variableName, color: palette.variable },
    ]);
    const view = new EditorView({
        parent: widget,
        state: EditorState.create({ doc: textarea.value, extensions: [
            lineNumbers(), history(), drawSelection(), highlightActiveLine(), bracketMatching(),
            keymap.of([...defaultKeymap, ...historyKeymap]),
            firewallTemplateLanguage, syntaxHighlighting(highlights), theme,
            EditorState.readOnly.of(textarea.readOnly || textarea.disabled),
            EditorView.editable.of(!textarea.readOnly && !textarea.disabled),
            EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false', autocorrect: 'off', autocapitalize: 'off' }),
            EditorView.updateListener.of(update => {
                if (!update.docChanged) return;
                // 保留原生 LuCI textarea 与事件，保存、校验仍使用既有表单逻辑。
                textarea.value = update.state.doc.toString();
                textarea.dispatchEvent(new Event('change', { bubbles: true }));
            }),
        ] }),
    });
    textarea.hidden = true;
    const setValue = native.setValue.bind(native);
    native.setValue = value => {
        const text = value == null ? '' : String(value);
        setValue(text);
        if (view.state.doc.toString() !== text)
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: 0 }, scrollIntoView: true });
    };
    // LuCI 保存后会重新渲染表单；移除旧节点时释放编辑器的观察器与事件。
    let attached = widget.isConnected;
    const observer = new MutationObserver(() => {
        if (widget.isConnected) { attached = true; return; }
        if (!attached) return;
        view.destroy();
        observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

export const FirewallEditorUtils = { mount, showParameters };
