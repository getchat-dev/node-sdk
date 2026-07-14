import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    pickRequestControl,
    resolveControlOverrides,
    resolveRequestOptions,
    TimeoutError,
} from '../../src/libs/requestOptions';

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

describe('pickRequestControl', () => {
    test('returns {} for non-objects', () => {
        assert.deepEqual(pickRequestControl(undefined), {});
        assert.deepEqual(pickRequestControl(null), {});
        assert.deepEqual(pickRequestControl('nope'), {});
    });

    test('picks only the control keys that are present', () => {
        const signal = new AbortController().signal;
        assert.deepEqual(pickRequestControl({ path: { chat_id: 'c1' }, timeout: 5, signal, retries: 2 }), {
            timeout: 5,
            signal,
            retries: 2,
        });
        assert.deepEqual(pickRequestControl({ path: { chat_id: 'c1' } }), {}); // no control keys
        assert.deepEqual(pickRequestControl({ timeout: undefined }), {}); // undefined ignored
    });
});

describe('resolveControlOverrides', () => {
    test('empty for no control / no numeric overrides', () => {
        assert.deepEqual(resolveControlOverrides(undefined), {});
        assert.deepEqual(resolveControlOverrides({}), {});
        // signal-only control carries no numeric overrides
        assert.deepEqual(resolveControlOverrides({ signal: new AbortController().signal }), {});
    });

    test('passes valid overrides through (0 kept)', () => {
        assert.deepEqual(resolveControlOverrides({ timeout: 5000, retries: 3, retryDelay: 50 }), {
            timeout: 5000,
            retries: 3,
            retryDelay: 50,
        });
        assert.equal(resolveControlOverrides({ timeout: 0 }).timeout, 0);
        assert.equal(resolveControlOverrides({ retries: 0 }).retries, 0);
    });

    test('per-call overrides get the SAME bounds as the instance options', () => {
        assert.throws(() => resolveControlOverrides({ retries: 15 })); // above the cap of 10
        assert.throws(() => resolveControlOverrides({ retries: -1 }));
        assert.throws(() => resolveControlOverrides({ timeout: -1 }));
        assert.throws(() => resolveControlOverrides({ timeout: 1.5 }));
        assert.throws(() => resolveControlOverrides({ retryDelay: -5 }));
        // biome-ignore lint/suspicious/noExplicitAny: feeding a wrong type on purpose
        assert.throws(() => resolveControlOverrides({ timeout: 'soon' as any }));
    });
});
