const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startMockServer } = require('../helpers/mockServer');
const { makeSdk } = require('../helpers/sdkFactory');
const { loadFixture } = require('../helpers/loadFixture');

describe('Emby.addParticipantsToChat()', () => {
    let server, sdk;

    before(async () => {
        server = await startMockServer();
        sdk = makeSdk(server.baseUrl);
    });
    after(async () => { await server.close(); });
    beforeEach(() => { server.reset(); });

    test('throws on empty participants list', () => {
        assert.throws(() => sdk.addParticipantsToChat('c1', []), /array of participant objects/);
        assert.throws(() => sdk.addParticipantsToChat('c1'), /array of participant objects/);
    });

    test('POST /chats/c1/participants with normalized list', async () => {
        server.respondWith(loadFixture('chats/add-participants/success'));

        await sdk.addParticipantsToChat('c1', [
            { id: 'p1', name: 'Alice' },
            { id: 'p2', name: 'Bob', email: 'b@x', picture: 'https://p', link: 'https://l' },
        ]);

        const req = server.lastRequest;
        assert.equal(req.method, 'POST');
        assert.equal(req.path, '/api/v1/chats/c1/participants');
        assert.deepEqual(req.body.participants, [
            { id: 'p1', name: 'Alice', is_bot: false },
            { id: 'p2', name: 'Bob', email: 'b@x', picture: 'https://p', link: 'https://l', is_bot: false },
        ]);
    });

    test('is_bot=true preserved through normalization', async () => {
        server.respondWith(loadFixture('chats/add-participants/with-bot'));

        await sdk.addParticipantsToChat('c1', [{ id: 'bot-1', name: 'Bot', is_bot: true }]);

        assert.deepEqual(server.lastRequest.body.participants, [
            { id: 'bot-1', name: 'Bot', is_bot: true },
        ]);
    });

    test('unknown keys in participant are dropped by normalization', async () => {
        server.respondWith(loadFixture('chats/add-participants/success'));

        await sdk.addParticipantsToChat('c1', [{ id: 'p1', name: 'A', bogus: 'drop', internal: 42 }]);

        assert.deepEqual(server.lastRequest.body.participants, [
            { id: 'p1', name: 'A', is_bot: false },
        ]);
    });

    test('500 server error', async () => {
        server.respondWith(loadFixture('chats/add-participants/server-error'));
        await assert.rejects(
            sdk.addParticipantsToChat('c1', [{ id: 'p1', name: 'A' }]),
            (err) => err.status === 500
        );
    });
});
