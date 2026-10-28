import * as vscode from 'vscode';
import { buildTypeIndex, referenceAt, Definition, TypeIndex, TypeReference } from './typedefs';

interface Target { document: vscode.TextDocument; definition: Definition }

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
    const cache = new WeakMap<vscode.TextDocument, { version: number; index: TypeIndex }>();

    function indexFor(document: vscode.TextDocument): TypeIndex {
        let entry = cache.get(document);
        if (!entry || entry.version !== document.version) {
            entry = { version: document.version, index: buildTypeIndex(document.getText()) };
            cache.set(document, entry);
        }
        return entry.index;
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

    context.subscriptions.push(vscode.languages.registerDefinitionProvider('ucode', {
        async provideDefinition(document, position, cancellation) {
            if (cancellation.isCancellationRequested) return;
            const reference = referenceAt(indexFor(document), document.offsetAt(position));
            if (!reference) return;
            const targets = await resolve(document, reference, new Set(), cancellation);
            if (cancellation.isCancellationRequested) return;
            return targets.map(target => ({
                originSelectionRange: range(document, reference.start, reference.end),
                targetUri: target.document.uri,
                targetRange: range(target.document, target.definition.commentStart, target.definition.commentEnd),
                targetSelectionRange: range(target.document, target.definition.start, target.definition.end),
            }));
        },
    }));
}
