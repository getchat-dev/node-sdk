import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { Emby } from '../../src/index';
import { type MockServer, startMockServer } from '../helpers/mockServer';
import { makeSdk } from '../helpers/sdkFactory';

type HttpErr = Error & { status?: number };
type JsonBody = Record<string, unknown>;

describe('Emby chat CRUD wrappers', () => {
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

    // ─── createChat ──────────────────────────────────────────────────────────
    describe('createChat()', () => {
        test('throws on non-object chat', () => {
            assert.throws(() => sdk.createChat(undefined as unknown as never), /chat must be a non-empty object/);
            assert.throws(() => sdk.createChat({} as never), /chat must be a non-empty object/);
        });

        test('POST /chats with body.chat', async () => {
            server.respondWith({ status: 201, body: { status: true, data: { chat: { id: 'c1' } } } });
            await sdk.createChat({ id: 'c1', title: 'Group', type: 'group' });
            const req = server.lastRequest!;
            assert.equal(req.method, 'POST');
            assert.equal(req.path, '/api/v1/chats');
            assert.deepEqual(req.body, { chat: { id: 'c1', title: 'Group', type: 'group' } });
        });

        test('private chat: passes participants through normalization', async () => {
            server.respondWith({ status: 201, body: { status: true } });
            await sdk.createChat({ id: 'p1', title: 'DM', type: 'private', owner: { id: 'u1', name: 'Owner' } }, [
                { id: 'u2', name: 'Other' },
            ]);
            const body = server.lastRequest!.body as JsonBody;
            assert.deepEqual(body.chat, {
                id: 'p1',
                title: 'DM',
                type: 'private',
                owner: { id: 'u1', name: 'Owner' },
            });
            assert.deepEqual(body.participants, [{ id: 'u2', name: 'Other', is_bot: false }]);
        });

        test('participants field omitted when none provided', async () => {
            server.respondWith({ status: 201, body: { status: true } });
            await sdk.createChat({ id: 'c1', title: 'T', type: 'group' });
            const body = server.lastRequest!.body as JsonBody;
            assert.equal('participants' in body, false);
        });

        test('409 conflict bubbles up', async () => {
            server.respondWith({ status: 409, body: { message: 'exists' } });
            await assert.rejects(
                sdk.createChat({ id: 'c1', title: 'T', type: 'group' }),
                (e) => (e as HttpErr).status === 409,
            );
        });
    });

    // ─── updateChat ──────────────────────────────────────────────────────────
    describe('updateChat()', () => {
        test('throws when chat id missing', () => {
            assert.throws(() => sdk.updateChat(undefined as unknown as string), /chat id isn't passed/);
        });

        test('PUT /chats/c1 with body.chat updates', async () => {
            server.respondWith({ status: 200, body: { status: true } });
            await sdk.updateChat('c1', { title: 'New title', metadata: { color: 'blue' } });
            const req = server.lastRequest!;
            assert.equal(req.method, 'PUT');
            assert.equal(req.path, '/api/v1/chats/c1');
            assert.deepEqual(req.body, { chat: { title: 'New title', metadata: { color: 'blue' } } });
        });

        test('empty updates still valid', async () => {
            server.respondWith({ status: 200, body: { status: true } });
            await sdk.updateChat('c1');
            assert.deepEqual(server.lastRequest!.body, { chat: {} });
        });
    });

    // ─── deleteChat ──────────────────────────────────────────────────────────
    describe('deleteChat()', () => {
        test('throws when chat id missing', () => {
            assert.throws(() => sdk.deleteChat(undefined as unknown as string), /chat id isn't passed/);
            assert.throws(() => sdk.deleteChat(null as unknown as string), /chat id isn't passed/);
        });

        test('DELETE /chats/c1', async () => {
            server.respondWith({ status: 200, body: { status: true } });
            await sdk.deleteChat('c1');
            const req = server.lastRequest!;
            assert.equal(req.method, 'DELETE');
            assert.match(req.path!, /^\/api\/v1\/chats\/c1/);
            assert.equal(req.rawBody, '');
        });
    });

    // ─── getChatParticipants ─────────────────────────────────────────────────
    describe('getChatParticipants()', () => {
        test('throws when chat id missing', () => {
            assert.throws(() => sdk.getChatParticipants(undefined as unknown as string), /chat id isn't passed/);
        });

        test('GET /chats/c1/participants with default pagination', async () => {
            server.respondWith({ status: 200, body: { status: true, participants: [] } });
            await sdk.getChatParticipants('c1');
            const path = server.lastRequest!.path!;
            assert.match(path, /^\/api\/v1\/chats\/c1\/participants\?/);
            assert.match(path, /page=1/);
            assert.match(path, /limit=50/);
        });

        test('pagination clamping: page=-5 → 1, limit=5000 → 1000', async () => {
            server.respondWith({ status: 200, body: { status: true } });
            await sdk.getChatParticipants('c1', { page: -5, limit: 5000 });
            const path = server.lastRequest!.path!;
            assert.match(path, /page=1/);
            assert.match(path, /limit=1000/);
        });
    });

    // ─── removeParticipantFromChat ───────────────────────────────────────────
    describe('removeParticipantFromChat()', () => {
        test('throws when chat id missing', () => {
            assert.throws(
                () => sdk.removeParticipantFromChat(undefined as unknown as string, 'u1'),
                /chat id isn't passed/,
            );
        });

        test('throws when user id missing', () => {
            assert.throws(
                () => sdk.removeParticipantFromChat('c1', undefined as unknown as string),
                /user id isn't passed/,
            );
        });

        test('DELETE /chats/c1/participants/u1', async () => {
            server.respondWith({ status: 200, body: { status: true } });
            await sdk.removeParticipantFromChat('c1', 'u1');
            const req = server.lastRequest!;
            assert.equal(req.method, 'DELETE');
            assert.match(req.path!, /^\/api\/v1\/chats\/c1\/participants\/u1/);
        });

        test('404 when participant not found', async () => {
            server.respondWith({ status: 404, body: { message: 'not in chat' } });
            await assert.rejects(sdk.removeParticipantFromChat('c1', 'ghost'), (e) => (e as HttpErr).status === 404);
        });
    });
});
