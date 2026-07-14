import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { backoffDelay, isIdempotent, MAX_BACKOFF_MS, parseRetryAfter, shouldRetry } from '../../src/libs/retry';

describe('isIdempotent', () => {
    test('GET/DELETE are idempotent; POST/PUT are not', () => {
        assert.equal(isIdempotent('get'), true);
        assert.equal(isIdempotent('GET'), true);
        assert.equal(isIdempotent('delete'), true);
        assert.equal(isIdempotent('post'), false);
        assert.equal(isIdempotent('put'), false);
    });
});

describe('shouldRetry', () => {
    test('429 retries for any method', () => {
        assert.equal(shouldRetry('get', { status: 429 }), true);
        assert.equal(shouldRetry('post', { status: 429 }), true);
    });

    test('5xx retries only for idempotent methods', () => {
        assert.equal(shouldRetry('get', { status: 503 }), true);
        assert.equal(shouldRetry('delete', { status: 500 }), true);
        assert.equal(shouldRetry('post', { status: 503 }), false);
        assert.equal(shouldRetry('put', { status: 500 }), false);
    });

    test('non-retryable statuses never retry', () => {
        assert.equal(shouldRetry('get', { status: 400 }), false);
        assert.equal(shouldRetry('get', { status: 404 }), false);
        assert.equal(shouldRetry('get', { status: 501 }), false);
    });

    test('transport errors: reads retry on any, writes only when the request never left', () => {
        assert.equal(shouldRetry('get', { code: 'ECONNRESET' }), true);
        assert.equal(shouldRetry('get', { code: 'ETIMEDOUT' }), true);
        assert.equal(shouldRetry('post', { code: 'ECONNRESET' }), false); // mid-flight
        assert.equal(shouldRetry('post', { code: 'ETIMEDOUT' }), false);
        assert.equal(shouldRetry('post', { code: 'ECONNREFUSED' }), true); // never connected
        assert.equal(shouldRetry('post', { code: 'ENOTFOUND' }), true);
    });

    test('unknown errors (no status, no code) never retry', () => {
        assert.equal(shouldRetry('get', new SyntaxError('bad json')), false);
        assert.equal(shouldRetry('get', {}), false);
        assert.equal(shouldRetry('get', null), false);
    });
});

describe('parseRetryAfter', () => {
    test('delta-seconds → ms', () => {
        assert.equal(parseRetryAfter('2'), 2000);
        assert.equal(parseRetryAfter('0'), 0);
        assert.equal(parseRetryAfter(['3']), 3000); // multi-value header
    });

    test('HTTP-date → ms until then', () => {
        const ms = parseRetryAfter(new Date(Date.now() + 2000).toUTCString());
        assert.ok(ms !== undefined && ms > 1000 && ms <= 2000);
    });

    test('missing or garbage → undefined', () => {
        assert.equal(parseRetryAfter(undefined), undefined);
        assert.equal(parseRetryAfter(''), undefined);
        assert.equal(parseRetryAfter('later'), undefined);
    });
});

describe('backoffDelay', () => {
    test('exponential with no jitter (rand = 0)', () => {
        const zero = () => 0;
        assert.equal(backoffDelay(0, 200, undefined, zero), 200);
        assert.equal(backoffDelay(1, 200, undefined, zero), 400);
        assert.equal(backoffDelay(2, 200, undefined, zero), 800);
    });

    test('jitter adds up to +100% of the exponential term', () => {
        assert.equal(
            backoffDelay(1, 200, undefined, () => 0.5),
            600,
        ); // 400 + 0.5·400
    });

    test('Retry-After overrides backoff (capped)', () => {
        assert.equal(backoffDelay(5, 200, 1500), 1500);
        assert.equal(backoffDelay(0, 200, 10 * MAX_BACKOFF_MS), MAX_BACKOFF_MS);
    });

    test('exponential growth is capped', () => {
        assert.equal(
            backoffDelay(30, 200, undefined, () => 0),
            MAX_BACKOFF_MS,
        );
    });
});
