import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { Emby } from '../../src/index';
import { TimeoutError } from '../../src/libs/requestOptions';
import { type MockServer, startMockServer } from '../helpers/mockServer';
import { DEFAULTS } from '../helpers/sdkFactory';

describe('request timeout', () => {
    // A fresh server (own port) per test: the abort test drops a connection
    // mid-flight, and a shared keep-alive pool would poison the next test's reused
    // socket (Node 19+ keeps connections alive by default).
    let server: MockServer;

    beforeEach(async () => {
        server = await startMockServer();
    });
    afterEach(async () => {
        await server.close();
    });

    // retries off — this suite isolates timeout behavior from retry behavior.
    const sdkWith = (timeout: number) =>
        new Emby({ ...DEFAULTS, base_url: server.baseUrl, api_url: server.baseUrl, options: { timeout, retries: 0 } });

    test('rejects with TimeoutError when the backend is slower than the timeout', async () => {
        server.respondWith({ status: 200, body: { status: true }, delayMs: 250 });
        await assert.rejects(sdkWith(50).getChatInfo('c1'), (e) => e instanceof TimeoutError);
    });

    test('resolves normally when the backend answers within the timeout', async () => {
        server.respondWith({ status: 200, body: { status: true, data: { chat: { id: 'c1' } } } });
        const res = await sdkWith(1000).getChatInfo<{ data: { chat: { id: string } } }>('c1');
        assert.equal(res.data.chat.id, 'c1');
    });

    test('timeout: 0 disables the timeout (a delayed response still resolves)', async () => {
        server.respondWith({ status: 200, body: { ok: true }, delayMs: 60 });
        const res = await sdkWith(0).getChatInfo('c1');
        assert.deepEqual(res, { ok: true });
    });
});
