const assert = require('node:assert/strict');
const path = require('node:path');
const vscode = require('vscode');

async function definitions(document, word, last = true) {
    const text = document.getText();
    const offset = last ? text.lastIndexOf(word) : text.indexOf(word);
    assert(offset >= 0);
    return await vscode.commands.executeCommand('vscode.executeDefinitionProvider', document.uri, document.positionAt(offset + 1));
}

exports.run = async () => {
    const extension = vscode.extensions.getExtension('hijpass-local.ucode-typedef-navigation');
    assert(extension, 'Packaged extension must be discoverable');
    await extension.activate();
    const companion = vscode.extensions.getExtension('noahbpeterson.ucode-lsp');
    if (process.env.UCODE_LSP_EXTENSION) {
        assert(companion, 'Companion extension must be available in coexistence tests');
        await companion.activate();
    }
    const content = `/** @typedef {{'.name': string, name: string|null}} NodeSection */
/** @param {NodeSection} section */
function nodeFilename(section) { return section.name; };
print(nodeFilename({name: 'example'}));
`;
    const uri = vscode.Uri.file(path.join(process.env.UCODE_TYPEDEF_TEST_DIR, 'fixture.uc'));
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content));
    const document = await vscode.workspace.openTextDocument(uri);
    assert.equal(document.languageId, 'ucode', 'Standalone installation must recognize .uc files');
    await vscode.window.showTextDocument(document);
    const targets = await definitions(document, 'NodeSection');
    assert.equal(targets.length, 1);
    const target = targets[0];
    assert.equal((target.targetUri || target.uri).toString(), document.uri.toString());
    assert.equal(document.getText(target.targetSelectionRange || target.range), 'NodeSection');
    assert.equal((target.targetSelectionRange || target.range).start.line, 0);

    // Verify real VS Code command dispatch, not just a mock provider invocation.
    const editor = vscode.window.activeTextEditor;
    const origin = content.lastIndexOf('NodeSection');
    editor.selection = new vscode.Selection(document.positionAt(origin), document.positionAt(origin + 'NodeSection'.length));
    await vscode.commands.executeCommand('editor.action.revealDefinition');
    assert.equal(vscode.window.activeTextEditor.selection.active.line, 0);

    // An unsaved edit moves both the declaration and the reference. Cached offsets
    // must refresh from the document version, without watching the filesystem.
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, new vscode.Position(0, 0), '// unsaved\n');
    assert(await vscode.workspace.applyEdit(edit));
    const updated = await definitions(document, 'NodeSection');
    assert.equal(updated.length, 1);
    assert.equal((updated[0].targetSelectionRange || updated[0].range).start.line, 1);

    const missing = await vscode.workspace.openTextDocument({ language: 'ucode', content: '/** @param {NodeSection} value */' });
    assert.equal((await definitions(missing, 'NodeSection')).length, 0, 'Types are scoped to the current document');
    const untitled = await vscode.workspace.openTextDocument({ language: 'ucode', content });
    assert.equal((await definitions(untitled, 'NodeSection')).length, 1, 'New untitled documents also work');

    if (companion) {
        // The companion starts its client asynchronously and debounces edits.
        let functions = [];
        for (let attempt = 0; attempt < 60; attempt++) {
            functions = await definitions(document, 'nodeFilename');
            if (functions.some(item => (item.targetSelectionRange || item.range).start.line === 3)) break;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert(functions.some(item => (item.targetSelectionRange || item.range).start.line === 3), JSON.stringify(functions));
    }
    await require('./cross-file.test.cjs').run();
    // Exercise the project's actual aliases and multiline/recursive shared types.
    const projectRoot = path.resolve(__dirname, '../../..', 'root');
    for (const [source, reference, typeFile, name] of [
        ['usr/share/ucode/hijpass/config/paths.uc', 'LogSection} section', 'config.uc', 'LogSection'],
        ['usr/lib/hijpass/service/prepare.uc', 'GeneratedConfigs} generated', 'core.uc', 'GeneratedConfigs'],
        ['usr/share/ucode/hijpass/coreconfig/singbox/protocol/vless.uc', 'VlessProxy} n', 'proxy.uc', 'VlessProxy'],
        ['usr/share/ucode/hijpass/types/core.uc', 'JsonObject|null', 'json.uc', 'JsonObject'],
        ['usr/share/ucode/hijpass/types/proxy.uc', 'ProxyNode[]', 'proxy.uc', 'ProxyNode'],
    ]) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(projectRoot, source)));
        const targets = await definitions(document, reference, false);
        const expected = vscode.Uri.file(path.join(projectRoot, 'usr/share/ucode/hijpass/types', typeFile));
        assert.equal(targets.length, 1, `${source}: ${reference}`);
        assert.equal((targets[0].targetUri || targets[0].uri).toString(), expected.toString());
        const shared = await vscode.workspace.openTextDocument(expected);
        assert.equal(shared.getText(targets[0].targetSelectionRange || targets[0].range), name);
    }
    console.log(`Editor integration passed: definition command, exact target, unsaved changes, file scope${companion ? ', original LSP function navigation' : ', standalone activation'}.`);
};
