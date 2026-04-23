import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    addToSignature,
    flatten,
    normalizeChat,
    normalizeData,
    normalizeParticipant,
    packObjectForSignature,
    strRandom,
} from '../../src/libs/signing';
import { stubMathRandom } from '../helpers/seededRandom';

describe('libs/signing', () => {
    describe('strRandom', () => {
        test('default length is 10, only alphanumeric', () => {
            const s = strRandom();
            assert.equal(s.length, 10);
            assert.match(s, /^[a-zA-Z0-9]+$/);
        });
        test('respects requested length', () => {
            assert.equal(strRandom(0), '');
            assert.equal(strRandom(32).length, 32);
        });
        test('deterministic with stubbed Math.random', () => {
            const restore = stubMathRandom([0, 0, 0]);
            try {
                assert.equal(strRandom(3), 'aaa');
            } finally {
                restore();
            }
        });
    });

    describe('flatten', () => {
        test('flat object returns identity keys', () => {
            assert.deepEqual(flatten({ a: 1, b: 'x' }), { a: 1, b: 'x' });
        });
        test('nested object uses bracket notation', () => {
            assert.deepEqual(flatten({ user: { id: 'u1', name: 'N' } }), { 'user[id]': 'u1', 'user[name]': 'N' });
        });
        test('two-level nesting', () => {
            assert.deepEqual(flatten({ a: { b: { c: 7 } } }), { 'a[b][c]': 7 });
        });
        test('empty object yields empty output', () => {
            assert.deepEqual(flatten({}), {});
        });
        test('empty nested object is dropped (no key emitted)', () => {
            assert.deepEqual(flatten({ a: {}, b: 1 }), { b: 1 });
        });
        test('arrays are treated as objects with numeric keys', () => {
            assert.deepEqual(flatten({ tags: ['red', 'blue'] }), { 'tags[0]': 'red', 'tags[1]': 'blue' });
        });
        test('null nested value is emitted as-is (not recursed)', () => {
            assert.deepEqual(flatten({ x: null }), { x: null });
        });
    });

    describe('normalizeData', () => {
        test('throws when data is not a plain object', () => {
            assert.throws(() => normalizeData('nope'), /plain object/);
            assert.throws(() => normalizeData(null), /plain object/);
            assert.throws(() => normalizeData([]), /plain object/);
        });
        test('returns copy of data when filter is empty', () => {
            const input = { a: 1, b: 2 };
            const out = normalizeData(input);
            assert.deepEqual(out, { a: 1, b: 2 });
            assert.notEqual(out, input);
        });
        test('array filter keeps only whitelisted keys', () => {
            const out = normalizeData({ a: 1, b: 2, c: 3 }, ['a', 'c', 'zz']);
            assert.deepEqual(out, { a: 1, c: 3 });
        });
        test('object filter with default fills missing keys', () => {
            const out = normalizeData({ a: 1 }, { a: null, b: { default: 'B' } });
            assert.deepEqual(out, { a: 1, b: 'B' });
        });
        test('object filter without default skips missing keys', () => {
            const out = normalizeData({ a: 1 }, { a: null, missing: null });
            assert.deepEqual(out, { a: 1 });
        });
        test('process function can transform values', () => {
            const out = normalizeData({ n: 3 }, { n: { process: (v) => (v as number) * 10 } });
            assert.deepEqual(out, { n: 30 });
        });
        test('process returning undefined drops the key', () => {
            const out = normalizeData({ n: 3 }, { n: { process: () => undefined } });
            assert.deepEqual(out, {});
        });
        test('trims string values', () => {
            const out = normalizeData({ name: '  hi  ', n: 5 }, ['name', 'n']);
            assert.deepEqual(out, { name: 'hi', n: 5 });
        });
        test('trims default string value too', () => {
            const out = normalizeData({}, { title: { default: '  default  ' } });
            assert.deepEqual(out, { title: 'default' });
        });
    });

    describe('normalizeChat / normalizeParticipant', () => {
        test('normalizeChat picks only allowed chat fields', () => {
            const out = normalizeChat({ id: 'c1', title: 'T', type: 'group', bogus: 'x', metadata: { a: '1' } });
            assert.deepEqual(out, { id: 'c1', title: 'T', type: 'group', metadata: { a: '1' } });
        });
        test('normalizeParticipant applies is_bot default', () => {
            const out = normalizeParticipant({ id: 'p1', name: 'P' });
            assert.deepEqual(out, { id: 'p1', name: 'P', is_bot: false });
        });
        test('normalizeParticipant keeps optional fields when provided', () => {
            const out = normalizeParticipant({
                id: 'p1',
                name: 'P',
                email: 'e@x',
                picture: 'https://p',
                link: 'https://l',
                is_bot: true,
            });
            assert.deepEqual(out, {
                id: 'p1',
                name: 'P',
                email: 'e@x',
                picture: 'https://p',
                link: 'https://l',
                is_bot: true,
            });
        });
    });

    describe('packObjectForSignature', () => {
        test('sorted dot-notation key=value strings', () => {
            const r = packObjectForSignature({ b: 2, a: 1 }, 'root');
            assert.deepEqual(r, ['root.a=1', 'root.b=2']);
        });
        test('numeric keys sort numerically before lexical', () => {
            const r = packObjectForSignature({ 10: 'x', 2: 'y', a: 'z' }, 'k');
            assert.deepEqual(r, ['k.2=y', 'k.10=x', 'k.a=z']);
        });
        test('empty key omits the leading prefix', () => {
            const r = packObjectForSignature({ b: 2, a: 1 }, '');
            assert.deepEqual(r, ['a=1', 'b=2']);
        });
        test('empty object yields empty array', () => {
            assert.deepEqual(packObjectForSignature({}, 'k'), []);
        });
    });

    describe('addToSignature', () => {
        test('canonical (sorted) order when no filterKeys', () => {
            const out = addToSignature(['seed'], { b: 2, a: 1 });
            assert.deepEqual(out, ['seed', 1, 2]);
        });
        test('filterKeys enforces explicit order and limits keys', () => {
            const out = addToSignature(['seed'], { a: 1, b: 2, c: 3 }, ['c', 'a']);
            assert.deepEqual(out, ['seed', 3, 1]);
        });
        test('unknown filter key is skipped', () => {
            const out = addToSignature([], { a: 1 }, ['zzz', 'a']);
            assert.deepEqual(out, [1]);
        });
        test('object value is flattened via packObjectForSignature', () => {
            const out = addToSignature([], { rights: { send_messages: '1', edit_messages: 'my' } }, ['rights']);
            assert.deepEqual(out, ['rights.edit_messages=my', 'rights.send_messages=1']);
        });
        test('array/unknown values are skipped (neither SCALAR nor OBJECT)', () => {
            const out = addToSignature([], { a: 1, arr: [1, 2], u: undefined });
            assert.deepEqual(out, [1]);
        });
        test('empty data returns signature unchanged (copied)', () => {
            const seed = ['x'];
            const out = addToSignature(seed, {});
            assert.deepEqual(out, ['x']);
            assert.notEqual(out, seed);
        });
        test('input signature is not mutated', () => {
            const seed = ['x'];
            addToSignature(seed, { a: 1 });
            assert.deepEqual(seed, ['x']);
        });
    });
});
