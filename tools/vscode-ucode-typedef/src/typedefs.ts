import { quotedEnd, tokens, Span } from './lex';

interface NamedSpan extends Span { name: string }
export interface TypeReference extends NamedSpan { modulePath?: string }
export type Shape = { kind: 'reference'; reference: TypeReference }
    | { kind: 'record'; fields: FieldDefinition[]; index?: Shape }
    | { kind: 'multiple'; members: Shape[] }
    | { kind: 'array'; element: Shape }
    | { kind: 'dictionary'; value: Shape }
    | { kind: 'unknown' };
export interface FieldDefinition extends NamedSpan { shape: Shape; commentStart: number; commentEnd: number }
export interface Annotation extends Span {
    tag: string;
    name?: string;
    shape: Shape;
}
export interface Definition extends NamedSpan {
    commentStart: number;
    commentEnd: number;
    alias?: TypeReference;
    shape: Shape;
}
export interface TypeIndex {
    definitions: Map<string, Definition[]>;
    references: TypeReference[];
    annotations: Annotation[];
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

function expressionText(text: string, expression: Span): string {
    // Replace only the JSDoc decoration; preserve every UTF-16 offset.
    return text.slice(expression.start, expression.end).replace(/(^|\n)([ \t]*)\*/g, '$1$2 ');
}

function importedType(text: string, start: number) {
    const match = /^import\s*\(\s*(?:'([^'\\\r\n]*)'|"([^"\\\r\n]*)")\s*\)\s*\.\s*([A-Za-z_$][\w$]*)(?![\w$]|\s*\.)/.exec(text.slice(start));
    if (!match) return;
    const name = match[3]!;
    const end = start + match[0].length;
    return { reference: { name, start: end - name.length, end, modulePath: match[1] ?? match[2]! }, end };
}

function typeReferences(source: string, expression: Span): TypeReference[] {
    const text = expressionText(source, expression);
    const references: TypeReference[] = [];
    for (let i = 0; i < text.length;) {
        if (text[i] === '"' || text[i] === "'") {
            i = quotedEnd(text, i);
            continue;
        }
        const name = nameAt(text, i, text.length);
        if (!name) { i++; continue; }
        const imported = name.name === 'import' ? importedType(text, i) : undefined;
        if (imported) {
            references.push({ ...imported.reference,
                start: expression.start + imported.reference.start,
                end: expression.start + imported.reference.end });
            i = imported.end;
            continue;
        }
        i = name.end;
        // Inline record keys (including optional keys) are not type references.
        const suffix = text.slice(i);
        if (text.slice(0, name.start).trimEnd().endsWith('.') || /^\s*\.(?!\s*<)/.test(suffix) || /^\s*\??\s*:/.test(suffix)) continue;
        references.push({ ...name, start: expression.start + name.start, end: expression.start + name.end });
    }
    return references;
}

// Split only outside records, array/generic brackets, parentheses and strings.
function parts(text: string, start: number, end: number, separators: string): Span[] {
    const result: Span[] = [];
    let depth = 0, first = start;
    for (let i = start; i < end; i++) {
        if (text[i] === '"' || text[i] === "'") i = quotedEnd(text, i, end) - 1;
        else if ('{[(<'.includes(text[i]!)) depth++;
        else if ('}])>'.includes(text[i]!)) depth--;
        else if (depth === 0 && separators.includes(text[i]!)) { result.push({ start: first, end: i }); first = i + 1; }
    }
    result.push({ start: first, end });
    return result;
}

export function parseShape(source: string, expression: Span, comment: Span): Shape {
    const text = source.slice(0, expression.start)
        + expressionText(source, expression) + source.slice(expression.end);
    function parse(start: number, end: number): Shape {
        while (start < end && /\s/.test(text[start]!)) start++;
        while (end > start && /\s/.test(text[end - 1]!)) end--;
        if (start >= end) return { kind: 'unknown' };
        const unions = parts(text, start, end, '|');
        if (unions.length > 1) return { kind: 'multiple', members: unions.map(p => parse(p.start, p.end)) };
        const intersections = parts(text, start, end, '&');
        if (intersections.length > 1) return { kind: 'multiple', members: intersections.map(p => parse(p.start, p.end)) };
        if ('?!'.includes(text[start]!)) return parse(start + 1, end);
        if ('?='.includes(text[end - 1]!)) return parse(start, end - 1);
        if (text[start] === '(' && text[end - 1] === ')') return parse(start + 1, end - 1);
        if (text.slice(end - 2, end) === '[]') return { kind: 'array', element: parse(start, end - 2) };
        const array = /^[Aa]rray\s*\.?\s*</.exec(text.slice(start, end));
        if (array && text[end - 1] === '>') return { kind: 'array', element: parse(start + array[0].length, end - 1) };
        const dictionary = /^(Object|Record)\s*</.exec(text.slice(start, end));
        if (dictionary && text[end - 1] === '>') {
            const arguments_ = parts(text, start + dictionary[0].length, end - 1, ',');
            if (arguments_.length === 2) return { kind: 'dictionary', value: parse(arguments_[1]!.start, arguments_[1]!.end) };
        }
        if (text[start] === '{' && text[end - 1] === '}') {
            const fields: FieldDefinition[] = [];
            let index: Shape | undefined;
            for (const part of parts(text, start + 1, end - 1, ',;')) {
                const signature = /^\s*\[[^\]]+\]\s*:/.exec(text.slice(part.start, part.end));
                if (signature) { index = parse(part.start + signature[0].length, part.end); continue; }
                const key = /^\s*([A-Za-z_$][\w$]*|'[^'\\]*'|"[^"\\]*")\s*\??\s*:/.exec(text.slice(part.start, part.end));
                if (!key) continue; // Dynamic index signatures have no single field definition.
                const quoted = /^["']/.test(key[1]!);
                const keyStart = part.start + key[0].indexOf(key[1]!) + (quoted ? 1 : 0);
                const name = quoted ? key[1]!.slice(1, -1) : key[1]!;
                fields.push({ name, start: keyStart, end: keyStart + name.length,
                    shape: parse(part.start + key[0].length, part.end), commentStart: comment.start, commentEnd: comment.end });
            }
            return { kind: 'record', fields, index };
        }
        const imported = importedType(text.slice(start, end), 0);
        if (imported?.end === end - start) return { kind: 'reference', reference: {
            ...imported.reference, start: start + imported.reference.start, end: start + imported.reference.end,
        } };
        const reference = nameAt(text, start, end);
        return reference?.end === end ? { kind: 'reference', reference } : { kind: 'unknown' };
    }
    return parse(expression.start, expression.end);
}

export function buildTypeIndex(text: string): TypeIndex {
    const index: TypeIndex = { definitions: new Map(), references: [], annotations: [] };
    for (const comment of tokens(text).filter(token => token.kind === 'doc')) {
        let owner: Definition | undefined;
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
            let alias: TypeReference | undefined;
            const shape: Shape = expression ? parseShape(text, expression, comment) : { kind: 'unknown' };
            if (expression) {
                const references = typeReferences(text, expression);
                index.references.push(...references);
                if (references.length === 1) {
                    const body = expressionText(text, expression).trim();
                    if (body === references[0]!.name || importedType(body, 0)?.end === body.length) alias = references[0];
                }
                if (tag[1] === 'typedef' && !definition) {
                    definition = nameAt(text, skipSpace(text, expression.end + 1, end), end);
                }
                const named = /^\[?([A-Za-z_$][\w$]*)/.exec(text.slice(skipSpace(text, expression.end + 1, end), end));
                index.annotations.push({ tag: tag[1]!, name: named?.[1], shape, start: comment.start, end: comment.end });
                if (/^(property|prop)$/.test(tag[1]!) && owner && named) {
                    const fieldStart = skipSpace(text, expression.end + 1, end) + (text[skipSpace(text, expression.end + 1, end)] === '[' ? 1 : 0);
                    const field: FieldDefinition = { name: named[1]!, start: fieldStart, end: fieldStart + named[1]!.length,
                        shape, commentStart: comment.start, commentEnd: comment.end };
                    if (owner.shape.kind !== 'record') owner.shape = { kind: 'record', fields: [] };
                    owner.shape.fields.push(field);
                }
            }
            if (definition) {
                const definitions = index.definitions.get(definition.name) ?? [];
                owner = { ...definition, commentStart: comment.start, commentEnd: comment.end, alias, shape };
                definitions.push(owner);
                index.definitions.set(definition.name, definitions);
            }
        }
    }
    return index;
}

export function referenceAt(index: TypeIndex, offset: number): TypeReference | undefined {
    return index.references.find(item => item.start <= offset && offset <= item.end);
}
