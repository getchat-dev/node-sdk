const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startMockServer } = require('../helpers/mockServer');
const { makeSdk } = require('../helpers/sdkFactory');
const { loadFixture } = require('../helpers/loadFixture');

describe('Emby.getChatInfo()', () => {
    let server, sdk;

    before(async () => {
        server = await startMockServer();
        sdk = makeSdk(server.baseUrl);
    });
    after(async () => {
        await server.close();
    });
    beforeEach(() => {
        server.reset();
    });

    test('throws when id is not a string', () => {
        assert.throws(() => sdk.getChatInfo(), /chat id isn't passed/);
        assert.throws(() => sdk.getChatInfo(123), /chat id isn't passed/);
        assert.throws(() => sdk.getChatInfo(null), /chat id isn't passed/);
    });

    test('success: GET /chats/{id}', async () => {
        server.respondWith(loadFixture('chats/show/success'));

        const r = await sdk.getChatInfo('c1');

        assert.equal(r.data.chat.id, 'c1');
        assert.equal(server.lastRequest.method, 'GET');
        assert.match(server.lastRequest.path, /^\/api\/v1\/chats\/c1(\?|$)/);
    });

    test('404 not found rejects with .status=404', async () => {
        server.respondWith(loadFixture('chats/show/not-found'));

        await assert.rejects(sdk.getChatInfo('missing'), (err) => err.status === 404);
    });

    test('500 server error', async () => {
        server.respondWith(loadFixture('chats/show/server-error'));

        await assert.rejects(sdk.getChatInfo('c1'), (err) => err.status === 500);
    });
});
