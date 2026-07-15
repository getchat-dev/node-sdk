import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { Emby } from '../../src/index';
import { type MockServer, startMockServer } from '../helpers/mockServer';
import { makeSdk } from '../helpers/sdkFactory';

// `extra` values may be string, number OR boolean (e.g. `is_service: true`), not
// only strings — the spec's `additionalProperties` was widened to a scalar union.
describe('message extra accepts scalar values (string | number | boolean)', () => {
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

    const scalars = { is_service: true, retries: 3, tag: 'x' };

    test('.api.chatSendMessage: scalar extra passes Zod and reaches the wire unchanged', async () => {
        server.respondWith({ status: 201, body: { status: true, message_ids: ['m1'] } });

        await sdk.api.chatSendMessage({
            path: { chat_id: 'c1' },
            body: { user: { id: 'u1', name: 'U' }, messages: [{ text: 'hi', extra: scalars }] },
        });

        const body = server.lastRequest!.body as { messages: Array<{ extra?: unknown }> };
        assert.deepEqual(body.messages[0].extra, scalars);
    });

    test('sendMessage wrapper: scalar extra reaches the wire unchanged', async () => {
        server.respondWith({ status: 201, body: { status: true, message_ids: ['m1'] } });

        await sdk.sendMessage('c1', { id: 'u1', name: 'U' }, undefined, 'hi', scalars);

        const body = server.lastRequest!.body as { messages: Array<{ extra?: unknown }> };
        assert.deepEqual(body.messages[0].extra, scalars);
    });

    test('.api.chatUpdateMessage: scalar extra passes Zod and reaches the wire', async () => {
        server.respondWith({ status: 200, body: { status: true } });

        await sdk.api.chatUpdateMessage({
            path: { chat_id: 'c1', message: 'm1' },
            body: { message: { extra: scalars } },
        });

        const body = server.lastRequest!.body as { message: { extra?: unknown } };
        assert.deepEqual(body.message.extra, scalars);
    });

    test('updateMessage wrapper: scalar extra reaches the wire', async () => {
        server.respondWith({ status: 200, body: { status: true } });

        await sdk.updateMessage('c1', 'm1', { extra: scalars });

        const body = server.lastRequest!.body as { message: { extra?: unknown } };
        assert.deepEqual(body.message.extra, scalars);
    });
});
