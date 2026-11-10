// 模板文本是唯一数据源。结构化编辑仅替换识别出的整行，不重新序列化模板。
export type Rule = { title: string; enabled: boolean; ports?: string; portList?: boolean; portStart?: number; portEnd?: number };
export type Fragment = { start: number; end: number; text: string; rule?: Rule };
export type Group = { chain: string; fragments: Fragment[] };

const fixedRules = () => new Map([
    ['fib daddr type local counter return', _('Bypass router addresses')],
    ['iifname { {{ options.wanNames }} } counter return', _('Bypass WAN traffic')],
    ['ct direction reply counter return', _('Bypass reply traffic')],
    ['meta l4proto != { {{ join(\', \', options.protocols) }} } counter return', _('Filter selected protocols')],
    ['ct state new,related counter jump tproxy-shunt', _('Classify new connections')],
    ['ct mark != { {{ options.proxyMark }}, {{ options.shuntMark }} } counter return', _('Bypass unmarked connections')],
    ['counter jump proxy-port-filter', _('Apply port filtering')],
    ['counter jump tproxy-mark', _('Apply policy routing mark')],
    ['meta skgid {{ sprintf("%J", options.user) }} counter return', _('Bypass proxy processes')],
    ['ct mark { {{ options.proxyMark }}, {{ options.shuntMark }} } return', _('Keep existing proxy selection')],
    ['ct mark set {{ options.shuntMark }} counter comment "shunt mark"', _('Send unmatched destinations to shunt')],
    ['ct mark { {{ options.proxyMark }}, {{ options.shuntMark }} } meta mark set {{ options.proxyMark }}', _('Copy connection mark to packet')],
    ['meta l4proto { tcp, udp } th dport 53 counter redirect to :{{ options.forwardPort }}', _('Forward client DNS')],
    ['fib daddr type local meta l4proto { tcp, udp } th dport 53 counter redirect to :{{ options.forwardPort }}', _('Forward router DNS')],
    ['meta l4proto { {{ join(\', \', options.protocols) }} } ct mark {{ options.proxyMark }} tproxy to :{{ options.proxyPort }} meta mark set {{ options.proxyMark }} counter accept', _('Intercept forced proxy connections')],
    ['meta l4proto { {{ join(\', \', options.protocols) }} } ct mark { {{ options.proxyMark }}, {{ options.shuntMark }} } tproxy to :{{ options.shuntPort }} meta mark set {{ options.proxyMark }} counter', _('Intercept shunt connections')],
]);

export function validPorts(value: string, list = true): boolean {
    if (!list && !/^\d+$/.test(value)) return false;
    return value.split(',').every(part => {
        if (!/^\s*\d+(?:\s*-\s*\d+)?\s*$/.test(part)) return false;
        const [first, last = first] = part.trim().split(/\s*-\s*/).map(Number);
        return first >= 1 && last <= 65535 && first <= last;
    });
}

function recognize(text: string, chain: string, titles: Map<string, string>): Rule | undefined {
    const trimmed = text.trim(), enabled = !trimmed.startsWith('#');
    const body = enabled ? trimmed : trimmed.replace(/^#\s?/, '');
    const title = titles.get(body);
    if (title) return { title, enabled };
    if (chain !== 'proxy-port-filter') return;
    const patterns: [RegExp, string][] = [
        [/^meta l4proto udp udp dport (\d+) counter reject$/, _('Reject QUIC')],
        [/^meta l4proto udp udp dport != (\d+) ct mark set 0 counter return$/, _('Bypass UDP except DNS')],
        [/^meta l4proto tcp ct mark != \{\{ options.proxyMark \}\} tcp dport != \{ ([\d\s,\-]+)\} ct mark set 0 counter return$/, _('Restrict shunt TCP ports')],
    ];
    for (const [pattern, label] of patterns) {
        const match = body.match(pattern);
        if (!match || !validPorts(match[1])) continue;
        const portStart = text.indexOf(body) + body.indexOf(match[1], body.indexOf('dport'));
        return { title: label, enabled, ports: match[1].trim(), portList: body.startsWith('meta l4proto tcp'), portStart, portEnd: portStart + match[1].trimEnd().length };
    }
}

// 屏蔽模板代码、字符串和注释后只读取 nft 大括号。复杂或未闭合语法退回源码编辑。
// 不解释或执行用户代码；模板语句与 nft 规则始终保留在原位置。
function scan(source: string): { mask: string; opaque: Uint8Array } | null {
    const chars = source.split(''), opaque = new Uint8Array(source.length);
    const hide = (start: number, end: number, block = false) => {
        for (let i = start; i < end; i++) { if (chars[i] !== '\n') chars[i] = ' '; if (block) opaque[i] = 1; }
    };
    function quoted(start: number): number {
        const quote = source[start];
        for (let i = start + 1; i < source.length; i++) {
            if (source[i] === '\\') { i++; continue; }
            if (source[i] === quote) return i + 1;
        }
        return -1;
    }
    for (let i = 0; i < source.length;) {
        const tag = source.slice(i, i + 2);
        if (['{%', '{{', '{#'].includes(tag)) {
            const close = tag === '{%' ? '%}' : tag === '{{' ? '}}' : '#}';
            let end = i + 2;
            while (end < source.length && source.slice(end, end + 2) !== close) {
                if (tag !== '{#' && /['"`]/.test(source[end])) {
                    end = quoted(end); if (end < 0) return null;
                } else if (tag !== '{#' && source.slice(end, end + 2) === '/*') {
                    end = source.indexOf('*/', end + 2); if (end < 0) return null; end += 2;
                } else if (tag !== '{#' && source.slice(end, end + 2) === '//') {
                    end = source.indexOf('\n', end + 2); if (end < 0) return null;
                } else {
                    // 正则字面量和除法不尝试区分，避免错误识别它们内部的模板结束符。
                    if (tag !== '{#' && source[end] === '/') return null;
                    end++;
                }
            }
            if (end >= source.length) return null;
            hide(i, end + 2, tag !== '{{'); i = end + 2;
        } else if (source[i] === '#') {
            let end = source.indexOf('\n', i); if (end < 0) end = source.length;
            const comment = source.slice(i, end);
            if (/\{[%#]/.test(comment) || /\{\{[^}]*$/.test(comment)) return null;
            hide(i, end); i = end;
        } else if (/['"]/.test(source[i])) {
            const end = quoted(i); if (end < 0) return null;
            hide(i, end, source.slice(i, end).includes('\n')); i = end;
        } else { if (source[i] === '\\') return null; i++; }
    }
    return { mask: chars.join(''), opaque };
}

export function parseTemplate(source: string): Group[] | null {
    const scanned = scan(source);
    if (!scanned) return null;
    const groups: Group[] = [], titles = fixedRules();
    let offset = 0, depth = 0, chain = '', chainDepth = 0;
    for (const text of source.match(/[^\n]*\n|[^\n]+$/g) || []) {
        const mask = scanned.mask.slice(offset, offset + text.length);
        const header = mask.match(/^\s*chain ([\w-]+)\s*\{\s*$/);
        if (header) { if (chain) return null; chain = header[1]; chainDepth = depth + 1; }
        let group = groups[groups.length - 1];
        if (!group || group.chain !== chain) { group = { chain, fragments: [] }; groups.push(group); }
        // 仅整行普通规则/被注释规则可编辑；模板代码内看似 nft 的行仍为原始片段。
        const rule = chain && depth === chainDepth && !scanned.opaque.slice(offset, offset + text.length).some(Boolean)
            ? recognize(text, chain, titles) : undefined;
        const previous = group.fragments[group.fragments.length - 1];
        if (!rule && previous && !previous.rule) { previous.text += text; previous.end += text.length; }
        else group.fragments.push({ start: offset, end: offset + text.length, text, rule });
        for (const char of mask) {
            if (char === '{') depth++;
            if (char === '}' && --depth < 0) return null;
        }
        if (chain && depth < chainDepth) chain = '';
        offset += text.length;
    }
    return depth === 0 ? groups : null;
}

export function editRule(fragment: Fragment, enabled: boolean, ports = fragment.rule?.ports): string {
    const rule = fragment.rule;
    if (!rule) throw new Error('Unrecognized rule');
    let text = fragment.text;
    if (rule.ports !== undefined && ports !== rule.ports) {
        if (!validPorts(ports, rule.portList)) throw new Error('Invalid ports');
        text = text.slice(0, rule.portStart) + ports + text.slice(rule.portEnd);
    }
    if (enabled !== rule.enabled)
        text = enabled ? text.replace(/^(\s*)# ?/, '$1') : text.replace(/^(\s*)(\S)/, '$1# $2');
    return text;
}

export function replaceFragment(source: string, fragment: Fragment, text: string): string {
    if (source.slice(fragment.start, fragment.end) !== fragment.text) throw new Error('Template changed; reopen structured view');
    return source.slice(0, fragment.start) + text + source.slice(fragment.end);
}
