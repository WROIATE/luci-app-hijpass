import { tokens, Token, Span } from './lex';
import { Annotation, Shape, TypeIndex } from './typedefs';

interface Expression { start: number; end: number }
interface ImportedFunction { modulePath: string; name: string }
interface Binding {
    name: string;
    start: number;
    shape?: Shape;
    returns?: Shape;
    imported?: ImportedFunction;
    initializer?: Expression;
    element?: Expression;
}
interface Scope extends Span { bindings: Map<string, Binding> }
export type ValueOrigin = { kind: 'annotation'; shape: Shape } | { kind: 'return'; imported: ImportedFunction };
interface ValuePath { origin: ValueOrigin; path: (string | null)[] }
export interface MemberReference extends Span, ValuePath {}
export interface MemberIndex { members: MemberReference[]; returns: Map<string, Shape> }

// Follow declared annotations through simple aliases, calls and loop values.
// Function bodies and object literals are never used to guess a type.
export function buildMemberIndex(source: string, index: TypeIndex): MemberIndex {
    const all = tokens(source), code = all.filter(t => t.kind !== 'doc');
    const pairs = new Map<number, number>(), stack: number[] = [];
    for (let i = 0; i < code.length; i++) {
        const value = code[i]!.text;
        if ('([{'.includes(value)) stack.push(i);
        else if (')]}'.includes(value)) {
            const start = stack.pop();
            if (start !== undefined && '([{'.indexOf(code[start]!.text) === ')]}'.indexOf(value)) {
                pairs.set(start, i); pairs.set(i, start);
            }
        }
    }
    const scopes: Scope[] = [{ start: 0, end: source.length, bindings: new Map() }];
    const bodies = new Map<number, Scope>();
    for (const [start, end] of pairs) {
        if (start < end && code[start]!.text === '{') {
            const scope = { start: code[start]!.start, end: code[end]!.end, bindings: new Map<string, Binding>() };
            scopes.push(scope); bodies.set(start, scope);
        }
    }
    function containing(position: number): Scope[] {
        return scopes.filter(s => s.start <= position && position < s.end)
            .sort((a, b) => (a.end - a.start) - (b.end - b.start));
    }
    function expressionEnd(start: number): number {
        let i = start;
        for (; i < code.length; i++) {
            if (/^[,;)}\]]$/.test(code[i]!.text)) break;
            const end = pairs.get(i);
            if (end !== undefined && end > i) i = end;
        }
        return code[i]?.start ?? source.length;
    }
    // A for-loop's header declarations must not shadow variables after the loop.
    const loopHeaders = new Map<number, number>();
    for (let i = 0; i < code.length; i++) {
        if (code[i]!.text !== 'for' || code[i + 1]?.text !== '(') continue;
        const close = pairs.get(i + 1);
        if (close === undefined) continue;
        loopHeaders.set(i + 2, close);
        const end = pairs.get(close + 1);
        scopes.push({ start: code[i]!.start, end: end !== undefined ? code[end]!.end : expressionEnd(close + 1), bindings: new Map() });
    }
    function leading(position: number): Annotation[] {
        const docs = all.filter(t => t.kind === 'doc' && t.end <= position);
        const doc = docs[docs.length - 1];
        if (!doc || !/^(?:\s|export\b|default\b)*$/.test(source.slice(doc.end, position))) return [];
        return index.annotations.filter(a => a.start === doc.start);
    }
    function parameters(start: number, end: number): Token[] {
        const result: Token[] = [];
        for (let i = start; i < end; i++) {
            if (code[i]!.kind === 'word' && /^[A-Za-z_$]/.test(code[i]!.text)
                && (i === start || code[i - 1]!.text === ',')) result.push(code[i]!);
            const paired = pairs.get(i);
            if (paired !== undefined && paired > i) i = paired;
        }
        return result;
    }
    const exportedReturns = new Map<string, Shape>();
    for (let i = 0; i < code.length; i++) {
        let params: Token[] = [], body = -1, anchor = code[i]!.start;
        let functionName: Token | undefined;
        if (code[i]!.text === 'function' || code[i]!.text === 'catch') {
            const open = code[i + 1]?.text === '(' ? i + 1 : i + 2;
            const close = code[open]?.text === '(' ? pairs.get(open) : undefined;
            if (close === undefined) continue;
            params = parameters(open + 1, close); body = close + 1;
            if (code[i]!.text === 'function' && open === i + 2) functionName = code[i + 1];
        } else if (code[i]!.text === '=>') {
            const previous = i - 1;
            const open = code[previous]?.text === ')' ? pairs.get(previous) : undefined;
            if (open !== undefined) { params = parameters(open + 1, previous); anchor = code[open]!.start; }
            else if (code[previous]?.kind === 'word') { params = [code[previous]!]; anchor = code[previous]!.start; }
            body = i + 1;
        } else continue;
        const scope = bodies.get(body) ?? { start: code[body]?.start ?? source.length,
            end: expressionEnd(body), bindings: new Map<string, Binding>() };
        if (!bodies.has(body)) scopes.push(scope);
        const annotations = leading(anchor);
        const returns = annotations.find(a => /^(returns|return)$/.test(a.tag))?.shape;
        if (functionName) {
            const binding = { name: functionName.text, start: functionName.start, returns };
            scope.bindings.set(binding.name, binding); // A named function's recursive self-reference.
            if (i === 0 || /^(;|\{|\}|export|default)$/.test(code[i - 1]!.text)) {
                containing(code[i]!.start)[0]!.bindings.set(binding.name, binding);
            }
            if (code[i - 1]?.text === 'export' && returns) exportedReturns.set(functionName.text, returns);
        }
        for (const param of params) {
            const annotation = annotations.find(a => /^(param|arg|argument)$/.test(a.tag) && a.name === param.text);
            scope.bindings.set(param.text, { name: param.text, start: param.start, shape: annotation?.shape });
        }
    }
    // Runtime named imports retain the exported name when locally renamed.
    for (let i = 0; i < code.length; i++) {
        if (code[i]!.text !== 'import' || code[i + 1]?.text !== '{') continue;
        const close = pairs.get(i + 1), module = close === undefined ? undefined : code[close + 2];
        if (close === undefined || code[close + 1]?.text !== 'from' || module?.kind !== 'string'
            || !/^["']/.test(module.text) || module.text.includes('\\')) continue;
        for (let j = i + 2; j < close;) {
            const name = code[j];
            if (name?.kind !== 'word') break;
            const alias = code[j + 1]?.text === 'as' ? code[j + 2] : name;
            if (alias?.kind !== 'word') break;
            scopes[0]!.bindings.set(alias.text, { name: alias.text, start: alias.start,
                imported: { modulePath: module.text.slice(1, -1), name: name.text } });
            j += alias === name ? 1 : 3;
            if (code[j]?.text !== ',') break;
            j++;
        }
    }
    for (let i = 0; i < code.length; i++) {
        if (!/^(let|const)$/.test(code[i]!.text)) continue;
        const annotation = leading(code[i]!.start).find(a => a.tag === 'type');
        let first = true;
        for (let j = i + 1; j < code.length;) {
            const name = code[j];
            if (!name || name.kind !== 'word') break;
            const binding: Binding = { name: name.text, start: name.start, shape: first ? annotation?.shape : undefined };
            containing(name.start)[0]!.bindings.set(name.text, binding);
            first = false; j++;
            const initializer = code[j]?.text === '=' ? j + 1 : undefined;
            for (; j < code.length; j++) {
                if (/^(,|;|in|of|\))$/.test(code[j]!.text)) break;
                const end = pairs.get(j);
                if (end !== undefined && end > j) j = end;
            }
            if (initializer !== undefined) binding.initializer = { start: initializer, end: j };
            const close = loopHeaders.get(i);
            if (code[j]?.text === 'in' && close !== undefined) binding.element = { start: j + 1, end: close };
            if (code[j]?.text !== ',') break;
            j++;
        }
    }
    function bindingAt(name: string, position: number): Binding | undefined {
        for (const scope of containing(position)) {
            const binding = scope.bindings.get(name);
            if (binding) return binding;
        }
    }
    const invalidated = new Map<Binding, number>();
    for (let i = 0; i < code.length; i++) {
        const token = code[i]!;
        if (token.kind !== 'word' || /^(\.|\?\.)$/.test(code[i - 1]?.text ?? '')) continue;
        if (!/^(=|\+=|-=|\*=|\/=|\|\|=|&&=|\?\?=|\+\+|--)$/.test(code[i + 1]?.text ?? '')
            && !/^(\+\+|--)$/.test(code[i - 1]?.text ?? '')) continue;
        const binding = bindingAt(token.text, token.start);
        if (binding && token.start > binding.start && !invalidated.has(binding)) invalidated.set(binding, token.start);
    }
    function rootValue(i: number, visited: Set<Binding>): (ValuePath & { next: number }) | undefined {
        const root = code[i];
        if (root?.kind !== 'word') return;
        const binding = bindingAt(root.text, root.start);
        if (!binding || binding.start > root.start && !binding.returns
            || (invalidated.get(binding) ?? Infinity) < root.start || visited.has(binding) || visited.size >= 128) return;
        if (code[i + 1]?.text === '(') {
            const close = pairs.get(i + 1);
            if (close === undefined) return;
            const origin: ValueOrigin | undefined = binding.returns ? { kind: 'annotation', shape: binding.returns }
                : binding.imported ? { kind: 'return', imported: binding.imported } : undefined;
            return origin ? { origin, path: [], next: close + 1 } : undefined;
        }
        if (binding.shape) return { origin: { kind: 'annotation', shape: binding.shape }, path: [], next: i + 1 };
        const expression = binding.element ?? binding.initializer;
        if (!expression) return;
        const value = expressionValue(expression, new Set(visited).add(binding));
        return value ? { ...value, path: [...value.path, ...(binding.element ? [null] : [])], next: i + 1 } : undefined;
    }
    function accessPath(start: number) {
        const path: (string | null)[] = [];
        const fields: (Span & { path: (string | null)[] })[] = [];
        let j = start;
        for (; j < code.length;) {
            if (/^(\.|\?\.)$/.test(code[j]!.text) && code[j + 1]?.kind === 'word') {
                const field = code[j + 1]!;
                path.push(field.text);
                fields.push({ start: field.start, end: field.end, path: [...path] }); j += 2;
            } else {
                if (code[j]?.text === '?.') j++;
                if (code[j]?.text !== '[') break;
                const end = pairs.get(j);
                if (end === undefined) break;
                const key = code[j + 1];
                if (end === j + 2 && key?.kind === 'string' && /^["']/.test(key.text) && !key.text.includes('\\')) {
                    path.push(key.text.slice(1, -1));
                    fields.push({ start: key.start + 1, end: key.end - 1, path: [...path] });
                } else path.push(null); // An indexed array element, never a guessed record key.
                j = end + 1;
            }
        }
        return { path, fields, next: j };
    }
    function expressionValue(expression: Expression, visited: Set<Binding>): ValuePath | undefined {
        let { start, end } = expression;
        while (code[start]?.text === '(' && pairs.get(start) === end - 1) { start++; end--; }
        const value = rootValue(start, visited);
        if (!value) return;
        const access = accessPath(value.next);
        if (access.next === end) return { origin: value.origin, path: [...value.path, ...access.path] };
    }
    const result: MemberReference[] = [];
    for (let i = 0; i < code.length; i++) {
        if (/^(\.|\?\.)$/.test(code[i - 1]?.text ?? '')) continue;
        const value = rootValue(i, new Set());
        if (!value) continue;
        for (const field of accessPath(value.next).fields) {
            result.push({ start: field.start, end: field.end, origin: value.origin, path: [...value.path, ...field.path] });
        }
    }
    return { members: result, returns: exportedReturns };
}
