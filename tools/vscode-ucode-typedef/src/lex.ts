export interface Span { start: number; end: number }
export interface Token extends Span { kind: 'word' | 'string' | 'punct' | 'doc'; text: string }

export function quotedEnd(text: string, start: number, limit = text.length): number {
    for (let i = start + 1; i < limit; i++) {
        if (text[i] === '\\') i++;
        else if (text[i] === text[start]) return i + 1;
    }
    return limit;
}

function regexEnd(text: string, start: number): number {
    let inClass = false;
    for (let i = start + 1; i < text.length && text[i] !== '\n'; i++) {
        if (text[i] === '\\') i++;
        else if (text[i] === '[') inClass = true;
        else if (text[i] === ']') inClass = false;
        else if (text[i] === '/' && !inClass) return i + 1;
    }
    return start + 1;
}

// Offsets always refer to the unmodified document (UTF-16). Template text is
// opaque, while ${...} is scanned as code, including nested templates/regexes.
export function tokens(text: string): Token[] {
    const result: Token[] = [];
    let i = text.startsWith('#!') ? text.indexOf('\n') : 0;
    if (i < 0) return result;
    function emit(kind: Token['kind'], start: number, end: number, value = text.slice(start, end)) {
        result.push({ kind, start, end, text: value });
    }
    function scan(interpolation = false): void {
        let expressionStart = true, previous = '', depth = 0;
        const controlParens: boolean[] = [], blocks: boolean[] = [];
        while (i < text.length) {
            const start = i, char = text[i]!;
            if (/\s/.test(char)) { i++; continue; }
            if (interpolation && char === '}' && depth === 0) { i++; return; }
            if (char === '"' || char === "'") {
                i = quotedEnd(text, i);
                emit('string', start, i);
                expressionStart = false; previous = 'literal';
            } else if (char === '`') {
                emit('string', i, ++i);
                while (i < text.length && text[i] !== '`') {
                    if (text[i] === '\\') i += 2;
                    else if (text.startsWith('${', i)) {
                        emit('punct', i, i + 2, '('); i += 2;
                        scan(true);
                        emit('punct', i - 1, i, ')');
                    } else i++;
                }
                if (i < text.length) emit('string', i, ++i);
                expressionStart = false; previous = 'literal';
            } else if (text.startsWith('//', i)) {
                const end = text.indexOf('\n', i); i = end < 0 ? text.length : end;
            } else if (text.startsWith('/*', i)) {
                const end = text.indexOf('*/', i + 2);
                if (end < 0) return;
                i = end + 2;
                if (text[start + 2] === '*') emit('doc', start, i);
            } else if (char === '/' && expressionStart) {
                i = regexEnd(text, i);
                emit('string', start, i);
                expressionStart = false; previous = 'literal';
            } else if (/[\w$]/.test(char)) {
                while (i < text.length && /[\w$]/.test(text[i]!)) i++;
                emit('word', start, i);
                previous = text.slice(start, i);
                expressionStart = /^(return|throw|case|delete|in|else|do)$/.test(previous);
            } else {
                const operator = /^(\?\.|=>|\+\+|--|\|\|=|&&=|\?\?=|===|!==|==|!=|<=|>=|&&|\|\||\?\?|\+=|-=|\*=|\/=|\.\.\.)/.exec(text.slice(i))?.[0] ?? char;
                i += operator.length;
                emit('punct', start, i);
                if (char === '(') controlParens.push(/^(if|while|for|switch|catch)$/.test(previous));
                if (char === '{') { depth++; blocks.push(/^(\)|=>|;|\{|\}|else|try|finally|do|)$/.test(previous)); }
                if (char === '}') depth--;
                expressionStart = char === ')' ? (controlParens.pop() ?? false)
                    : char === '}' ? (blocks.pop() ?? true) : !/[\].]/.test(char);
                if (operator === '++' || operator === '--') expressionStart = false;
                previous = operator;
            }
        }
    }
    scan();
    return result;
}
