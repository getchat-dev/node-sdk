const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startMockServer } = require('../helpers/mockServer');
const { makeSdk } = require('../helpers/sdkFactory');
const { loadFixture } = require('../helpers/loadFixture');

describe('Emby.sendTyping()', () => {
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

    test('PUT /chats/c1/typing with { user: userId }', async () => {
        server.respondWith(loadFixture('chats/send-typing/success'));

        await sdk.sendTyping('c1', 'u-author');

        const req = server.lastRequest;
        assert.equal(req.method, 'PUT');
        assert.equal(req.path, '/api/v1/chats/c1/typing');
        assert.deepEqual(req.body, { user: 'u-author' });
    });

    test('500 server error', async () => {
        server.respondWith(loadFixture('chats/send-typing/server-error'));
        await assert.rejects(sdk.sendTyping('c1', 'u-author'), (err) => err.status === 500);
    });
});
