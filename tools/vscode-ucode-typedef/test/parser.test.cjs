const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildTypeIndex, lookupType } = require('../dist/typedefs');

function lookup(code, text, occurrence = 'last') {
    const offset = occurrence === 'first' ? code.indexOf(text) : code.lastIndexOf(text);
    assert(offset >= 0, `Missing test reference: ${text}`);
    return lookupType(buildTypeIndex(code), offset);
}

test('the actual NodeSection and LogSection annotations jump to their exact definitions', () => {
    const code = fs.readFileSync(path.resolve(__dirname, '../../../root/usr/share/ucode/hijpass/config/paths.uc'), 'utf8');
    for (const name of ['NodeSection', 'LogSection']) {
        const match = lookup(code, name);
        assert.equal(match.definitions.length, 1);
        const target = match.definitions[0];
        assert.equal(code.slice(target.start, target.end), name);
        assert.equal(target.start, code.indexOf(name));
        assert(code.slice(target.commentStart, target.commentEnd).includes('@typedef'));
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
    assert.equal(lookupType(index, start - 1), undefined);
    assert(lookupType(index, start + 3));
    assert(lookupType(index, start + 4));
    assert.equal(lookupType(index, start + 5), undefined);
});
