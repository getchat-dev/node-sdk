import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { Emby } from '../../src/index';
import { loadFixture } from '../helpers/loadFixture';
import { type MockServer, startMockServer } from '../helpers/mockServer';
import { makeSdk } from '../helpers/sdkFactory';

type HttpErr = Error & { status?: number };

describe('Emby.getChatInfo()', () => {
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

    test('throws when id is not a string', () => {
        assert.throws(() => sdk.getChatInfo(undefined as unknown as string), /chat id isn't passed/);
        assert.throws(() => sdk.getChatInfo(123 as unknown as string), /chat id isn't passed/);
        assert.throws(() => sdk.getChatInfo(null as unknown as string), /chat id isn't passed/);
    });

    test('success: GET /chats/{id}', async () => {
        server.respondWith(loadFixture('chats/show/success'));

        const r = await sdk.getChatInfo<{ data: { chat: { id: string } } }>('c1');

        assert.equal(r.data.chat.id, 'c1');
        assert.equal(server.lastRequest!.method, 'GET');
        assert.match(server.lastRequest!.path!, /^\/api\/v1\/chats\/c1(\?|$)/);
    });

    test('404 not found rejects with .status=404', async () => {
        server.respondWith(loadFixture('chats/show/not-found'));
        await assert.rejects(sdk.getChatInfo('missing'), (err) => (err as HttpErr).status === 404);
    });

    test('500 server error', async () => {
        server.respondWith(loadFixture('chats/show/server-error'));
        await assert.rejects(sdk.getChatInfo('c1'), (err) => (err as HttpErr).status === 500);
    });
});
