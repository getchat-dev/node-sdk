const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startMockServer } = require('../helpers/mockServer');
const { makeSdk } = require('../helpers/sdkFactory');
const { loadFixture } = require('../helpers/loadFixture');

describe('Emby.updateMessage()', () => {
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

    test('success with text → PUT /chats/c1/messages/m1', async () => {
        server.respondWith(loadFixture('chats/update-message/success'));

        const r = await sdk.updateMessage('c1', 'm1', { text: 'new text' });

        assert.equal(r.is_updated, true);
        const req = server.lastRequest;
        assert.equal(req.method, 'PUT');
        assert.equal(req.path, '/api/v1/chats/c1/messages/m1');
        assert.equal(req.body.message.text, 'new text');
        assert.equal(req.body.update_extra_mode, 'merge'); // default
    });

    test('isDeleted=true sets is_deleted="1" and drops text', async () => {
        server.respondWith(loadFixture('chats/update-message/success-deleted'));

        await sdk.updateMessage('c1', 'm1', { text: 'ignored', isDeleted: true });

        assert.equal(server.lastRequest.body.message.is_deleted, '1');
        assert.equal(server.lastRequest.body.message.text, undefined);
    });

    test('extra object attaches to message, default mode is merge', async () => {
        server.respondWith(loadFixture('chats/update-message/success'));

        await sdk.updateMessage('c1', 'm1', { text: 'x', extra: { tag: 'pinned' } });

        assert.deepEqual(server.lastRequest.body.message.extra, { tag: 'pinned' });
        assert.equal(server.lastRequest.body.update_extra_mode, 'merge');
    });

    test('replaceExtra=true sets update_extra_mode=replace', async () => {
        server.respondWith(loadFixture('chats/update-message/success'));

        await sdk.updateMessage('c1', 'm1', { text: 'x', extra: { tag: 'pinned' } }, { replaceExtra: true });

        assert.equal(server.lastRequest.body.update_extra_mode, 'replace');
    });

    test('returnMessage=true sends return_message="1"', async () => {
        server.respondWith(loadFixture('chats/update-message/success-with-return-message'));

        const r = await sdk.updateMessage('c1', 'm1', { text: 'updated' }, { returnMessage: true });

        assert.equal(server.lastRequest.body.return_message, '1');
        assert.equal(r.message.id, 'm1');
    });

    test('buttons array propagates into message', async () => {
        server.respondWith(loadFixture('chats/update-message/success'));

        const buttons = [{ label: 'OK', action: 'ok', type: 'local' }];
        await sdk.updateMessage('c1', 'm1', { text: 'x', buttons });

        assert.deepEqual(server.lastRequest.body.message.buttons, buttons);
    });

    test('empty extra and empty buttons are omitted', async () => {
        server.respondWith(loadFixture('chats/update-message/success'));

        await sdk.updateMessage('c1', 'm1', { text: 'x', extra: {}, buttons: [] });

        assert.equal('extra' in server.lastRequest.body.message, false);
        assert.equal('buttons' in server.lastRequest.body.message, false);
    });

    test('empty text is omitted (no .text in message body)', async () => {
        server.respondWith(loadFixture('chats/update-message/success'));
        await sdk.updateMessage('c1', 'm1', { text: '', extra: { a: 'b' } });
        assert.equal('text' in server.lastRequest.body.message, false);
    });

    test('404 not found', async () => {
        server.respondWith(loadFixture('chats/update-message/not-found'));
        await assert.rejects(sdk.updateMessage('c1', 'missing', { text: 'x' }), (err) => err.status === 404);
    });

    test('500 server error', async () => {
        server.respondWith(loadFixture('chats/update-message/server-error'));
        await assert.rejects(sdk.updateMessage('c1', 'm1', { text: 'x' }), (err) => err.status === 500);
    });
});
