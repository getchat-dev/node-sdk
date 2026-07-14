import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { Emby } from '../../src/index';
import type { GetChatsQuery, GetChatsResponse } from '../../src/types';
import { loadFixture } from '../helpers/loadFixture';
import { type MockServer, startMockServer } from '../helpers/mockServer';
import { makeSdk } from '../helpers/sdkFactory';

type HttpErr = Error & { status?: number };

describe('Emby.getChats()', () => {
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

    test('throws when queryParams is not a plain object', () => {
        assert.throws(() => sdk.getChats('nope' as unknown as GetChatsQuery), /plain object/);
        assert.throws(() => sdk.getChats(null as unknown as GetChatsQuery), /plain object/);
    });

    test('success: returns list with pagination', async () => {
        server.respondWith(loadFixture('chats/list/success'));

        const r = await sdk.getChats<GetChatsResponse>();

        assert.equal(r.status, true);
        assert.equal(Object.keys(r.chats).length, 2);
        assert.deepEqual(r.chats_sort, ['c1', 'c2']);
        assert.equal(server.lastRequest!.method, 'GET');
        assert.match(server.lastRequest!.path!, /^\/api\/v1\/chats\?/);
        assert.match(server.lastRequest!.path!, /page=1/);
        assert.match(server.lastRequest!.path!, /limit=1/);
    });

    test('empty result', async () => {
        server.respondWith(loadFixture('chats/list/empty'));
        const r = await sdk.getChats<GetChatsResponse>();
        assert.deepEqual(r.chats, {});
        assert.equal(r.meta.total, 0);
    });

    test('type=private filter is passed in query', async () => {
        server.respondWith(loadFixture('chats/list/filtered-by-type'));
        await sdk.getChats({ type: 'private' });
        assert.match(server.lastRequest!.path!, /type=private/);
    });

    test('with_owners=true is coerced to 1', async () => {
        server.respondWith(loadFixture('chats/list/with-owners'));
        await sdk.getChats({ with_owners: true });
        assert.match(server.lastRequest!.path!, /with_owners=1/);
    });

    test('with_owners=false is coerced to 0 (not 1)', async () => {
        server.respondWith(loadFixture('chats/list/success'));
        await sdk.getChats({ with_owners: false });
        assert.match(server.lastRequest!.path!, /with_owners=0/);
    });

    test('with_owners="yes" is coerced to 1', async () => {
        server.respondWith(loadFixture('chats/list/with-owners'));
        await sdk.getChats({ with_owners: 'yes' as unknown as boolean });
        assert.match(server.lastRequest!.path!, /with_owners=1/);
    });

    test('with_owners numeric 0 passes through as 0', async () => {
        server.respondWith(loadFixture('chats/list/success'));
        await sdk.getChats({ with_owners: 0 as unknown as boolean });
        assert.match(server.lastRequest!.path!, /with_owners=0/);
    });

    test('pagination clamping: page=-5 → 1, limit=5000 → 1000', async () => {
        server.respondWith(loadFixture('chats/list/success'));
        await sdk.getChats({ page: -5, limit: 5000 });
        assert.match(server.lastRequest!.path!, /page=1/);
        assert.match(server.lastRequest!.path!, /limit=1000/);
    });

    test('non-numeric page/limit fall back to defaults', async () => {
        server.respondWith(loadFixture('chats/list/success'));
        await sdk.getChats({ page: 'abc' as unknown as number, limit: 'xyz' as unknown as number });
        assert.match(server.lastRequest!.path!, /page=1/);
        assert.match(server.lastRequest!.path!, /limit=1/);
    });

    test('metadata deep object is flattened into query', async () => {
        server.respondWith(loadFixture('chats/list/success'));
        await sdk.getChats({ metadata: { department: 'cs', priority: 'high' } });
        assert.match(server.lastRequest!.path!, /metadata%255Bdepartment%255D=cs/);
        assert.match(server.lastRequest!.path!, /metadata%255Bpriority%255D=high/);
    });

    test('date range filters are forwarded', async () => {
        server.respondWith(loadFixture('chats/list/success'));
        await sdk.getChats({
            created_from: '2026-01-01T00:00:00Z',
            last_message_to: '2026-03-10T00:00:00Z',
        });
        assert.match(server.lastRequest!.path!, /created_from=2026-01-01/);
        assert.match(server.lastRequest!.path!, /last_message_to=2026-03-10/);
    });

    test('owner filter passed through', async () => {
        server.respondWith(loadFixture('chats/list/success'));
        await sdk.getChats({ owner: 'u-owner' });
        assert.match(server.lastRequest!.path!, /owner=u-owner/);
    });

    test('empty-string filter is dropped', async () => {
        server.respondWith(loadFixture('chats/list/success'));
        await sdk.getChats({ owner: '', type: 'private' });
        assert.doesNotMatch(server.lastRequest!.path!, /owner=/);
        assert.match(server.lastRequest!.path!, /type=private/);
    });

    test('null/undefined filter is dropped', async () => {
        server.respondWith(loadFixture('chats/list/success'));
        await sdk.getChats({ owner: null as unknown as string, type: undefined });
        assert.doesNotMatch(server.lastRequest!.path!, /owner=/);
        assert.doesNotMatch(server.lastRequest!.path!, /type=/);
    });

    test('empty metadata object is dropped', async () => {
        server.respondWith(loadFixture('chats/list/success'));
        await sdk.getChats({ metadata: {} });
        assert.doesNotMatch(server.lastRequest!.path!, /metadata/);
    });

    test('unauthorized rejects with .status=401', async () => {
        server.respondWith(loadFixture('chats/list/unauthorized'));
        await assert.rejects(sdk.getChats(), (err) => (err as HttpErr).status === 401);
    });

    test('server error rejects with .status=500', async () => {
        server.respondWith(loadFixture('chats/list/server-error'));
        await assert.rejects(sdk.getChats(), (err) => (err as HttpErr).status === 500);
    });
});
