interface Span { start: number; end: number }
interface NamedSpan extends Span { name: string }
interface Definition extends NamedSpan { commentStart: number; commentEnd: number }
export interface TypeIndex {
    definitions: Map<string, Definition[]>;
    references: NamedSpan[];
}

// A small lexical scan keeps examples in strings, line comments and regexes out
// of the index. Offsets always refer to the unmodified document (UTF-16).
function quotedEnd(text: string, start: number, limit = text.length): number {
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

function* docComments(text: string): Generator<Span> {
    let expressionStart = true;
    let previous = '';
    const controlParens: boolean[] = [];
    const blocks: boolean[] = [];
    for (let i = 0; i < text.length;) {
        const char = text[i]!;
        if (/\s/.test(char)) { i++; continue; }
        if (char === '"' || char === "'" || char === '`') {
            i = quotedEnd(text, i);
            expressionStart = false;
            previous = 'literal';
        } else if (text.startsWith('//', i) || (i === 0 && text.startsWith('#!', i))) {
            const end = text.indexOf('\n', i);
            i = end < 0 ? text.length : end;
        } else if (text.startsWith('/*', i)) {
            const end = text.indexOf('*/', i + 2);
            if (end < 0) return;
            if (text[i + 2] === '*') yield { start: i, end: end + 2 };
            i = end + 2;
        } else if (char === '/' && expressionStart) {
            i = regexEnd(text, i);
            expressionStart = false;
            previous = 'literal';
        } else if (/[\w$]/.test(char)) {
            const start = i++;
            while (i < text.length && /[\w$]/.test(text[i]!)) i++;
            previous = text.slice(start, i);
            expressionStart = /^(return|throw|case|delete|in|else|do)$/.test(previous);
        } else {
            if (char === '(') controlParens.push(/^(if|while|for|switch|catch)$/.test(previous));
            if (char === '{') blocks.push(/^(\)|>|;|\{|\}|else|try|finally|do|)$/.test(previous));
            expressionStart = char === ')' ? (controlParens.pop() ?? false)
                : char === '}' ? (blocks.pop() ?? true) : !/[\].]/.test(char);
            if ((char === '+' || char === '-') && text[i + 1] === char) {
                expressionStart = false;
                i++;
            }
            previous = char;
            i++;
        }
    }
}

function skipSpace(text: string, start: number, end: number): number {
    // The leading '*' on a continued JSDoc line is decoration, not a type.
    const match = /^(?:\n[ \t]*\*|\s)*/.exec(text.slice(start, end));
    return start + (match?.[0].length ?? 0);
}

function nameAt(text: string, start: number, end: number): NamedSpan | undefined {
    const match = /^[A-Za-z_$][\w$]*/.exec(text.slice(start, end));
    return match ? { name: match[0], start, end: start + match[0].length } : undefined;
}

function typeExpression(text: string, start: number, end: number): Span | undefined {
    if (text[start] !== '{') return;
    let depth = 1;
    for (let i = start + 1; i < end; i++) {
        if (text[i] === '"' || text[i] === "'") i = quotedEnd(text, i, end) - 1;
        else if (text[i] === '{') depth++;
        else if (text[i] === '}' && --depth === 0) return { start: start + 1, end: i };
    }
}

function typeReferences(text: string, expression: Span): NamedSpan[] {
    const references: NamedSpan[] = [];
    for (let i = expression.start; i < expression.end;) {
        if (text[i] === '"' || text[i] === "'") {
            i = quotedEnd(text, i, expression.end);
            continue;
        }
        const name = nameAt(text, i, expression.end);
        if (!name) { i++; continue; }
        i = name.end;
        // Qualified names/import('module').Type belong to other resolvers.
        // Inline record keys (including optional keys) are not type references.
        const suffix = text.slice(i, expression.end);
        if (text.slice(expression.start, name.start).trimEnd().endsWith('.') || /^\s*\.(?!\s*<)/.test(suffix) || /^\s*\??\s*:/.test(suffix)) continue;
        references.push(name);
    }
    return references;
}

export function buildTypeIndex(text: string): TypeIndex {
    const index: TypeIndex = { definitions: new Map(), references: [] };
    for (const comment of docComments(text)) {
        const contentStart = comment.start + 3;
        const contentEnd = comment.end - 2;
        const content = text.slice(contentStart, contentEnd);
        const tags = [...content.matchAll(/(?:^|\n)[ \t]*\*?[ \t]*@(\w+)\b/g)];
        for (let i = 0; i < tags.length; i++) {
            const tag = tags[i]!;
            if (!/^(param|arg|argument|returns?|type|property|prop|typedef|extends|augments)$/.test(tag[1]!)) continue;
            const end = contentStart + (tags[i + 1]?.index ?? content.length);
            let start = skipSpace(text, contentStart + tag.index + tag[0].length, end);
            let definition: NamedSpan | undefined;
            if (tag[1] === 'typedef' && text[start] !== '{') {
                definition = nameAt(text, start, end);
                if (definition) start = skipSpace(text, definition.end, end);
            }
            const expression = typeExpression(text, start, end);
            if (expression) {
                index.references.push(...typeReferences(text, expression));
                if (tag[1] === 'typedef' && !definition) {
                    definition = nameAt(text, skipSpace(text, expression.end + 1, end), end);
                }
            }
            if (definition) {
                const definitions = index.definitions.get(definition.name) ?? [];
                definitions.push({ ...definition, commentStart: comment.start, commentEnd: comment.end });
                index.definitions.set(definition.name, definitions);
            }
        }
    }
    return index;
}

export function lookupType(index: TypeIndex, offset: number) {
    const reference = index.references.find(item => item.start <= offset && offset <= item.end);
    const definitions = reference && index.definitions.get(reference.name);
    return reference && definitions?.length ? { reference, definitions } : undefined;
}
