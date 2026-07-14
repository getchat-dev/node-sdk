import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { Emby } from '../../src/index';
import { type MockServer, startMockServer } from '../helpers/mockServer';
import { makeSdk } from '../helpers/sdkFactory';

type HttpErr = Error & { status?: number };

describe('Emby.deleteParticipantRights()', () => {
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

    test('throws when chat id is not a string', () => {
        assert.throws(() => sdk.deleteParticipantRights(undefined as unknown as string, 'u1'), /chat id isn't passed/);
        assert.throws(() => sdk.deleteParticipantRights(123 as unknown as string, 'u1'), /chat id isn't passed/);
    });

    test('throws when user id is not a string', () => {
        assert.throws(() => sdk.deleteParticipantRights('c1', undefined as unknown as string), /user id isn't passed/);
    });

    test('success: DELETE /chats/{chatId}/participants/{userId}/rights', async () => {
        server.respondWith({ status: 200, body: { status: true } });

        const r = await sdk.deleteParticipantRights<{ status: boolean }>('c1', 'u1');

        assert.equal(r.status, true);
        assert.equal(server.lastRequest!.method, 'DELETE');
        assert.match(server.lastRequest!.path!, /^\/api\/v1\/chats\/c1\/participants\/u1\/rights(\?|$)/);
    });

    test('404 not found rejects with .status=404', async () => {
        server.respondWith({ status: 404, body: { message: 'user not found in chat' } });
        await assert.rejects(sdk.deleteParticipantRights('c1', 'missing'), (err) => (err as HttpErr).status === 404);
    });
});
