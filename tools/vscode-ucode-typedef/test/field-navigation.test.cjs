const assert = require('node:assert/strict');
const path = require('node:path');
const vscode = require('vscode');

async function file(name, content) {
    const uri = vscode.Uri.file(path.join(process.env.UCODE_TYPEDEF_TEST_DIR, 'fields', name));
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content));
    return vscode.workspace.openTextDocument(uri);
}

async function navigate(document, expression, field) {
    const start = document.getText().indexOf(expression);
    assert(start >= 0, `Missing ${expression}`);
    return await vscode.commands.executeCommand('vscode.executeDefinitionProvider', document.uri,
        document.positionAt(start + expression.lastIndexOf(field) + 1));
}

function assertField(targets, document, name, declaration) {
    assert.equal(targets.length, 1, JSON.stringify(targets));
    assert.equal((targets[0].targetUri || targets[0].uri).toString(), document.uri.toString());
    const selection = targets[0].targetSelectionRange || targets[0].range;
    assert.equal(document.getText(selection), name);
    if (declaration) {
        assert.equal(document.offsetAt(selection.start), document.getText().indexOf(declaration));
    }
}

exports.run = async () => {
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.join(process.env.UCODE_TYPEDEF_TEST_DIR, 'fields')));
    const shared = await file('types.uc', `/**
 * @typedef {object} Log
 * @property {string} label
 * @property {string} [path]
 */
/**
 * @typedef {{
 *   '.name': string,
 *   log: Log,
 *   children: Node[],
 *   upstream: Node|null
 * }} Node
 */
/** @typedef {Node & {active: boolean}} Extended */
/** @typedef {Node|Extended} NodeUnion */
/** @typedef {{nodes: Object<string, Node>, byID: {[key: string]: Node}}} Graph */
/** @typedef {CycleB} CycleA */
/** @typedef {CycleA} CycleB */
`);
    const source = await file('consumer.uc', `/** @typedef {import('./types.uc').Extended} Extended */
/** @typedef {import('./types.uc').Graph} Graph */
/** @param {Extended} section */
export function read(section) {
    print(section['.name']);
    print(section?.log?.label);
    print(section.children[0].upstream.log.path);
    return section.upstream?.['.name'];
}
/** @param {import('./types.uc').NodeUnion} section */
function union(section) { return section.log.label; }
/** @param {Extended} section */
function shadow(section) {
    { let section = {}; section.nope; }
    map(items, section => section.nope);
    return section.nonexistent;
}
/** @type {Graph} */
let graph = {};
graph.nodes[id].log.label;
graph.byID[id]['.name'];
/** @param {import('./types.uc').CycleA} cycle */
function cyclic(cycle) { return cycle.missing; }
`);
    for (const [expression, name, declaration] of [
        ["section['.name']", '.name', '.name'],
        ['section?.log?.label', 'label', 'label'],
        ['section.children[0].upstream.log.path', 'path', 'path'],
        ["section.upstream?.['.name']", '.name', '.name'],
        ['section.log.label', 'label', 'label'],
        ['graph.nodes[id].log.label', 'label', 'label'],
        ["graph.byID[id]['.name']", '.name', '.name'],
    ]) assertField(await navigate(source, expression, name), shared, name, declaration);

    for (const expression of ['section.nope', 'section.nonexistent', 'cycle.missing']) {
        assert.equal((await navigate(source, expression, expression.split('.').pop())).length, 0, expression);
    }
    // Verify VS Code's real F12 command lands on the field line.
    await vscode.window.showTextDocument(source);
    const offset = source.getText().indexOf('section?.log?.label') + 'section?.log?.'.length;
    vscode.window.activeTextEditor.selection = new vscode.Selection(source.positionAt(offset), source.positionAt(offset + 5));
    await vscode.commands.executeCommand('editor.action.revealDefinition');
    assert.equal(vscode.window.activeTextEditor.document.uri.toString(), shared.uri.toString());
    assert.equal(vscode.window.activeTextEditor.selection.active.line, 2);

    const move = new vscode.WorkspaceEdit();
    move.insert(shared.uri, new vscode.Position(0, 0), '// 未保存 😀\n');
    assert(await vscode.workspace.applyEdit(move));
    assertField(await navigate(source, 'section?.log?.label', 'label'), shared, 'label', 'label');
    const rename = new vscode.WorkspaceEdit();
    const label = shared.getText().indexOf('label');
    rename.replace(shared.uri, new vscode.Range(shared.positionAt(label), shared.positionAt(label + 5)), 'title');
    assert(await vscode.workspace.applyEdit(rename));
    assert.equal((await navigate(source, 'section?.log?.label', 'label')).length, 0);
    const consumerEdit = new vscode.WorkspaceEdit();
    const usage = source.getText().indexOf('section?.log?.label') + 'section?.log?.'.length;
    consumerEdit.replace(source.uri, new vscode.Range(source.positionAt(usage), source.positionAt(usage + 5)), 'title');
    assert(await vscode.workspace.applyEdit(consumerEdit));
    assertField(await navigate(source, 'section?.log?.title', 'title'), shared, 'title', 'title');

    const root = path.resolve(__dirname, '../../../root/usr/share/ucode/hijpass');
    for (const [sourcePath, expression, fieldName, typeFile] of [
        ['config/paths.uc', 'section.log_enabled', 'log_enabled', 'config.uc'],
        ['coreconfig/xray/protocol/transport.uc', 'n.transport_type', 'transport_type', 'proxy.uc'],
        ['coreconfig/singbox/routing.uc', 'settings.entries', 'entries', 'routing.uc'],
        ['coreconfig/singbox/routing.uc', 'dependencies.nodes', 'nodes', 'proxy.uc'],
        ['coreconfig/singbox/config.uc', 'n.members', 'members', 'proxy.uc'],
        ['coreconfig/singbox/config.uc', 'n.upstream.name', 'name', 'proxy.uc'],
    ]) {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root, sourcePath)));
        const types = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root, 'types', typeFile)));
        assertField(await navigate(document, expression, fieldName), types, fieldName);
    }
    console.log('Field integration passed: exact declarations, nested/optional/array/dictionary access, inherited/union types, scope, F12, dirty edits, cycles and real project fields.');
};
