import * as vscode from 'vscode';
import { buildTypeIndex, lookupType, TypeIndex } from './typedefs';

export function activate(context: vscode.ExtensionContext): void {
    const cache = new WeakMap<vscode.TextDocument, { version: number; index: TypeIndex }>();
    context.subscriptions.push(vscode.languages.registerDefinitionProvider('ucode', {
        provideDefinition(document, position, cancellation) {
            if (cancellation.isCancellationRequested) return;
            let entry = cache.get(document);
            if (!entry || entry.version !== document.version) {
                entry = { version: document.version, index: buildTypeIndex(document.getText()) };
                cache.set(document, entry);
            }
            const match = lookupType(entry.index, document.offsetAt(position));
            if (!match || cancellation.isCancellationRequested) return;
            const range = (start: number, end: number) =>
                new vscode.Range(document.positionAt(start), document.positionAt(end));
            return match.definitions.map(definition => ({
                originSelectionRange: range(match.reference.start, match.reference.end),
                targetUri: document.uri,
                targetRange: range(definition.commentStart, definition.commentEnd),
                targetSelectionRange: range(definition.start, definition.end),
            }));
        },
    }));
}
