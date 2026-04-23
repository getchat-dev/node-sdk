import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { Emby } from '../../src/index';
import type { GetChatMessagesQuery } from '../../src/types';
import { loadFixture } from '../helpers/loadFixture';
import { type MockServer, startMockServer } from '../helpers/mockServer';
import { makeSdk } from '../helpers/sdkFactory';

type HttpErr = Error & { status?: number };

describe('Emby.getMessagesFromChat()', () => {
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

    test('success with default pagination', async () => {
        server.respondWith(loadFixture('chats/messages-list/success'));

        const r = await sdk.getMessagesFromChat<{ messages: Record<string, unknown> }>('c1');

        assert.equal(Object.keys(r.messages).length, 2);
        assert.equal(server.lastRequest!.method, 'GET');
        assert.match(server.lastRequest!.path!, /^\/api\/v1\/chats\/c1\/messages\?/);
        assert.match(server.lastRequest!.path!, /page=1/);
        assert.match(server.lastRequest!.path!, /limit=1/);
    });

    test('empty result', async () => {
        server.respondWith(loadFixture('chats/messages-list/empty'));
        const r = await sdk.getMessagesFromChat<{ messages: Record<string, unknown> }>('c1');
        assert.deepEqual(r.messages, {});
    });

    test('with_users flag when withUsers=true', async () => {
        server.respondWith(loadFixture('chats/messages-list/with-users'));
        await sdk.getMessagesFromChat('c1', { withUsers: true } as GetChatMessagesQuery);
        assert.match(server.lastRequest!.path!, /withUsers=1/);
    });

    test('boolean coercion: isDeleted=true → 1, isEdited="no" → 0', async () => {
        server.respondWith(loadFixture('chats/messages-list/success'));
        await sdk.getMessagesFromChat('c1', { isDeleted: true, isEdited: 'no' as unknown as boolean });
        assert.match(server.lastRequest!.path!, /isDeleted=1/);
        assert.match(server.lastRequest!.path!, /isEdited=0/);
    });

    test('boolean coercion: isDeleted="yes" → 1, withUsers=false → 0', async () => {
        server.respondWith(loadFixture('chats/messages-list/success'));
        await sdk.getMessagesFromChat('c1', {
            isDeleted: 'yes' as unknown as boolean,
            withUsers: false,
        } as GetChatMessagesQuery);
        assert.match(server.lastRequest!.path!, /isDeleted=1/);
        assert.match(server.lastRequest!.path!, /withUsers=0/);
    });

    test('non-boolean filter values are ignored', async () => {
        server.respondWith(loadFixture('chats/messages-list/success'));
        await sdk.getMessagesFromChat('c1', { isDeleted: 'maybe' as unknown as boolean });
        assert.doesNotMatch(server.lastRequest!.path!, /isDeleted=/);
    });

    test('extra deep object with scalars flattens into query', async () => {
        server.respondWith(loadFixture('chats/messages-list/success'));
        await sdk.getMessagesFromChat('c1', { extra: { kind: 'report', priority: '5' } });
        assert.match(server.lastRequest!.path!, /extra%255Bkind%255D=report/);
        assert.match(server.lastRequest!.path!, /extra%255Bpriority%255D=5/);
    });

    test('extra with smart-boolean string becomes "1"/"0"', async () => {
        server.respondWith(loadFixture('chats/messages-list/success'));
        await sdk.getMessagesFromChat('c1', { extra: { enabled: 'yes', disabled: 'no' } });
        assert.match(server.lastRequest!.path!, /extra%255Benabled%255D=true/);
        assert.match(server.lastRequest!.path!, /extra%255Bdisabled%255D=false/);
    });

    test('extra with non-scalar values are dropped', async () => {
        server.respondWith(loadFixture('chats/messages-list/success'));
        await sdk.getMessagesFromChat('c1', {
            extra: { obj: { nested: 1 }, arr: [1, 2] } as unknown as Record<string, string>,
        });
        assert.doesNotMatch(server.lastRequest!.path!, /extra/);
    });

    test('empty extra object is dropped', async () => {
        server.respondWith(loadFixture('chats/messages-list/success'));
        await sdk.getMessagesFromChat('c1', { extra: {} });
        assert.doesNotMatch(server.lastRequest!.path!, /extra/);
    });

    test('non-plain-object queryParams is ignored', async () => {
        server.respondWith(loadFixture('chats/messages-list/success'));
        await sdk.getMessagesFromChat('c1', 'not-an-object' as unknown as GetChatMessagesQuery);
        assert.match(server.lastRequest!.path!, /page=1/);
    });

    test('pagination clamp: limit=9999 → 1000, page=-5 → 1', async () => {
        server.respondWith(loadFixture('chats/messages-list/success'));
        await sdk.getMessagesFromChat('c1', {}, -5, 9999);
        assert.match(server.lastRequest!.path!, /page=1/);
        assert.match(server.lastRequest!.path!, /limit=1000/);
    });

    test('404 not found', async () => {
        server.respondWith(loadFixture('chats/messages-list/not-found'));
        await assert.rejects(sdk.getMessagesFromChat('unknown'), (err) => (err as HttpErr).status === 404);
    });

    test('500 server error', async () => {
        server.respondWith(loadFixture('chats/messages-list/server-error'));
        await assert.rejects(sdk.getMessagesFromChat('c1'), (err) => (err as HttpErr).status === 500);
    });
});
