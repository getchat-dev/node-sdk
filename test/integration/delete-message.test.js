const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startMockServer } = require('../helpers/mockServer');
const { makeSdk } = require('../helpers/sdkFactory');
const { loadFixture } = require('../helpers/loadFixture');

describe('Emby.deleteMessage()', () => {
    let server, sdk;

    before(async () => {
        server = await startMockServer();
        sdk = makeSdk(server.baseUrl);
    });
    after(async () => { await server.close(); });
    beforeEach(() => { server.reset(); });

    test('PUT /chats/c1/messages/m1 with body { message: { is_deleted: "1" } }', async () => {
        server.respondWith(loadFixture('chats/update-message/success-deleted'));

        await sdk.deleteMessage('c1', 'm1');

        const req = server.lastRequest;
        assert.equal(req.method, 'PUT');
        assert.equal(req.path, '/api/v1/chats/c1/messages/m1');
        assert.deepEqual(req.body, { message: { is_deleted: '1' } });
    });

    test('404 not found', async () => {
        server.respondWith(loadFixture('chats/update-message/not-found'));
        await assert.rejects(
            sdk.deleteMessage('c1', 'unknown'),
            (err) => err.status === 404
        );
    });

    test('500 server error', async () => {
        server.respondWith(loadFixture('chats/update-message/server-error'));
        await assert.rejects(
            sdk.deleteMessage('c1', 'm1'),
            (err) => err.status === 500
        );
    });
});
