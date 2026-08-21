import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { ZodError } from 'zod';
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

    // A `remote` button may carry a webhook of its own. The SDK passes it
    // through as it is — refusing it on other button types is the backend's
    // job (422), so there is nothing for the mock to answer here.
    test('a remote button carries its own webhook', async () => {
        server.respondWith(loadFixture('chats/send-message/with-buttons'));

        const buttons: MessageButton[] = [
            {
                label: 'Approve',
                action: 'approve',
                type: 'remote',
                webhook: { url: 'https://hooks.example.com/approve', mode: 'additional' },
            },
        ];
        await sdk.sendMessage('c1', USER, [], 'pick one', {}, buttons);

        const messages = (server.lastRequest!.body as JsonBody).messages as Array<{ buttons: MessageButton[] }>;
        assert.deepEqual(messages[0].buttons, buttons);
    });

    test('a webhook without a mode goes out without one — no default is filled in', async () => {
        server.respondWith(loadFixture('chats/send-message/with-buttons'));

        const buttons: MessageButton[] = [
            { label: 'Approve', action: 'approve', type: 'remote', webhook: { url: 'https://hooks.example.com/a' } },
        ];
        await sdk.sendMessage('c1', USER, [], 'pick one', {}, buttons);

        const messages = (server.lastRequest!.body as JsonBody).messages as Array<{ buttons: MessageButton[] }>;
        assert.deepEqual(messages[0].buttons, buttons);
    });

    test('a webhook with a bad url is refused before anything is sent', async () => {
        const buttons: MessageButton[] = [{ label: 'A', type: 'remote', webhook: { url: 'not-a-url' } }];

        await assert.rejects(sdk.sendMessage('c1', USER, [], 'hi', {}, buttons), (e) => e instanceof ZodError);
        assert.equal(server.requests.length, 0);
    });

    test('a webhook url over 2048 characters is refused', async () => {
        const url = `https://hooks.example.com/${'p'.repeat(2048)}`;
        const buttons: MessageButton[] = [{ label: 'A', type: 'remote', webhook: { url } }];

        await assert.rejects(sdk.sendMessage('c1', USER, [], 'hi', {}, buttons), (e) => e instanceof ZodError);
        assert.equal(server.requests.length, 0);
    });

    test('an unknown webhook mode is refused', async () => {
        const buttons = [
            { label: 'A', type: 'remote', webhook: { url: 'https://hooks.example.com/a', mode: 'both' } },
        ] as unknown as MessageButton[];

        await assert.rejects(sdk.sendMessage('c1', USER, [], 'hi', {}, buttons), (e) => e instanceof ZodError);
        assert.equal(server.requests.length, 0);
    });

    // Anything that isn't the { url, mode? } object — the live suite checks the
    // backend refuses these too, this one keeps them from ever being sent.
    test('a webhook that is not an object is refused before anything is sent', async () => {
        const shapes: unknown[] = [
            null,
            'https://hooks.example.com/a',
            42,
            true,
            [{ url: 'https://hooks.example.com/a' }],
            {},
        ];

        for (const webhook of shapes) {
            const buttons = [{ label: 'A', type: 'remote', webhook }] as unknown as MessageButton[];
            await assert.rejects(sdk.sendMessage('c1', USER, [], 'hi', {}, buttons), (e) => e instanceof ZodError);
        }
        assert.equal(server.requests.length, 0);
    });

    test('extra is merged into the message', async () => {
        server.respondWith(loadFixture('chats/send-message/success'));

        await sdk.sendMessage('c1', USER, [], 'hi', { source: 'cli', version: '1.12' });

        const messages = (server.lastRequest!.body as JsonBody).messages as Array<{ extra: Record<string, string> }>;
        assert.deepEqual(messages[0].extra, { source: 'cli', version: '1.12' });
    });

    // `force: true` posts even when this sender is muted in the chat
    // (`rights.send_messages: false`), which otherwise answers 403.
    test('force: true rides the body', async () => {
        server.respondWith(loadFixture('chats/send-message/success'));

        await sdk.sendMessage('c1', USER, [], 'hi', {}, [], { force: true });

        assert.equal((server.lastRequest!.body as JsonBody).force, true);
    });

    test('no options: `force` is left out of the body', async () => {
        server.respondWith(loadFixture('chats/send-message/success'));

        await sdk.sendMessage('c1', USER, [], 'hi');

        assert.ok(!('force' in (server.lastRequest!.body as JsonBody)));
    });

    test('force: false is left out too — it is what the server does anyway', async () => {
        server.respondWith(loadFixture('chats/send-message/success'));

        await sdk.sendMessage('c1', USER, [], 'hi', {}, [], { force: false });

        assert.ok(!('force' in (server.lastRequest!.body as JsonBody)));
    });

    test('a loose truthy force is sent as a real boolean', async () => {
        server.respondWith(loadFixture('chats/send-message/success'));

        await sdk.sendMessage('c1', USER, [], 'hi', {}, [], { force: 'yes' as unknown as boolean });

        assert.equal((server.lastRequest!.body as JsonBody).force, true);
    });

    test('a loose falsy force is left out', async () => {
        server.respondWith(loadFixture('chats/send-message/success'));

        await sdk.sendMessage('c1', USER, [], 'hi', {}, [], { force: 0 as unknown as boolean });

        assert.ok(!('force' in (server.lastRequest!.body as JsonBody)));
    });

    test('force does not swallow the 403 a muted sender gets without it', async () => {
        server.respondWith({ status: 403, body: { status: false, message: 'user is muted' } });

        await assert.rejects(sdk.sendMessage('c1', USER, [], 'hi'), (err) => (err as HttpErr).status === 403);
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
