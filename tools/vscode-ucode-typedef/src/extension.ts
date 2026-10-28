import * as vscode from 'vscode';
import { buildTypeIndex, referenceAt, Definition, FieldDefinition, Shape, TypeIndex, TypeReference } from './typedefs';
import { buildMemberIndex, MemberIndex } from './members';
import { Span } from './lex';

interface Target { document: vscode.TextDocument; definition: Definition | FieldDefinition }

async function openImport(document: vscode.TextDocument, modulePath: string, cancellation: vscode.CancellationToken) {
    if (document.uri.scheme === 'untitled' || !/^\.\.?\//.test(modulePath) || /[\\\x00\r\n]/.test(modulePath)) return;
    const paths = modulePath.endsWith('.uc') ? [modulePath] : [modulePath + '.uc', modulePath];
    for (const path of paths) {
        if (cancellation.isCancellationRequested) return;
        try {
            return await vscode.workspace.openTextDocument(vscode.Uri.joinPath(document.uri, '..', path));
        } catch {
            // A missing/unreadable import has no definition to navigate to.
        }
    }
}

function range(document: vscode.TextDocument, start: number, end: number): vscode.Range {
    return new vscode.Range(document.positionAt(start), document.positionAt(end));
}

export function activate(context: vscode.ExtensionContext): void {
    const cache = new WeakMap<vscode.TextDocument, { version: number; index: TypeIndex; values?: MemberIndex }>();

    function indexFor(document: vscode.TextDocument): TypeIndex {
        let entry = cache.get(document);
        if (!entry || entry.version !== document.version) {
            entry = { version: document.version, index: buildTypeIndex(document.getText()) };
            cache.set(document, entry);
        }
        return entry.index;
    }

    function valuesFor(document: vscode.TextDocument): MemberIndex {
        const index = indexFor(document), entry = cache.get(document)!;
        return entry.values ??= buildMemberIndex(document.getText(), index);
    }

    async function resolve(document: vscode.TextDocument, reference: TypeReference,
        visited: Set<string>, cancellation: vscode.CancellationToken): Promise<Target[]> {
        if (cancellation.isCancellationRequested) return [];
        const targetDocument = reference.modulePath === undefined ? document
            : await openImport(document, reference.modulePath, cancellation);
        if (!targetDocument || cancellation.isCancellationRequested) return [];
        const key = targetDocument.uri.toString() + '\0' + reference.name;
        if (visited.has(key)) return [];
        const nextVisited = new Set(visited).add(key);
        const definitions = indexFor(targetDocument).definitions.get(reference.name) ?? [];
        const targets: Target[] = [];
        for (const definition of definitions) {
            if (definition.alias && (definition.alias.modulePath !== undefined || indexFor(targetDocument).definitions.has(definition.alias.name))) {
                targets.push(...await resolve(targetDocument, definition.alias, nextVisited, cancellation));
            } else targets.push({ document: targetDocument, definition });
        }
        return targets;
    }

    async function resolveField(document: vscode.TextDocument, shape: Shape, path: (string | null)[],
        visited: Set<string>, cancellation: vscode.CancellationToken): Promise<Target[]> {
        if (cancellation.isCancellationRequested || path.length === 0) return [];
        if (shape.kind === 'reference') {
            const reference = shape.reference;
            const target = reference.modulePath === undefined ? document : await openImport(document, reference.modulePath, cancellation);
            if (!target) return [];
            const key = target.uri.toString() + '\0' + reference.name + '\0' + JSON.stringify(path);
            if (visited.has(key)) return [];
            visited.add(key);
            const targets: Target[] = [];
            for (const definition of indexFor(target).definitions.get(reference.name) ?? []) {
                targets.push(...await resolveField(target, definition.shape, path, visited, cancellation));
            }
            return targets;
        }
        if (shape.kind === 'multiple') {
            const targets: Target[] = [];
            for (const member of shape.members) targets.push(...await resolveField(document, member, path, visited, cancellation));
            return targets;
        }
        if (shape.kind === 'array') return path[0] === null
            ? resolveField(document, shape.element, path.slice(1), visited, cancellation) : [];
        if (shape.kind === 'dictionary') return resolveField(document, shape.value, path.slice(1), visited, cancellation);
        if (shape.kind !== 'record') return [];
        const targets: Target[] = [];
        const fields = shape.fields.filter(f => f.name === path[0]);
        for (const field of fields) {
            targets.push(...path.length === 1 ? [{ document, definition: field }]
                : await resolveField(document, field.shape, path.slice(1), visited, cancellation));
        }
        if (!fields.length && shape.index) return resolveField(document, shape.index, path.slice(1), visited, cancellation);
        return targets;
    }

    context.subscriptions.push(vscode.languages.registerDefinitionProvider('ucode', {
        async provideDefinition(document, position, cancellation) {
            if (cancellation.isCancellationRequested) return;
            const index = indexFor(document), offset = document.offsetAt(position);
            const reference = referenceAt(index, offset);
            let origin: Span, targets: Target[];
            if (reference) {
                origin = reference;
                targets = await resolve(document, reference, new Set(), cancellation);
            }
            else {
                const member = valuesFor(document).members.find(m => m.start <= offset && offset <= m.end);
                if (!member) return;
                origin = member;
                const value = member.origin;
                if (value.kind === 'annotation') {
                    targets = await resolveField(document, value.shape, member.path, new Set(), cancellation);
                } else {
                    const imported = await openImport(document, value.imported.modulePath, cancellation);
                    const shape = imported && valuesFor(imported).returns.get(value.imported.name);
                    targets = imported && shape
                        ? await resolveField(imported, shape, member.path, new Set(), cancellation) : [];
                }
            }
            if (cancellation.isCancellationRequested) return;
            const unique = new Map(targets.map(t => [t.document.uri.toString() + '\0' + t.definition.start, t]));
            return [...unique.values()].map(target => ({
                originSelectionRange: range(document, origin.start, origin.end),
                targetUri: target.document.uri,
                targetRange: range(target.document, target.definition.commentStart, target.definition.commentEnd),
                targetSelectionRange: range(target.document, target.definition.start, target.definition.end),
            }));
        },
    }));
}
