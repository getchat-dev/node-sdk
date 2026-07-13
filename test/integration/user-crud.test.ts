import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { Emby } from '../../src/index';
import { type MockServer, startMockServer } from '../helpers/mockServer';
import { makeSdk } from '../helpers/sdkFactory';

type HttpErr = Error & { status?: number };
type JsonBody = Record<string, unknown>;

describe('Emby user CRUD wrappers', () => {
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

    // ─── createUser ──────────────────────────────────────────────────────────
    describe('createUser()', () => {
        test('throws on non-object user', () => {
            assert.throws(() => sdk.createUser(undefined as unknown as never), /user must be a non-empty object/);
            assert.throws(() => sdk.createUser({} as never), /user must be a non-empty object/);
        });

        test('POST /users with body.user', async () => {
            server.respondWith({ status: 201, body: { status: true, data: { user: { id: 'u1', name: 'N' } } } });
            await sdk.createUser({ id: 'u1', name: 'New User' });
            const req = server.lastRequest!;
            assert.equal(req.method, 'POST');
            assert.equal(req.path, '/api/v1/users');
            assert.deepEqual(req.body, { user: { id: 'u1', name: 'New User' } });
        });

        test('passes optional fields through', async () => {
            server.respondWith({ status: 201, body: { status: true } });
            await sdk.createUser({
                id: 'u1',
                name: 'N',
                email: 'a@b.com',
                picture: 'https://pic',
                metadata: { dept: 'eng' },
            });
            const body = server.lastRequest!.body as JsonBody;
            assert.deepEqual(body.user, {
                id: 'u1',
                name: 'N',
                email: 'a@b.com',
                picture: 'https://pic',
                metadata: { dept: 'eng' },
            });
        });

        test('409 conflict bubbles up', async () => {
            server.respondWith({ status: 409, body: { message: 'exists' } });
            await assert.rejects(sdk.createUser({ id: 'u1', name: 'N' }), (e) => (e as HttpErr).status === 409);
        });
    });

    // ─── getUser ─────────────────────────────────────────────────────────────
    describe('getUser()', () => {
        test('throws when user id missing', () => {
            assert.throws(() => sdk.getUser(undefined as unknown as string), /user id isn't passed/);
            assert.throws(() => sdk.getUser(123 as unknown as string), /user id isn't passed/);
        });

        test('GET /users/u1', async () => {
            server.respondWith({ status: 200, body: { status: true, data: { user: { id: 'u1' } } } });
            await sdk.getUser('u1');
            const req = server.lastRequest!;
            assert.equal(req.method, 'GET');
            assert.match(req.path!, /^\/api\/v1\/users\/u1/);
        });

        test('404 not found', async () => {
            server.respondWith({ status: 404, body: { message: 'no such user' } });
            await assert.rejects(sdk.getUser('ghost'), (e) => (e as HttpErr).status === 404);
        });
    });

    // ─── updateUser ──────────────────────────────────────────────────────────
    describe('updateUser()', () => {
        test('throws when user id missing', () => {
            assert.throws(() => sdk.updateUser(undefined as unknown as string), /user id isn't passed/);
        });

        test('PUT /users/u1 with body.user', async () => {
            server.respondWith({ status: 200, body: { status: true } });
            await sdk.updateUser('u1', { name: 'Updated', email: 'u@x.com' });
            const req = server.lastRequest!;
            assert.equal(req.method, 'PUT');
            assert.equal(req.path, '/api/v1/users/u1');
            assert.deepEqual(req.body, { user: { name: 'Updated', email: 'u@x.com' } });
        });

        test('empty updates still valid', async () => {
            server.respondWith({ status: 200, body: { status: true } });
            await sdk.updateUser('u1');
            assert.deepEqual(server.lastRequest!.body, { user: {} });
        });
    });

    // ─── deleteUser ──────────────────────────────────────────────────────────
    describe('deleteUser()', () => {
        test('throws when user id missing', () => {
            assert.throws(() => sdk.deleteUser(undefined as unknown as string), /user id isn't passed/);
        });

        test('DELETE /users/u1', async () => {
            server.respondWith({ status: 200, body: { status: true } });
            await sdk.deleteUser('u1');
            const req = server.lastRequest!;
            assert.equal(req.method, 'DELETE');
            assert.match(req.path!, /^\/api\/v1\/users\/u1/);
        });
    });

    // ─── getUserChats ────────────────────────────────────────────────────────
    describe('getUserChats()', () => {
        test('throws when user id missing', () => {
            assert.throws(() => sdk.getUserChats(undefined as unknown as string), /user id isn't passed/);
        });

        test('GET /users/u1/chats with default pagination', async () => {
            server.respondWith({ status: 200, body: { status: true, chats: [] } });
            await sdk.getUserChats('u1');
            const path = server.lastRequest!.path!;
            assert.match(path, /^\/api\/v1\/users\/u1\/chats\?/);
            assert.match(path, /page=1/);
            assert.match(path, /limit=50/);
        });

        test('passes order, read, metadata filters', async () => {
            server.respondWith({ status: 200, body: { status: true, chats: [] } });
            await sdk.getUserChats('u1', {
                order: 'desc',
                read: true,
                metadata: { dep: 'cs' },
                page: 2,
                limit: 100,
            });
            const path = server.lastRequest!.path!;
            assert.match(path, /order=desc/);
            assert.match(path, /read=true/);
            assert.match(path, /page=2/);
            assert.match(path, /limit=100/);
            // metadata gets PHP-style flattened + double-encoded brackets via flatten()
            assert.match(path, /metadata%255Bdep%255D=cs/);
        });

        test('passes with_last_message flag', async () => {
            server.respondWith({ status: 200, body: { status: true, chats: [] } });
            await sdk.getUserChats('u1', { with_last_message: true });
            assert.match(server.lastRequest!.path!, /with_last_message=true/);
        });

        test('omits with_last_message when not a boolean', async () => {
            server.respondWith({ status: 200, body: { status: true, chats: [] } });
            await sdk.getUserChats('u1', { with_last_message: 'yes' as unknown as boolean });
            assert.doesNotMatch(server.lastRequest!.path!, /with_last_message/);
        });

        test('drops invalid order silently', async () => {
            server.respondWith({ status: 200, body: { status: true, chats: [] } });
            await sdk.getUserChats('u1', { order: 'bogus' as 'asc' });
            assert.doesNotMatch(server.lastRequest!.path!, /order=/);
        });

        test('clamps pagination', async () => {
            server.respondWith({ status: 200, body: { status: true, chats: [] } });
            await sdk.getUserChats('u1', { page: -5, limit: 9999 });
            const path = server.lastRequest!.path!;
            assert.match(path, /page=1/);
            assert.match(path, /limit=1000/);
        });
    });
});
