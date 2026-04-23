const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

/**
 * helpers.js has an isArray polyfill that activates only when `Array.isArray`
 * is absent (ancient Node). Force-cover it by clearing the require cache,
 * masking `Array.isArray`, and re-requiring the module.
 */
describe('libs/helpers.js — isArray polyfill fallback (dead-branch coverage)', () => {
    test('returns true for arrays / false for non-arrays when Array.isArray is unavailable', () => {
        const originalIsArray = Array.isArray;
        const modulePath = require.resolve('../../libs/helpers');
        const savedExports = require.cache[modulePath];

        try {
            delete require.cache[modulePath];
            Array.isArray = undefined;

            const fresh = require('../../libs/helpers');
            assert.equal(fresh.isArray([]), true);
            assert.equal(fresh.isArray([1, 2]), true);
            assert.equal(fresh.isArray('not-array'), false);
            assert.equal(fresh.isArray({}), false);
            assert.equal(fresh.isArray(null), false);
        } finally {
            Array.isArray = originalIsArray;
            delete require.cache[modulePath];
            // Restore the original cached copy so other tests keep using
            // the native-Array.isArray implementation unchanged.
            if (savedExports) require.cache[modulePath] = savedExports;
        }
    });
});
