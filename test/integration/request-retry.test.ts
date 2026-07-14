import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { Emby, type EmbyRequestOptions } from '../../src/index';
import { type MockServer, startMockServer } from '../helpers/mockServer';
import { DEFAULTS } from '../helpers/sdkFactory';

type HttpErr = Error & { status?: number };

describe('request retry', () => {
    // Fresh server per test — some tests drop a connection mid-flight.
    let server: MockServer;
    beforeEach(async () => {
        server = await startMockServer();
    });
    afterEach(async () => {
        await server.close();
    });

    // Tiny backoff base so retries don't add real wall-clock.
    const sdk = (over: EmbyRequestOptions = {}) =>
        new Emby({
            ...DEFAULTS,
            base_url: server.baseUrl,
            api_url: server.baseUrl,
            options: { retryDelay: 1, ...over },
        });

    test('GET retries a 503 then succeeds', async () => {
        server.respondWith({ status: 503, body: { error: 'x' } });
        server.respondWith({ status: 200, body: { status: true, data: { chat: { id: 'c1' } } } });
        const res = await sdk().getChatInfo<{ data: { chat: { id: string } } }>('c1');
        assert.equal(res.data.chat.id, 'c1');
        assert.equal(server.requests.length, 2);
    });

    test('GET gives up after `retries` attempts', async () => {
        for (let i = 0; i < 3; i++) server.respondWith({ status: 503, body: { error: 'x' } });
        await assert.rejects(sdk({ retries: 2 }).getChatInfo('c1'), (e) => (e as HttpErr).status === 503);
        assert.equal(server.requests.length, 3); // 1 + 2 retries
    });

    test('POST does NOT retry a 5xx (the write may have taken effect)', async () => {
        server.respondWith({ status: 503, body: { error: 'x' } });
        await assert.rejects(
            sdk().createChat({ id: 'c1', title: 'T', type: 'group' }),
            (e) => (e as HttpErr).status === 503,
        );
        assert.equal(server.requests.length, 1);
    });

    test('POST retries a 429 (rate-limited, not run)', async () => {
        server.respondWith({ status: 429, body: { error: 'slow down' } });
        server.respondWith({ status: 201, body: { status: true } });
        await sdk().createChat({ id: 'c1', title: 'T', type: 'group' });
        assert.equal(server.requests.length, 2);
    });

    test('honors Retry-After then retries', async () => {
        server.respondWith({ status: 429, body: {}, headers: { 'retry-after': '0' } });
        server.respondWith({ status: 200, body: { ok: true } });
        const res = await sdk({ retries: 1 }).getChatInfo('c1');
        assert.deepEqual(res, { ok: true });
        assert.equal(server.requests.length, 2);
    });

    test('GET retries a dropped connection', async () => {
        server.respondWith({ closeSocket: true });
        server.respondWith({ status: 200, body: { ok: true } });
        const res = await sdk().getChatInfo('c1');
        assert.deepEqual(res, { ok: true });
        assert.equal(server.requests.length, 2);
    });

    test('retries: 0 makes a single attempt', async () => {
        server.respondWith({ status: 503, body: {} });
        await assert.rejects(sdk({ retries: 0 }).getChatInfo('c1'), (e) => (e as HttpErr).status === 503);
        assert.equal(server.requests.length, 1);
    });
});
