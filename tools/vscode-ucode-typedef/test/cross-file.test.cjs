const assert = require('node:assert/strict');
const path = require('node:path');
const vscode = require('vscode');

async function createFile(directory, name, content) {
    const uri = vscode.Uri.file(path.join(directory, name));
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content));
    return vscode.workspace.openTextDocument(uri);
}

async function navigate(document, needle) {
    const offset = document.getText().indexOf(needle);
    assert(offset >= 0, `Missing reference ${needle}`);
    return await vscode.commands.executeCommand('vscode.executeDefinitionProvider', document.uri, document.positionAt(offset + 1));
}

function assertTarget(targets, document, name) {
    assert.equal(targets.length, 1, JSON.stringify(targets));
    const target = targets[0];
    assert.equal((target.targetUri || target.uri).toString(), document.uri.toString());
    const selection = target.targetSelectionRange || target.range;
    assert.equal(document.getText(selection), name);
    assert.equal(document.offsetAt(selection.start), document.getText().indexOf(name));
}

exports.run = async () => {
    const directory = process.env.UCODE_TYPEDEF_TEST_DIR;
    let shared = await createFile(directory, 'shared/types 日志.uc', `/**
 * @typedef {{
 *   '.type': string,
 *   log_enabled: string|null
 * }} LogSection
 */\n`);
    const source = await createFile(directory, 'consumers/client.uc', `/** @typedef {object} LogSection */
/** @typedef {import('../shared/types 日志.uc').LogSection} SharedLog */
/** @typedef {SharedLog} LogAlias */
/** @param {LogAlias} section */
function useAlias(section) { return section; };
/** @returns {{logs: import("../shared/types 日志").LogSection[]}} */
function useDirect() { return {}; };\n`);
    assertTarget(await navigate(source, 'LogAlias} section'), shared, 'LogSection');
    assertTarget(await navigate(source, 'LogSection[]'), shared, 'LogSection');
    await createFile(directory, 'shared/bridge.uc', "/** @typedef {import('./types 日志.uc').LogSection} ExportedLog */\n");
    const indirect = await createFile(directory, 'consumers/indirect.uc', "/** @param {import('../shared/bridge.uc').ExportedLog} section */\n");
    assertTarget(await navigate(indirect, 'ExportedLog} section'), shared, 'LogSection');

    const primitive = await createFile(directory, 'consumers/primitive.uc', '/** @typedef {string} Label */\n/** @param {Label} value */\n');
    assertTarget(await navigate(primitive, 'Label} value'), primitive, 'Label');

    await vscode.window.showTextDocument(source);
    const editor = vscode.window.activeTextEditor;
    const origin = source.getText().indexOf('LogAlias} section');
    editor.selection = new vscode.Selection(source.positionAt(origin), source.positionAt(origin + 'LogAlias'.length));
    await vscode.commands.executeCommand('editor.action.revealDefinition');
    assert.equal(vscode.window.activeTextEditor.document.uri.toString(), shared.uri.toString());

    const moved = new vscode.WorkspaceEdit();
    moved.insert(shared.uri, new vscode.Position(0, 0), '// 未保存 😀\n');
    assert(await vscode.workspace.applyEdit(moved));
    assertTarget(await navigate(source, 'LogAlias} section'), shared, 'LogSection');
    assertTarget(await navigate(indirect, 'ExportedLog} section'), shared, 'LogSection');

    // Shared-file edits must invalidate symbol lookup, not just target offsets.
    const renameType = new vscode.WorkspaceEdit();
    const nameOffset = shared.getText().indexOf('LogSection');
    renameType.replace(shared.uri, new vscode.Range(shared.positionAt(nameOffset), shared.positionAt(nameOffset + 'LogSection'.length)), 'RenamedLog');
    assert(await vscode.workspace.applyEdit(renameType));
    assert.equal((await navigate(source, 'LogSection[]')).length, 0);
    const second = await createFile(directory, 'consumers/second.uc', "/** @param {import('../shared/types 日志.uc').RenamedLog} section */\n");
    assertTarget(await navigate(second, 'RenamedLog}'), shared, 'RenamedLog');

    assert(await shared.save());
    const renamedUri = vscode.Uri.joinPath(shared.uri, '..', 'renamed.uc');
    const renameFile = new vscode.WorkspaceEdit();
    renameFile.renameFile(shared.uri, renamedUri);
    assert(await vscode.workspace.applyEdit(renameFile));
    shared = await vscode.workspace.openTextDocument(renamedUri);
    assert.equal((await navigate(second, 'RenamedLog}')).length, 0, 'The old import path must not retain a stale target');
    const changeImport = new vscode.WorkspaceEdit();
    changeImport.replace(second.uri, new vscode.Range(new vscode.Position(0, 0), second.positionAt(second.getText().length)), "/** @param {import('../shared/renamed.uc').RenamedLog} section */\n");
    assert(await vscode.workspace.applyEdit(changeImport));
    assertTarget(await navigate(second, 'RenamedLog}'), shared, 'RenamedLog');

    for (const [index, expression] of [
        "import('./missing.uc').LogSection", "import('../shared/renamed.uc').Missing",
        "import('fs').LogSection", "import('/tmp/types.uc').LogSection",
        "import('https://example.com/types.uc').LogSection",
    ].entries()) {
        const document = await createFile(directory, `consumers/negative-${index}.uc`, `/** @typedef {object} LogSection */\n/** @param {${expression}} section */`);
        const name = expression.endsWith('.Missing') ? 'Missing}' : 'LogSection}';
        assert.equal((await navigate(document, name)).length, 0, expression);
    }

    await createFile(directory, 'cycle/a.uc', "/** @typedef {import('./b.uc').Loop} Loop */\n");
    await createFile(directory, 'cycle/b.uc', "/** @typedef {import('./a.uc').Loop} Loop */\n");
    const cycle = await createFile(directory, 'cycle/consumer.uc', "/** @param {import('./a.uc').Loop} value */\n");
    let timer;
    try {
        const targets = await Promise.race([
            navigate(cycle, 'Loop}'),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Circular aliases did not terminate')), 3000); }),
        ]);
        assert.equal(targets.length, 0);
    } finally { clearTimeout(timer); }
    console.log('Cross-file integration passed: shared definitions, aliases, nested imports, F12, dirty buffers, type/file rename, missing targets and cycles.');
};
