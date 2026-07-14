import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { resolveRequestOptions, TimeoutError } from '../../src/libs/requestOptions';

describe('resolveRequestOptions', () => {
    test('fills defaults when unset', () => {
        const defaults = { timeout: 30_000, retries: 2, retryDelay: 200 };
        assert.deepEqual(resolveRequestOptions(undefined), defaults);
        assert.deepEqual(resolveRequestOptions({}), defaults);
    });

    test('accepts a non-negative integer timeout (0 = disabled)', () => {
        assert.equal(resolveRequestOptions({ timeout: 5000 }).timeout, 5000);
        assert.equal(resolveRequestOptions({ timeout: 0 }).timeout, 0);
    });

    test('accepts and validates retry options', () => {
        assert.deepEqual(resolveRequestOptions({ retries: 0, retryDelay: 50 }), {
            timeout: 30_000,
            retries: 0,
            retryDelay: 50,
        });
        assert.throws(() => resolveRequestOptions({ retries: -1 }));
        assert.throws(() => resolveRequestOptions({ retries: 999 })); // above the cap
        assert.throws(() => resolveRequestOptions({ retryDelay: -5 }));
    });

    test('rejects insane timeout values', () => {
        assert.throws(() => resolveRequestOptions({ timeout: -1 }));
        assert.throws(() => resolveRequestOptions({ timeout: 1.5 }));
        assert.throws(() => resolveRequestOptions({ timeout: 'soon' }));
        assert.throws(() => resolveRequestOptions({ timeout: Number.NaN }));
    });

    test('rejects unknown option keys (typos)', () => {
        assert.throws(() => resolveRequestOptions({ timeoutt: 5000 }));
    });
});

describe('TimeoutError', () => {
    test('is a distinguishable Error', () => {
        const e = new TimeoutError(1000, 'chats/c1');
        assert.ok(e instanceof Error);
        assert.equal(e.name, 'TimeoutError');
        assert.equal(e.code, 'ETIMEDOUT');
        assert.equal(e.timeoutMs, 1000);
        assert.match(e.message, /chats\/c1.*1000ms/);
    });
});
