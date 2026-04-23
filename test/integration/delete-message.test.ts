import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { Emby } from '../../src/index';
import { loadFixture } from '../helpers/loadFixture';
import { type MockServer, startMockServer } from '../helpers/mockServer';
import { makeSdk } from '../helpers/sdkFactory';

type HttpErr = Error & { status?: number };

describe('Emby.deleteMessage()', () => {
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

    test('PUT /chats/c1/messages/m1 with body { message: { is_deleted: "1" } }', async () => {
        server.respondWith(loadFixture('chats/update-message/success-deleted'));

        await sdk.deleteMessage('c1', 'm1');

        const req = server.lastRequest!;
        assert.equal(req.method, 'PUT');
        assert.equal(req.path, '/api/v1/chats/c1/messages/m1');
        assert.deepEqual(req.body, { message: { is_deleted: '1' } });
    });

    test('404 not found', async () => {
        server.respondWith(loadFixture('chats/update-message/not-found'));
        await assert.rejects(sdk.deleteMessage('c1', 'unknown'), (err) => (err as HttpErr).status === 404);
    });

    test('500 server error', async () => {
        server.respondWith(loadFixture('chats/update-message/server-error'));
        await assert.rejects(sdk.deleteMessage('c1', 'm1'), (err) => (err as HttpErr).status === 500);
    });
});
