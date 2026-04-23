import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { Emby } from '../../src/index';
import type { MessageButton, Participant, User } from '../../src/types';
import { loadFixture } from '../helpers/loadFixture';
import { type MockServer, startMockServer } from '../helpers/mockServer';
import { makeSdk } from '../helpers/sdkFactory';

type HttpErr = Error & { status?: number };
type JsonBody = Record<string, unknown>;

describe('Emby.sendMessage()', () => {
    let server: MockServer;
    let sdk: Emby;

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

    const USER: User = { id: 'u1', name: 'User' };

    test('throws when message.text is missing/empty', () => {
        assert.throws(() => sdk.sendMessage('c1', USER, [], {} as unknown as string), /message text is required/);
        assert.throws(() => sdk.sendMessage('c1', USER, [], ''), /message text is required/);
        assert.throws(
            () => sdk.sendMessage('c1', USER, [], { recipient_id: 'r' } as unknown as string),
            /message text is required/,
        );
    });

    test('throws when chat is neither object nor string', () => {
        assert.throws(() => sdk.sendMessage(null as unknown as string, USER, [], 'hi'), /chat.*object or string/);
        assert.throws(() => sdk.sendMessage(123 as unknown as string, USER, [], 'hi'), /chat.*object or string/);
    });

    test('throws when chat.id is missing', () => {
        assert.throws(() => sdk.sendMessage({ title: 'X' }, USER, [], 'hi'), /chat id isn't passed/);
    });

    test('success with string message → POST /chats/c1/messages', async () => {
        server.respondWith(loadFixture('chats/send-message/success'));

        const r = await sdk.sendMessage<{ message_ids: string[] }>('c1', USER, [], 'hello');

        assert.deepEqual(r.message_ids, ['m-new-1']);
        const req = server.lastRequest!;
        const body = req.body as JsonBody;
        assert.equal(req.method, 'POST');
        assert.equal(req.path, '/api/v1/chats/c1/messages');
        assert.deepEqual(body.messages, [{ text: 'hello' }]);
        assert.deepEqual(body.user, USER);
        assert.ok(!('chat' in body));
    });

    test('success with object message { text, recipient_id }', async () => {
        server.respondWith(loadFixture('chats/send-message/success'));

        await sdk.sendMessage('c1', USER, [], { text: 'targeted', recipient_id: 'r42' });

        const body = server.lastRequest!.body as JsonBody;
        assert.deepEqual(body.messages, [{ text: 'targeted', recipient_id: 'r42' }]);
    });

    test('buttons are attached to the message', async () => {
        server.respondWith(loadFixture('chats/send-message/with-buttons'));

        const buttons: MessageButton[] = [
            { label: 'Open', action: 'https://x', type: 'url' },
            { label: 'Call', action: '+123', type: 'call' },
        ];
        await sdk.sendMessage('c1', USER, [], 'pick one', {}, buttons);

        const messages = (server.lastRequest!.body as JsonBody).messages as Array<{ buttons: MessageButton[] }>;
        assert.deepEqual(messages[0].buttons, buttons);
    });

    test('extra is merged into the message', async () => {
        server.respondWith(loadFixture('chats/send-message/success'));

        await sdk.sendMessage('c1', USER, [], 'hi', { source: 'cli', version: '1.12' });

        const messages = (server.lastRequest!.body as JsonBody).messages as Array<{ extra: Record<string, string> }>;
        assert.deepEqual(messages[0].extra, { source: 'cli', version: '1.12' });
    });

    test('participants are normalized (is_bot default false, bogus keys dropped)', async () => {
        server.respondWith(loadFixture('chats/send-message/success'));

        await sdk.sendMessage(
            'c1',
            USER,
            [
                { id: 'p1', name: 'Alice', bogus: 'drop' } as unknown as Participant,
                { id: 'p2', name: 'Bot', is_bot: true },
            ],
            'hi',
        );

        const body = server.lastRequest!.body as JsonBody;
        assert.deepEqual(body.participants, [
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
            'first message',
        );

        assert.equal(server.lastRequest!.path, '/api/v1/chats/c-new/messages');
        const body = server.lastRequest!.body as JsonBody;
        assert.deepEqual(body.chat, {
            title: 'Support',
            type: 'private',
            metadata: { dep: 'cs' },
        });
    });

    test('chat as string coerced to { id }', async () => {
        server.respondWith(loadFixture('chats/send-message/success'));
        await sdk.sendMessage('c-str', USER, [], 'hi');
        assert.equal(server.lastRequest!.path, '/api/v1/chats/c-str/messages');
        const body = server.lastRequest!.body as JsonBody;
        assert.ok(!('chat' in body));
    });

    test('numeric chat.id is coerced to string', async () => {
        server.respondWith(loadFixture('chats/send-message/success'));
        await sdk.sendMessage({ id: 42 as unknown as string }, USER, [], 'hi');
        assert.equal(server.lastRequest!.path, '/api/v1/chats/42/messages');
    });

    test('401 unauthorized', async () => {
        server.respondWith(loadFixture('chats/send-message/unauthorized'));
        await assert.rejects(sdk.sendMessage('c1', USER, [], 'hi'), (err) => (err as HttpErr).status === 401);
    });

    test('422 validation error', async () => {
        server.respondWith(loadFixture('chats/send-message/validation-error'));
        await assert.rejects(sdk.sendMessage('c1', USER, [], 'hi'), (err) => (err as HttpErr).status === 422);
    });

    test('500 server error', async () => {
        server.respondWith(loadFixture('chats/send-message/server-error'));
        await assert.rejects(sdk.sendMessage('c1', USER, [], 'hi'), (err) => (err as HttpErr).status === 500);
    });
});
