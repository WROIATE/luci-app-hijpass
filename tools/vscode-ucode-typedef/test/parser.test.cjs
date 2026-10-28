const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildTypeIndex, referenceAt } = require('../dist/typedefs');

function lookup(code, text, occurrence = 'last') {
    const offset = occurrence === 'first' ? code.indexOf(text) : code.lastIndexOf(text);
    assert(offset >= 0, `Missing test reference: ${text}`);
    const index = buildTypeIndex(code);
    const reference = referenceAt(index, offset);
    if (!reference || reference.modulePath !== undefined) return;
    const definitions = index.definitions.get(reference.name);
    return definitions?.length ? { reference, definitions } : undefined;
}

test('the actual path annotations reference shared NodeSection and LogSection definitions', () => {
    const file = path.resolve(__dirname, '../../../root/usr/share/ucode/hijpass/config/paths.uc');
    const code = fs.readFileSync(file, 'utf8');
    for (const name of ['NodeSection', 'LogSection']) {
        const match = lookup(code, name);
        assert.equal(match.definitions.length, 1);
        const alias = match.definitions[0].alias;
        assert.equal(alias.name, name);
        const shared = fs.readFileSync(path.resolve(path.dirname(file), alias.modulePath), 'utf8');
        const targets = buildTypeIndex(shared).definitions.get(name);
        assert.equal(targets.length, 1);
        assert.equal(shared.slice(targets[0].start, targets[0].end), name);
        assert.equal(targets[0].alias, undefined, 'The shared module owns the full shape');
    }
});

test('project type shapes live in dedicated files and every explicit type import resolves', () => {
    const root = path.resolve(__dirname, '../../../root');
    const types = path.join(root, 'usr/share/ucode/hijpass/types') + path.sep;
    function files(directory) {
        return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
            const file = path.join(directory, entry.name);
            return entry.isDirectory() ? files(file) : /\.(uc|ut)$/.test(file) ? [file] : [];
        });
    }
    for (const file of files(root)) {
        const index = buildTypeIndex(fs.readFileSync(file, 'utf8'));
        if (!file.startsWith(types)) {
            for (const definitions of index.definitions.values()) {
                for (const definition of definitions) assert(definition.alias?.modulePath, `${file}: ${definition.name} must reference a shared type`);
            }
        }
        for (const reference of index.references) {
            if (reference.modulePath === undefined) {
                if (/^[A-Z]/.test(reference.name) && reference.name !== 'Object' && reference.name !== 'Array') {
                    assert(index.definitions.has(reference.name), `${file}: unresolved type ${reference.name}`);
                }
                continue;
            }
            assert.match(reference.modulePath, /^\.\.?\//, `${file}: type imports must be relative for navigation`);
            const target = path.resolve(path.dirname(file), reference.modulePath);
            assert(fs.existsSync(target), `${file}: missing ${reference.modulePath}`);
            const definitions = buildTypeIndex(fs.readFileSync(target, 'utf8')).definitions.get(reference.name);
            assert(definitions?.length, `${file}: ${reference.name} missing from ${target}`);
        }
    }
});

test('supports both typedef orders, alias definitions and forward references', () => {
    const code = '/** @param {Alias} value */\n/** @typedef Alias {Record} */\n/** @typedef {object} Record */';
    assert.equal(lookup(code, 'Alias', 'first').definitions[0].start, code.indexOf('Alias {'));
    assert.equal(lookup(code, 'Record', 'first').definitions[0].start, code.lastIndexOf('Record'));
});

for (const tag of ['param', 'arg', 'argument', 'return', 'returns', 'property', 'prop', 'type', 'extends', 'augments']) {
    test(`navigates the type in @${tag}`, () => {
        const code = `/** @typedef {object} Node */\n/** @${tag} {Node|null} value */`;
        assert.equal(lookup(code, 'Node').definitions[0].name, 'Node');
        assert.equal(lookup(code, 'null'), undefined);
    });
}

for (const expression of ['Node[]', '?Node', 'Node=', 'Array<Node>', 'Array.<Node>', 'Node|integer', '(Node|null)[]', '{child: {nodes: Node[]}}', "{'.name': string, node: Node}"]) {
    test(`navigates nested type expression ${expression}`, () => {
        const code = `/** @typedef {object} Node */\n/** @param {${expression}} value */`;
        assert.equal(lookup(code, 'Node').definitions[0].name, 'Node');
    });
}

test('handles multiline records, CRLF and Unicode offsets without changing the source', () => {
    const code = '/** 中文 😀\r\n * @typedef {{\r\n * child: Node\r\n * }} Parent\r\n */\r\n/** @typedef {object} Node */\r\n/**\r\n * @param\r\n * {Parent} value\r\n */';
    assert.equal(lookup(code, 'Node', 'first').definitions[0].start, code.lastIndexOf('Node'));
    assert.equal(lookup(code, 'Parent').definitions[0].start, code.indexOf('Parent'));
});

test('supports dollar/underscore names and multiple definitions without guessing', () => {
    const code = '/** @typedef {object} $Node_1 */\n/** @typedef {string} $Node_1 */\n/** @param {$Node_1} node */';
    assert.equal(lookup(code, '$Node_1').definitions.length, 2);
});

test('does not navigate prose, parameter names, object keys, literals or qualified types', () => {
    const prefix = '/** @typedef {object} Node */\n';
    for (const suffix of [
        '/** Node */', '/** @param {string} Node */', '/** @param {string} value - Node */',
        '/** @param {{Node: string}} value */', '/** @param {{Node?: string}} value */',
        '/** @param {"Node"} value */', '/** @param {other.Node} value */',
        '/** @param {Node.Child} value */', '/** @param {other. Node} value */',
        '/** @param {import("m").Node} value */', '/** @param {import("Node")} value */',
        '/** @param {{node: Node} value */', 'let Node = {};',
    ]) assert.equal(lookup(prefix + suffix, 'Node'), undefined, suffix);
});

test('ignores fake typedefs inside strings, regexes and non-doc comments', () => {
    const fake = '/** @typedef {object} Ghost */';
    for (const statement of [
        `let x = '${fake}';`, `let x = "${fake}";`, 'let x = `' + fake + '`;',
        `// ${fake}`, `/*\n${fake}`, `let x = /[${fake}]/;`,
        `if (ok) /[${fake}]/;`, `let x = /['"\x60]/;`,
    ]) {
        const code = statement + '\n/** @param {Ghost} value */';
        assert.equal(lookup(code, 'Ghost'), undefined, statement);
    }
});

test('strings with escapes and arithmetic do not consume a following real comment', () => {
    for (const statement of ['let x = "a\\\"b";', 'let x = a / b;', 'let x = a / b / c;', 'let x = {} / 2;', 'x++;', 'if (ok) {}']) {
        const code = statement + ' /** @typedef {object} Node */\n/** @param {Node} value */';
        assert.equal(lookup(code, 'Node').definitions[0].name, 'Node', statement);
    }
});

test('missing types and unclosed comments have no target', () => {
    assert.equal(lookup('/** @param {Missing} value */', 'Missing'), undefined);
    assert.equal(lookup('/** @typedef {object} Node */\n/** @param {Node}', 'Node'), undefined);
});

test('lookup accepts the caret at the end of a selected type name', () => {
    const code = '/** @typedef {object} Node */\n/** @param {Node} value */';
    const index = buildTypeIndex(code), start = code.lastIndexOf('Node');
    assert.equal(referenceAt(index, start - 1), undefined);
    assert(referenceAt(index, start + 3));
    assert(referenceAt(index, start + 4));
    assert.equal(referenceAt(index, start + 5), undefined);
});

test('import references retain the exact type-name range and relative module path', () => {
    const code = `/** @typedef {object} LogSection */
/** @param {{logs: import('../shared/types 日志.uc').LogSection[]|null}} value */`;
    const reference = referenceAt(buildTypeIndex(code), code.lastIndexOf('LogSection'));
    assert.equal(reference.name, 'LogSection');
    assert.equal(reference.modulePath, '../shared/types 日志.uc');
    assert.equal(code.slice(reference.start, reference.end), 'LogSection');
    assert.equal(lookup(code, 'LogSection'), undefined, 'An explicit import must not resolve a same-named local type');
});

test('multiline imports and multiple imports in one expression keep their own paths', () => {
    const code = `/** @returns {
 * import(
 *   "./first"
 * ).First | import('./second.uc').Second
 * } */`;
    const index = buildTypeIndex(code);
    assert.equal(referenceAt(index, code.indexOf('First')).modulePath, './first');
    assert.equal(referenceAt(index, code.indexOf('Second')).modulePath, './second.uc');
});

test('only pure local/import aliases are followed, not records, unions or arrays', () => {
    const code = `/** @typedef {import('./types.uc').LogSection} Imported */
/** @typedef {Imported} Alias */
/** @typedef {{log: Imported}} Record */
/** @typedef {Imported|null} Optional */
/** @typedef {Imported[]} Logs */`;
    const definitions = buildTypeIndex(code).definitions;
    assert.equal(definitions.get('Imported')[0].alias.modulePath, './types.uc');
    assert.equal(definitions.get('Alias')[0].alias.name, 'Imported');
    for (const name of ['Record', 'Optional', 'Logs']) {
        assert.equal(definitions.get(name)[0].alias, undefined, name);
    }
});
