import { tokens, Token, Span } from './lex';
import { Annotation, Shape, TypeIndex } from './typedefs';

interface Binding { name: string; start: number; shape?: Shape }
interface Scope extends Span { bindings: Map<string, Binding> }
export interface MemberReference extends Span { shape: Shape; path: (string | null)[] }

// This is deliberately limited to declared @param/@type roots. It does not
// guess types from names or run a second general-purpose type checker.
export function buildMemberReferences(source: string, index: TypeIndex): MemberReference[] {
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
    for (let i = 0; i < code.length; i++) {
        if (code[i]!.text !== 'for' || code[i + 1]?.text !== '(') continue;
        const close = pairs.get(i + 1);
        if (close === undefined) continue;
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
        if (functionName) {
            const binding = { name: functionName.text, start: functionName.start };
            scope.bindings.set(binding.name, binding); // A named function's recursive self-reference.
            if (i === 0 || /^(;|\{|\}|export|default)$/.test(code[i - 1]!.text)) {
                containing(code[i]!.start)[0]!.bindings.set(binding.name, binding);
            }
        }
        const annotations = leading(anchor);
        for (const param of params) {
            const annotation = annotations.find(a => /^(param|arg|argument)$/.test(a.tag) && a.name === param.text);
            scope.bindings.set(param.text, { name: param.text, start: param.start, shape: annotation?.shape });
        }
    }
    for (let i = 0; i < code.length; i++) {
        if (!/^(let|const)$/.test(code[i]!.text)) continue;
        const annotation = leading(code[i]!.start).find(a => a.tag === 'type');
        let first = true;
        for (let j = i + 1; j < code.length;) {
            const name = code[j];
            if (!name || name.kind !== 'word') break;
            containing(name.start)[0]!.bindings.set(name.text, { name: name.text, start: name.start, shape: first ? annotation?.shape : undefined });
            first = false; j++;
            for (; j < code.length; j++) {
                if (/^(,|;|in|of|\))$/.test(code[j]!.text)) break;
                const end = pairs.get(j);
                if (end !== undefined && end > j) j = end;
            }
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
        if (binding?.shape && token.start > binding.start && !invalidated.has(binding)) invalidated.set(binding, token.start);
    }
    const result: MemberReference[] = [];
    for (let i = 0; i < code.length; i++) {
        const root = code[i]!;
        if (root.kind !== 'word' || /^(\.|\?\.)$/.test(code[i - 1]?.text ?? '')) continue;
        const binding = bindingAt(root.text, root.start);
        if (!binding?.shape || binding.start > root.start) continue;
        // Reassignment makes a declared root unreliable. Shadowed variables are
        // distinct bindings, and do not invalidate the outer root.
        if ((invalidated.get(binding) ?? Infinity) < root.start) continue;
        const path: (string | null)[] = [];
        for (let j = i + 1; j < code.length;) {
            if (/^(\.|\?\.)$/.test(code[j]!.text) && code[j + 1]?.kind === 'word') {
                const field = code[j + 1]!;
                path.push(field.text);
                result.push({ start: field.start, end: field.end, shape: binding.shape, path: [...path] }); j += 2;
            } else {
                if (code[j]?.text === '?.') j++;
                if (code[j]?.text !== '[') break;
                const end = pairs.get(j);
                if (end === undefined) break;
                const key = code[j + 1];
                if (end === j + 2 && key?.kind === 'string' && /^["']/.test(key.text) && !key.text.includes('\\')) {
                    path.push(key.text.slice(1, -1));
                    result.push({ start: key.start + 1, end: key.end - 1, shape: binding.shape, path: [...path] });
                } else path.push(null); // An indexed array element, never a guessed record key.
                j = end + 1;
            }
        }
    }
    return result;
}
