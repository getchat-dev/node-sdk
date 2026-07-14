import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { Emby } from '../../src/index';
import { TimeoutError } from '../../src/libs/requestOptions';
import { type MockServer, startMockServer } from '../helpers/mockServer';
import { DEFAULTS } from '../helpers/sdkFactory';

describe('per-call cancellation & overrides', () => {
    // Fresh server per test — cancellation drops a connection mid-flight.
    let server: MockServer;
    beforeEach(async () => {
        server = await startMockServer();
    });
    afterEach(async () => {
        await server.close();
    });

    const sdk = (opts = {}) =>
        new Emby({ ...DEFAULTS, base_url: server.baseUrl, api_url: server.baseUrl, options: opts });

    test('AbortSignal cancels an in-flight request (not a timeout)', async () => {
        server.respondWith({ status: 200, body: { ok: true }, delayMs: 300 });
        const ac = new AbortController();
        const p = sdk().api.chatShow({ path: { chat_id: 'c1' }, signal: ac.signal });
        setTimeout(() => ac.abort(), 20);
        await assert.rejects(p, (e) => {
            assert.ok(!(e instanceof TimeoutError), 'cancellation must not surface as a timeout');
            return (e as Error).name === 'AbortError';
        });
    });

    test('a cancelled request is not retried', async () => {
        server.respondWith({ status: 200, body: { ok: true }, delayMs: 300 });
        const ac = new AbortController();
        const p = sdk({ retries: 3, retryDelay: 1 }).api.chatShow({ path: { chat_id: 'c1' }, signal: ac.signal });
        setTimeout(() => ac.abort(), 20);
        await assert.rejects(p);
        assert.equal(server.requests.length, 1);
    });

    test('a cancel during the retry backoff rejects and skips the next attempt', async () => {
        server.respondWith({ status: 503, body: {} }); // first attempt fails retryably (instant)
        server.respondWith({ status: 200, body: { ok: true } }); // must never be consumed
        const ac = new AbortController();
        // Big backoff (>= 300ms) so there's a window to cancel mid-wait; GET so the 503 is retryable.
        const p = sdk({ retries: 3, retryDelay: 300 }).api.chatShow({ path: { chat_id: 'c1' }, signal: ac.signal });
        setTimeout(() => ac.abort(), 60); // first 503 is instant → we're in the backoff sleep by now
        await assert.rejects(p, (e) => (e as Error).name === 'AbortError');
        assert.equal(server.requests.length, 1); // the second attempt never left
    });

    test('an already-aborted signal rejects before sending', async () => {
        server.respondWith({ status: 200, body: { ok: true } });
        const ac = new AbortController();
        ac.abort();
        await assert.rejects(sdk().api.chatShow({ path: { chat_id: 'c1' }, signal: ac.signal }));
        assert.equal(server.requests.length, 0);
    });

    test('per-call timeout overrides the instance default', async () => {
        server.respondWith({ status: 200, body: { ok: true }, delayMs: 250 });
        // Instance timeout is huge; the per-call 40ms is what bites.
        await assert.rejects(
            sdk({ timeout: 60_000, retries: 0 }).api.chatShow({ path: { chat_id: 'c1' }, timeout: 40 }),
            (e) => e instanceof TimeoutError,
        );
    });

    test('per-call retries overrides the instance default', async () => {
        server.respondWith({ status: 503, body: {} });
        server.respondWith({ status: 200, body: { ok: true } });
        // Instance retries off; the per-call 2 turns it on for this request.
        const res = await sdk({ retries: 0 }).api.chatShow<{ ok: boolean }>({
            path: { chat_id: 'c1' },
            retries: 2,
            retryDelay: 1,
        });
        assert.deepEqual(res, { ok: true });
        assert.equal(server.requests.length, 2);
    });

    test('an out-of-range per-call option rejects before sending', async () => {
        server.respondWith({ status: 200, body: { ok: true } });
        // 15 is above the cap of 10 the instance schema enforces; the per-call path
        // now gets the same validation instead of silently honoring it.
        await assert.rejects(sdk().api.chatShow({ path: { chat_id: 'c1' }, retries: 15 }));
        assert.equal(server.requests.length, 0);
    });

    test('per-call options do not leak into the request wire payload', async () => {
        server.respondWith({ status: 201, body: { status: true } });
        const ac = new AbortController();
        await sdk().api.chatCreate({
            body: { chat: { id: 'c1', title: 'T', type: 'group' } },
            signal: ac.signal,
            timeout: 5000,
        });
        // The JSON body must carry only `chat`, never signal/timeout.
        assert.deepEqual(server.lastRequest?.body, { chat: { id: 'c1', title: 'T', type: 'group' } });
        assert.equal((server.lastRequest?.body as Record<string, unknown>).signal, undefined);
    });
});
