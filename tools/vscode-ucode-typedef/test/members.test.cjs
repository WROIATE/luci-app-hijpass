const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTypeIndex } = require('../dist/typedefs');
const { buildMemberIndex } = require('../dist/members');

function members(code) { return buildMemberIndex(code, buildTypeIndex(code)).members; }
function at(code, needle) {
    const offset = code.lastIndexOf(needle);
    assert(offset >= 0, needle);
    return members(code).find(m => m.start <= offset && offset < m.end);
}

test('record and @property fields retain exact multiline UTF-16 declaration ranges', () => {
    const code = `/** 😀\r\n * @typedef {{\r\n * '.name': string,\r\n * child?: {port: integer}\r\n * }} Inline\r\n */
/**
 * @typedef {object} Properties
 * @property {Inline[]} [children]
 */`;
    const index = buildTypeIndex(code);
    const fields = index.definitions.get('Inline')[0].shape.fields;
    assert.deepEqual(fields.map(f => code.slice(f.start, f.end)), ['.name', 'child']);
    assert.equal(fields[1].shape.fields[0].name, 'port');
    const property = index.definitions.get('Properties')[0].shape.fields[0];
    assert.equal(code.slice(property.start, property.end), 'children');
    assert.equal(property.shape.kind, 'array');
});

test('composed, imported, array and dictionary shapes preserve their structure', () => {
    const code = `/** @typedef {import('./shared.uc').Base & {nodes: Array<Base|null>, byID: Object<string, Base>}} Derived */
/** @typedef {{[id: string]: Derived}} Index */`;
    const definitions = buildTypeIndex(code).definitions;
    const shape = definitions.get('Derived')[0].shape;
    assert.equal(shape.kind, 'multiple');
    assert.equal(shape.members[0].reference.modulePath, './shared.uc');
    const fields = shape.members[1].fields;
    assert.equal(fields[0].shape.element.kind, 'multiple');
    assert.equal(fields[1].shape.kind, 'dictionary');
    assert.equal(fields[1].shape.value.reference.name, 'Base');
    assert.equal(definitions.get('Index')[0].shape.index.reference.name, 'Derived');
});

test('typed parameters yield paths through optional access, arrays and quoted keys', () => {
    const code = `/** @param {import('./types.uc').Node} n */
export function use(n) { return n.upstream?.members[0]?.['.name']; }`;
    const reference = at(code, '.name');
    assert.deepEqual(reference.path, ['upstream', 'members', null, '.name']);
    assert.equal(reference.origin.shape.reference.modulePath, './types.uc');
    assert.equal(code.slice(reference.start, reference.end), '.name');
});

test('same parameter names in separate functions retain their own types', () => {
    const code = `/** @param {First} n */
function first(n) { return n.first; }
/** @param {Second} n */
function second(n) { return n.second; }`;
    assert.equal(at(code, 'first;').origin.shape.reference.name, 'First');
    assert.equal(at(code, 'second;').origin.shape.reference.name, 'Second');
});

test('untyped functions, callbacks and catch bindings shadow outer typed parameters', () => {
    const code = `/** @param {Outer} n */
function outer(n) {
    function inner(n) { return n.hidden; }
    map(items, n => n.hidden);
    try {} catch (n) { n.hidden; }
    function capture() { return n.visible; }
    return n.visible;
}`;
    assert.equal(members(code).some(m => m.path[0] === 'hidden'), false);
    assert.equal(members(code).filter(m => m.path[0] === 'visible').length, 2);
});

test('block declarations and loop variables do not escape their scopes', () => {
    const code = `/** @param {Outer} n */
function outer(n) {
    { n.before; let n = other; n.hidden; }
    for (let n in items) { n.hidden; }
    return n.visible;
}`;
    assert.deepEqual(members(code).map(m => m.path), [['visible']]);
});

test('named functions shadow outer typed variables in their lexical scope', () => {
    const code = `/** @type {Node} */
let n = {};
function outer() { n.before; function n() {} n.after; }
let fn = function n() { return n.hidden; };
n.visible;`;
    assert.deepEqual(members(code).map(m => m.path), [['visible']]);
});

test('@type local variables and function expressions use explicit annotations', () => {
    const code = `/** @type {Local} */
let local = {};
local.field;
const fn = /** @param {Argument} n */ function(n) { return n.member; };`;
    assert.equal(at(code, 'field;').origin.shape.reference.name, 'Local');
    assert.equal(at(code, 'member;').origin.shape.reference.name, 'Argument');
});

test('reassignment invalidates a root, while field writes and shadowed writes do not', () => {
    const code = `/** @param {Node} n */
function use(n) {
    n.field = 1;
    { let n = other; n = another; }
    n.before;
    n = other;
    n.after;
}`;
    assert(at(code, 'before;'));
    assert.equal(at(code, 'after;'), undefined);
});

test('template interpolations are code while literals, regexes and comments are opaque', () => {
    const code = '/** @param {Node} n */\nfunction use(n) {\n'
        + '"n.hidden"; /n.hidden/; // n.hidden\n/* n.hidden */\n'
        + 'return `n.hidden ${n.visible} ${`nested ${n.nested}`} ${ /}/.test(n.value) }`;\n}';
    assert.deepEqual(members(code).map(m => m.path[0]), ['visible', 'nested', 'value']);
});

test('unannotated roots and dynamic record keys have no guessed declaration', () => {
    const code = `function plain(n) { return n.field; }
/** @param {Node} n */
function typed(n) { return n[key]; }`;
    assert.equal(members(code).length, 0);
});

test('declared function returns propagate through aliases, projections and loop values', () => {
    const code = `/** @returns {Graph} */
function load() { return arbitrary(); }
let graph = load(), nodes = graph.nodes;
for (let n in nodes) { n.core; }
load().nodes[0].name;`;
    assert.equal(at(code, 'core;').origin.shape.reference.name, 'Graph');
    assert.deepEqual(at(code, 'core;').path, ['nodes', null, 'core']);
    assert.deepEqual(at(code, 'name;').path, ['nodes', null, 'name']);
});

test('named import aliases retain the declared export for return lookup', () => {
    const code = `import { validate, resolve as resolveDependencies } from './dependencies.uc';
let dependencies = resolveDependencies(sections, target);
for (let n in dependencies.nodes) { print(n.core); }`;
    const member = at(code, 'core');
    assert.deepEqual(member.origin, { kind: 'return', imported: { modulePath: './dependencies.uc', name: 'resolve' } });
    assert.deepEqual(member.path, ['nodes', null, 'core']);
});

test('nested loops and key/value loops track values without guessing key fields', () => {
    const code = `/** @param {Graph} graph */
function use(graph) {
    for (let key, n in graph.nodes) {
        key.hidden;
        n.name;
        for (let child in n.members) child.core;
    }
    n.hidden;
}`;
    assert.equal(members(code).some(m => m.path.includes('hidden')), false);
    assert.deepEqual(at(code, 'name;').path, ['nodes', null, 'name']);
    assert.deepEqual(at(code, 'core;').path, ['nodes', null, 'members', null, 'core']);
});

test('inferred values respect reassignment, captured aliases and callable shadowing', () => {
    const code = `import { resolve } from './dependencies.uc';
let graph = resolve();
const saved = graph.nodes;
graph = unknown;
for (let n in saved) n.visible;
for (let n in graph.nodes) n.hidden;
{ let resolve = other; let result = resolve(); result.hidden; }
function inner(resolve) { return resolve().hidden; }
resolve = other;
resolve().hidden;`;
    assert(at(code, 'visible;'));
    assert.equal(members(code).some(m => m.path.includes('hidden')), false);
});

test('cycles, use before declaration and ambiguous initializers have no inferred type', () => {
    const code = `/** @param {Node} node */
function use(node) {
    let cycle = cycle;
    cycle.hidden;
    forward.hidden;
    let forward = node;
    let conditional = flag ? node : other;
    conditional.hidden;
    let alternative = node || other;
    alternative.hidden;
    let literal = {hidden: 1};
    literal.hidden;
}
function unknown() { return {hidden: 1}; }
unknown().hidden;`;
    assert.equal(members(code).some(m => m.path.includes('hidden')), false);
});

test('only named exported functions with declared returns enter the export index', () => {
    const code = `/** @returns {Graph} */
export function resolve() {}
/** @return {Node} */
function local() {}
export function unknown() {}
/** @returns {Other} */
let expression = function named() {};`;
    const result = buildMemberIndex(code, buildTypeIndex(code));
    assert.deepEqual([...result.returns.keys()], ['resolve']);
    assert.equal(result.returns.get('resolve').reference.name, 'Graph');
});
