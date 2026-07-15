import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { Emby } from '../../src/index';
import { type MockServer, startMockServer } from '../helpers/mockServer';
import { makeSdk } from '../helpers/sdkFactory';

type HttpErr = Error & { status?: number };

describe('Emby.updateParticipantRights()', () => {
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
        assert.throws(
            () => sdk.updateParticipantRights(undefined as unknown as string, 'u1', { send_messages: false }),
            /chat id isn't passed/,
        );
        assert.throws(
            () => sdk.updateParticipantRights(123 as unknown as string, 'u1', { send_messages: false }),
            /chat id isn't passed/,
        );
    });

    test('throws when user id is not a string', () => {
        assert.throws(
            () => sdk.updateParticipantRights('c1', undefined as unknown as string, { send_messages: false }),
            /user id isn't passed/,
        );
    });

    test('throws when rights is missing or empty', () => {
        assert.throws(
            () => sdk.updateParticipantRights('c1', 'u1', undefined as never),
            /rights must be a non-empty object/,
        );
        assert.throws(() => sdk.updateParticipantRights('c1', 'u1', {}), /rights must be a non-empty object/);
    });

    test('success: PUT /chats/{chatId}/participants/{userId}/rights with the rights as body', async () => {
        server.respondWith({ status: 200, body: { status: true } });

        const r = await sdk.updateParticipantRights<{ status: boolean }>('c1', 'u1', {
            send_messages: false,
            pin_messages: 'for_everyone',
        });

        assert.equal(r.status, true);
        assert.equal(server.lastRequest!.method, 'PUT');
        assert.match(server.lastRequest!.path!, /^\/api\/v1\/chats\/c1\/participants\/u1\/rights$/);
        assert.deepEqual(server.lastRequest!.body, { send_messages: false, pin_messages: 'for_everyone' });
    });

    test('an explicit null is sent through to clear an override', async () => {
        server.respondWith({ status: 200, body: { status: true } });

        await sdk.updateParticipantRights('c1', 'u1', { send_messages: null });

        assert.deepEqual(server.lastRequest!.body, { send_messages: null });
    });

    test('422 validation error rejects with .status=422', async () => {
        server.respondWith({ status: 422, body: { message: 'no rights provided' } });
        await assert.rejects(
            sdk.updateParticipantRights('c1', 'u1', { send_messages: false }),
            (err) => (err as HttpErr).status === 422,
        );
    });
});
