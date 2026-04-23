const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const _ = require('../../libs/helpers');

describe('libs/helpers.js', () => {
    describe('isNoValue', () => {
        test('true for null and undefined', () => {
            assert.equal(_.isNoValue(null), true);
            assert.equal(_.isNoValue(undefined), true);
        });
        test('false for everything else', () => {
            for (const v of [0, '', 'x', false, true, [], {}, NaN]) {
                assert.equal(_.isNoValue(v), false, `value=${String(v)}`);
            }
        });
    });

    describe('isString', () => {
        test('positive and negative cases', () => {
            assert.equal(_.isString(''), true);
            assert.equal(_.isString('abc'), true);
            assert.equal(_.isString(1), false);
            assert.equal(_.isString(null), false);
            assert.equal(_.isString(new String('x')), false);
        });
    });

    describe('isNumeric', () => {
        test('positive and negative cases', () => {
            assert.equal(_.isNumeric(0), true);
            assert.equal(_.isNumeric(-1.5), true);
            assert.equal(_.isNumeric(NaN), true); // typeof NaN === 'number'
            assert.equal(_.isNumeric('1'), false);
            assert.equal(_.isNumeric(null), false);
        });
    });

    describe('isBoolean', () => {
        test('native only by default', () => {
            assert.equal(_.isBoolean(true), true);
            assert.equal(_.isBoolean(false), true);
            assert.equal(_.isBoolean('yes'), false);
            assert.equal(_.isBoolean(1), false);
        });
        test('smart mode accepts yes/no/on/off/1/0/true/false', () => {
            for (const v of ['yes', 'YES', 'on', 'true', '1', 'no', 'off', 'false', '0']) {
                assert.equal(_.isBoolean(v, true), true, `smart=${v}`);
            }
            assert.equal(_.isBoolean('maybe', true), false);
            assert.equal(_.isBoolean({}, true), false);
        });
    });

    describe('isTRUE', () => {
        test('native true and truthy strings', () => {
            assert.equal(_.isTRUE(true), true);
            assert.equal(_.isTRUE('yes'), true);
            assert.equal(_.isTRUE('YES'), true);
            assert.equal(_.isTRUE('on'), true);
            assert.equal(_.isTRUE('ON'), true);
            assert.equal(_.isTRUE('true'), true);
            assert.equal(_.isTRUE('TRUE'), true);
            assert.equal(_.isTRUE('TruE'), true);
            assert.equal(_.isTRUE('1'), true);
        });
        test('false for everything else', () => {
            for (const v of [false, 'no', 'off', 'false', '0', 'maybe', 0, null, undefined, {}]) {
                assert.equal(_.isTRUE(v), false, `value=${String(v)}`);
            }
        });
    });

    describe('isScalar', () => {
        test('primitives are scalar except undefined and objects', () => {
            assert.equal(_.isScalar('s'), true);
            assert.equal(_.isScalar(5), true);
            assert.equal(_.isScalar(true), true);
            assert.equal(_.isScalar(undefined), false);
            assert.equal(_.isScalar(null), false); // typeof null === 'object'
            assert.equal(_.isScalar({}), false);
            assert.equal(_.isScalar([]), false);
        });
    });

    describe('isArray / isFilledArray', () => {
        test('isArray', () => {
            assert.equal(_.isArray([]), true);
            assert.equal(_.isArray([1]), true);
            assert.equal(_.isArray('x'), false);
            assert.equal(_.isArray({}), false);
        });
        test('isFilledArray', () => {
            assert.equal(_.isFilledArray([]), 0); // returns value.length
            assert.equal(_.isFilledArray([1]), 1);
            assert.equal(_.isFilledArray({}), false);
        });
    });

    describe('isPlainObject / isFilledPlainObject', () => {
        test('isPlainObject true for {}, false for array/null/instance', () => {
            assert.equal(_.isPlainObject({}), true);
            assert.equal(_.isPlainObject({ a: 1 }), true);
            assert.equal(_.isPlainObject([]), false);
            assert.equal(_.isPlainObject(null), false);
            assert.equal(_.isPlainObject(new Date()), false);
        });
        test('isFilledPlainObject requires at least one key', () => {
            assert.equal(_.isFilledPlainObject({}), 0);
            assert.equal(_.isFilledPlainObject({ a: 1 }), 1);
            assert.equal(_.isFilledPlainObject([]), false);
        });
    });

    describe('isFunction', () => {
        test('returns true for functions', () => {
            assert.equal(
                _.isFunction(() => {}),
                true,
            );
            assert.equal(
                _.isFunction(() => {}),
                true,
            );
            assert.equal(
                _.isFunction(async () => {}),
                true,
            );
            assert.equal(_.isFunction({}), false);
        });
    });

    describe('isExists', () => {
        test('path as string', () => {
            const obj = { a: { b: { c: 1, d: null, e: undefined } } };
            assert.equal(_.isExists(obj, 'a.b.c'), true);
            assert.equal(_.isExists(obj, 'a.b.d'), true);
            assert.equal(_.isExists(obj, 'a.b.d'), true);
            assert.equal(_.isExists(obj, 'a.x'), false);
            assert.equal(_.isExists(obj, 'a.b.c.f'), false); // scalar stop
        });
        test('path as array', () => {
            assert.equal(_.isExists({ a: 1 }, ['a']), true);
            assert.equal(_.isExists({ a: 1 }, ['b']), false);
        });
        test('no path returns true (vacuous)', () => {
            assert.equal(_.isExists({ a: 1 }), true);
            assert.equal(_.isExists({ a: 1 }, null), true);
        });
    });

    describe('getValue', () => {
        test('deep path with default', () => {
            const obj = { a: { b: 2 } };
            assert.equal(_.getValue(obj, 'a.b'), 2);
            assert.equal(_.getValue(obj, 'a.x', 'fallback'), 'fallback');
            assert.equal(_.getValue(obj, ['a', 'b']), 2);
        });
        test('scalar interrupt returns default', () => {
            assert.equal(_.getValue({ a: 5 }, 'a.b', 'def'), 'def');
            assert.equal(_.getValue(null, 'a', 'def'), 'def');
        });
        test('missing path with no default is undefined', () => {
            assert.equal(_.getValue({}, 'x.y'), undefined);
        });
    });

    describe('getType / TYPES', () => {
        test('classifies values correctly', () => {
            assert.equal(_.getType('s'), _.TYPES.SCALAR);
            assert.equal(_.getType(5), _.TYPES.SCALAR);
            assert.equal(_.getType(true), _.TYPES.SCALAR);
            assert.equal(_.getType(null), _.TYPES.EMPTY);
            assert.equal(_.getType(undefined), _.TYPES.EMPTY);
            assert.equal(_.getType([]), _.TYPES.ARRAY);
            assert.equal(_.getType({}), _.TYPES.OBJECT);
            assert.equal(_.getType(new Date()), _.TYPES.UNKNOWN);
        });
        test('TYPES is frozen', () => {
            assert.equal(Object.isFrozen(_.TYPES), true);
            assert.equal(_.TYPES.SCALAR, 1);
            assert.equal(_.TYPES.EMPTY, 2);
            assert.equal(_.TYPES.ARRAY, 3);
            assert.equal(_.TYPES.OBJECT, 4);
            assert.equal(_.TYPES.UNKNOWN, 5);
        });
    });

    describe('onlyProps', () => {
        test('keeps only whitelisted keys', () => {
            const r = _.onlyProps({ a: 1, b: 2, c: 3 }, ['a', 'c', 'zzz']);
            assert.deepEqual(r, { a: 1, c: 3 });
        });
        test('returns null for empty input or empty prop list', () => {
            assert.equal(_.onlyProps({}, ['a']), null);
            assert.equal(_.onlyProps({ a: 1 }, []), null);
            assert.equal(_.onlyProps(null, ['a']), null);
        });
    });

    describe('randomString', () => {
        test('default length is 10', () => {
            assert.equal(_.randomString().length, 10);
        });
        test('respects length and uses alphanumeric charset', () => {
            const s = _.randomString(64);
            assert.equal(s.length, 64);
            assert.match(s, /^[a-zA-Z0-9]+$/);
        });
        test('zero-length returns empty string', () => {
            assert.equal(_.randomString(0), '');
        });
    });

    describe('sort', () => {
        test('numeric strings come first, in numeric order', () => {
            const r = _.sort(['banana', '10', '2', 'apple', '1']);
            assert.deepEqual(r, ['1', '2', '10', 'apple', 'banana']);
        });
        test('all numeric', () => {
            assert.deepEqual(_.sort(['10', '2', '1']), ['1', '2', '10']);
        });
        test('all lexical', () => {
            assert.deepEqual(_.sort(['b', 'a', 'c']), ['a', 'b', 'c']);
        });
        test('empty array', () => {
            assert.deepEqual(_.sort([]), []);
        });
        test('stable for equal keys', () => {
            const r = _.sort(['a', 'a']);
            assert.deepEqual(r, ['a', 'a']);
        });
    });
});
