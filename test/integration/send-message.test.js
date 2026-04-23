const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startMockServer } = require('../helpers/mockServer');
const { makeSdk } = require('../helpers/sdkFactory');
const { loadFixture } = require('../helpers/loadFixture');

describe('Emby.sendMessage()', () => {
    let server, sdk;

    before(async () => {
        server = await startMockServer();
        sdk = makeSdk(server.baseUrl);
    });
    after(async () => { await server.close(); });
    beforeEach(() => { server.reset(); });

    const USER = { id: 'u1', name: 'User' };

    test('throws when message.text is missing/empty', () => {
        assert.throws(() => sdk.sendMessage('c1', USER, [], {}), /message text is required/);
        assert.throws(() => sdk.sendMessage('c1', USER, [], ''), /message text is required/);
        assert.throws(() => sdk.sendMessage('c1', USER, [], { recipient_id: 'r' }), /message text is required/);
    });

    test('throws when chat is neither object nor string', () => {
        assert.throws(() => sdk.sendMessage(null, USER, [], 'hi'), /chat.*object or string/);
        assert.throws(() => sdk.sendMessage(123, USER, [], 'hi'), /chat.*object or string/);
    });

    test('throws when chat.id is missing', () => {
        assert.throws(() => sdk.sendMessage({ title: 'X' }, USER, [], 'hi'), /chat id isn't passed/);
    });

    test('success with string message → POST /chats/c1/messages', async () => {
        server.respondWith(loadFixture('chats/send-message/success'));

        const r = await sdk.sendMessage('c1', USER, [], 'hello');

        assert.deepEqual(r.message_ids, ['m-new-1']);
        const req = server.lastRequest;
        assert.equal(req.method, 'POST');
        assert.equal(req.path, '/api/v1/chats/c1/messages');
        assert.deepEqual(req.body.messages, [{ text: 'hello' }]);
        assert.deepEqual(req.body.user, USER);
        // participants was [] → not included or kept as [] via destructure. Check current behavior:
        assert.ok(!('chat' in req.body)); // chat.id stripped, no other chat fields → omitted
    });

    test('success with object message { text, recipient_id }', async () => {
        server.respondWith(loadFixture('chats/send-message/success'));

        await sdk.sendMessage('c1', USER, [], { text: 'targeted', recipient_id: 'r42' });

        assert.deepEqual(server.lastRequest.body.messages, [
            { text: 'targeted', recipient_id: 'r42' },
        ]);
    });

    test('buttons are attached to the message', async () => {
        server.respondWith(loadFixture('chats/send-message/with-buttons'));

        const buttons = [
            { label: 'Open', action: 'https://x', type: 'url' },
            { label: 'Call', action: '+123', type: 'call' },
        ];
        await sdk.sendMessage('c1', USER, [], 'pick one', {}, buttons);

        assert.deepEqual(server.lastRequest.body.messages[0].buttons, buttons);
    });

    test('extra is merged into the message', async () => {
        server.respondWith(loadFixture('chats/send-message/success'));

        await sdk.sendMessage('c1', USER, [], 'hi', { source: 'cli', version: '1.12' });

        assert.deepEqual(server.lastRequest.body.messages[0].extra, {
            source: 'cli',
            version: '1.12',
        });
    });

    test('participants are normalized (is_bot default false, bogus keys dropped)', async () => {
        server.respondWith(loadFixture('chats/send-message/success'));

        await sdk.sendMessage(
            'c1',
            USER,
            [
                { id: 'p1', name: 'Alice', bogus: 'drop' },
                { id: 'p2', name: 'Bot', is_bot: true },
            ],
            'hi'
        );

        assert.deepEqual(server.lastRequest.body.participants, [
            { id: 'p1', name: 'Alice', is_bot: false },
            { id: 'p2', name: 'Bot', is_bot: true },
        ]);
    });

    test('new-chat: chat object with title + type + metadata goes in body', async () => {
        server.respondWith(loadFixture('chats/send-message/new-chat-created'));

        await sdk.sendMessage(
            { id: 'c-new', title: 'Support', type: 'private', metadata: { dep: 'cs' } },
            USER,
            [],
            'first message'
        );

        assert.equal(server.lastRequest.path, '/api/v1/chats/c-new/messages');
        // chat.id is stripped from body (used only in path); remaining chat fields go in body.chat
        assert.deepEqual(server.lastRequest.body.chat, {
            title: 'Support', type: 'private', metadata: { dep: 'cs' },
        });
    });

    test('chat as string coerced to { id }', async () => {
        server.respondWith(loadFixture('chats/send-message/success'));

        await sdk.sendMessage('c-str', USER, [], 'hi');

        assert.equal(server.lastRequest.path, '/api/v1/chats/c-str/messages');
        assert.ok(!('chat' in server.lastRequest.body));
    });

    test('numeric chat.id is coerced to string', async () => {
        server.respondWith(loadFixture('chats/send-message/success'));

        await sdk.sendMessage({ id: 42 }, USER, [], 'hi');

        assert.equal(server.lastRequest.path, '/api/v1/chats/42/messages');
    });

    test('401 unauthorized', async () => {
        server.respondWith(loadFixture('chats/send-message/unauthorized'));
        await assert.rejects(sdk.sendMessage('c1', USER, [], 'hi'), (err) => err.status === 401);
    });

    test('422 validation error', async () => {
        server.respondWith(loadFixture('chats/send-message/validation-error'));
        await assert.rejects(sdk.sendMessage('c1', USER, [], 'hi'), (err) => err.status === 422);
    });

    test('500 server error', async () => {
        server.respondWith(loadFixture('chats/send-message/server-error'));
        await assert.rejects(sdk.sendMessage('c1', USER, [], 'hi'), (err) => err.status === 500);
    });
});
