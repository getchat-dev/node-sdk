const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const processUserRights = require('../../libs/processUserRights');
const scheme = require('../../libs/rights.scheme.json');

const BOOLEAN_RIGHTS = Object.keys(scheme).filter(k => scheme[k].type === 'boolean');
const ENUM_RIGHTS = Object.keys(scheme).filter(k => scheme[k].type === 'enum');

describe('libs/processUserRights.js', () => {

    test('returns null for empty input', () => {
        assert.equal(processUserRights({}), null);
        assert.equal(processUserRights(), null);
    });

    test('drops unknown keys', () => {
        assert.equal(processUserRights({ bogus_right: '1' }), null);
        assert.deepEqual(
            processUserRights({ send_messages: true, bogus_right: 'x' }),
            { send_messages: '1' }
        );
    });

    describe('boolean rights (14 total)', () => {
        test(`all 14 schema rights of type=boolean are covered`, () => {
            assert.equal(BOOLEAN_RIGHTS.length, 14);
        });

        for (const right of BOOLEAN_RIGHTS) {
            test(`${right}: truthy → '1', falsy → '0'`, () => {
                for (const v of [true, '1', 'yes', 'YES', 'on', 'true', 'TRUE']) {
                    const r = processUserRights({ [right]: v });
                    assert.deepEqual(r, { [right]: '1' }, `truthy=${v}`);
                }
                for (const v of [false, '0', 'no', 'off', 'false', 'anything-else']) {
                    const r = processUserRights({ [right]: v });
                    assert.deepEqual(r, { [right]: '0' }, `falsy=${v}`);
                }
            });
        }
    });

    describe('enum rights (3 total)', () => {
        test(`all 3 schema rights of type=enum are covered`, () => {
            assert.equal(ENUM_RIGHTS.length, 3);
        });

        test('edit_messages accepts none/my/any, drops bogus', () => {
            assert.deepEqual(processUserRights({ edit_messages: 'none' }), { edit_messages: 'none' });
            assert.deepEqual(processUserRights({ edit_messages: 'my' }), { edit_messages: 'my' });
            assert.deepEqual(processUserRights({ edit_messages: 'any' }), { edit_messages: 'any' });
            assert.equal(processUserRights({ edit_messages: 'bogus' }), null);
        });

        test('delete_messages accepts none/my/any, drops bogus', () => {
            assert.deepEqual(processUserRights({ delete_messages: 'none' }), { delete_messages: 'none' });
            assert.deepEqual(processUserRights({ delete_messages: 'my' }), { delete_messages: 'my' });
            assert.deepEqual(processUserRights({ delete_messages: 'any' }), { delete_messages: 'any' });
            assert.equal(processUserRights({ delete_messages: 'bogus' }), null);
        });

        test('pin_messages accepts none/for_me/for_everyone', () => {
            assert.deepEqual(processUserRights({ pin_messages: 'none' }), { pin_messages: 'none' });
            assert.deepEqual(processUserRights({ pin_messages: 'for_me' }), { pin_messages: 'for_me' });
            assert.deepEqual(processUserRights({ pin_messages: 'for_everyone' }), { pin_messages: 'for_everyone' });
            assert.equal(processUserRights({ pin_messages: 'bogus' }), null);
        });

        test('colon-prefixed values preserve the full string, validate first segment', () => {
            // 'my:extra' → first segment 'my' validates, full value preserved.
            assert.deepEqual(
                processUserRights({ edit_messages: 'my:extra' }),
                { edit_messages: 'my:extra' }
            );
            // invalid first segment
            assert.equal(processUserRights({ edit_messages: 'xx:extra' }), null);
        });

        test('non-string enum value does not match, right dropped', () => {
            assert.equal(processUserRights({ edit_messages: 123 }), null);
            assert.equal(processUserRights({ edit_messages: true }), null);
        });
    });

    test('mixed rights map', () => {
        const result = processUserRights({
            send_messages: 'yes',
            send_photos: false,
            edit_messages: 'any',
            bogus_key: 'drop me',
            pin_messages: 'invalid',
        });
        assert.deepEqual(result, {
            send_messages: '1',
            send_photos: '0',
            edit_messages: 'any',
        });
    });
});
