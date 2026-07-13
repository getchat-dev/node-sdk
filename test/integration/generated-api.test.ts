import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { ZodError } from 'zod';
import type { Emby } from '../../src/index';
import { loadFixture } from '../helpers/loadFixture';
import { type MockServer, startMockServer } from '../helpers/mockServer';
import { makeSdk } from '../helpers/sdkFactory';

type JsonBody = Record<string, unknown>;
type HttpErr = Error & { status?: number };

describe('generated .api.* (openapi-driven, Zod-validated)', () => {
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

    describe('chatList', () => {
        test('GET /chats with query params', async () => {
            server.respondWith(loadFixture('chats/list/success'));
            await sdk.api.chatList({ query: { limit: 10, page: 2, type: 'private' } });
            assert.match(server.lastRequest!.path!, /^\/api\/v1\/chats\?/);
            assert.match(server.lastRequest!.path!, /limit=10/);
            assert.match(server.lastRequest!.path!, /page=2/);
            assert.match(server.lastRequest!.path!, /type=private/);
        });

        test('no input sends bare GET /chats', async () => {
            server.respondWith(loadFixture('chats/list/success'));
            await sdk.api.chatList();
            assert.match(server.lastRequest!.path!, /^\/api\/v1\/chats(\?|$)/);
            assert.equal(server.lastRequest!.method, 'GET');
        });

        test('Zod rejects type outside enum', async () => {
            await assert.rejects(
                sdk.api.chatList({ query: { type: 'invalid' as 'private' } }),
                (e) => e instanceof ZodError,
            );
        });

        test('Zod rejects limit above max', async () => {
            await assert.rejects(sdk.api.chatList({ query: { limit: 9999 } }), (e) => e instanceof ZodError);
        });
    });

    describe('chatShow', () => {
        test('GET /chats/{chat_id} with path param', async () => {
            server.respondWith(loadFixture('chats/show/success'));
            await sdk.api.chatShow({ path: { chat_id: 'c1' } });
            assert.match(server.lastRequest!.path!, /^\/api\/v1\/chats\/c1/);
            assert.equal(server.lastRequest!.method, 'GET');
        });

        test('path params with spaces get encoded by requestApi encodeURI', async () => {
            server.respondWith(loadFixture('chats/show/success'));
            await sdk.api.chatShow({ path: { chat_id: 'c with space' } });
            // requestApi does encodeURI on the full URL — spaces get %20
            assert.match(server.lastRequest!.path!, /chats\/c%20with%20space/);
        });
    });

    describe('chatSendMessage', () => {
        test('POST /chats/{chat_id}/messages with body', async () => {
            server.respondWith(loadFixture('chats/send-message/success'));
            await sdk.api.chatSendMessage({
                path: { chat_id: 'c1' },
                body: {
                    user: { id: 'u1', name: 'Author' },
                    messages: [{ text: 'hello from .api' }],
                },
            });
            const req = server.lastRequest!;
            assert.equal(req.method, 'POST');
            assert.equal(req.path, '/api/v1/chats/c1/messages');
            const body = req.body as JsonBody;
            assert.deepEqual(body.messages, [{ text: 'hello from .api' }]);
        });

        test('Zod rejects message text exceeding 4096 chars', async () => {
            await assert.rejects(
                sdk.api.chatSendMessage({
                    path: { chat_id: 'c1' },
                    body: {
                        user: { id: 'u1', name: 'U' },
                        messages: [{ text: 'x'.repeat(5000) }],
                    },
                }),
                (e) => e instanceof ZodError,
            );
        });

        test('Zod rejects missing required body.messages[].text', async () => {
            await assert.rejects(
                sdk.api.chatSendMessage({
                    path: { chat_id: 'c1' },
                    body: {
                        user: { id: 'u1', name: 'U' },
                        messages: [{} as { text: string }],
                    },
                }),
                (e) => e instanceof ZodError,
            );
        });
    });

    describe('userCreate', () => {
        test('POST /users with body.user', async () => {
            server.respondWith({
                status: 201,
                body: {
                    status: true,
                    data: { user: { id: 'u1', name: 'N', created_at: '1', updated_at: '1' } },
                },
            });
            await sdk.api.userCreate({ body: { user: { id: 'u1', name: 'N' } } });
            assert.equal(server.lastRequest!.method, 'POST');
            assert.equal(server.lastRequest!.path, '/api/v1/users');
            const body = server.lastRequest!.body as JsonBody;
            assert.deepEqual(body.user, { id: 'u1', name: 'N' });
        });

        test('Zod rejects invalid email format', async () => {
            await assert.rejects(
                sdk.api.userCreate({ body: { user: { id: 'u1', name: 'N', email: 'not-an-email' } } }),
                (e) => e instanceof ZodError,
            );
        });
    });

    describe('chatAddParticipants', () => {
        test('POST /chats/{chat_id}/participants with body.participants', async () => {
            server.respondWith(loadFixture('chats/add-participants/success'));
            await sdk.api.chatAddParticipants({
                path: { chat_id: 'c1' },
                body: { participants: [{ id: 'p1', name: 'Alice' }] },
            });
            assert.equal(server.lastRequest!.path, '/api/v1/chats/c1/participants');
            const body = server.lastRequest!.body as JsonBody;
            assert.deepEqual(body.participants, [{ id: 'p1', name: 'Alice' }]);
        });
    });

    describe('chatDelete', () => {
        test('DELETE /chats/{chat_id}', async () => {
            server.respondWith({ status: 200, body: { status: true } });
            await sdk.api.chatDelete({ path: { chat_id: 'c1' } });
            assert.equal(server.lastRequest!.method, 'DELETE');
            assert.match(server.lastRequest!.path!, /^\/api\/v1\/chats\/c1/);
        });
    });

    describe('chatSendTyping', () => {
        test('PUT /chats/{chat_id}/typing/{user_id}', async () => {
            server.respondWith(loadFixture('chats/send-typing/success'));
            await sdk.api.chatSendTyping({ path: { chat_id: 'c1', user_id: 'u1' } });
            assert.equal(server.lastRequest!.method, 'PUT');
            assert.equal(server.lastRequest!.path, '/api/v1/chats/c1/typing/u1');
        });
    });

    describe('participant rights', () => {
        test('chatGetParticipantRights: GET /chats/{chat_id}/participants/{user_id}/rights', async () => {
            server.respondWith({ status: 200, body: { status: true, rights: { send_messages: false } } });
            const r = await sdk.api.chatGetParticipantRights<{ rights: Record<string, unknown> }>({
                path: { chat_id: 'c1', user_id: 'u1' },
            });
            assert.equal(server.lastRequest!.method, 'GET');
            assert.equal(server.lastRequest!.path, '/api/v1/chats/c1/participants/u1/rights');
            assert.deepEqual(r.rights, { send_messages: false });
        });

        test('chatUpdateParticipantRights: PUT rights body (nullable values pass through)', async () => {
            server.respondWith({ status: 200, body: { status: true } });
            await sdk.api.chatUpdateParticipantRights({
                path: { chat_id: 'c1', user_id: 'u1' },
                body: { send_messages: false, pin_messages: 'for_everyone', can_press_buttons: null },
            });
            const req = server.lastRequest!;
            assert.equal(req.method, 'PUT');
            assert.equal(req.path, '/api/v1/chats/c1/participants/u1/rights');
            assert.deepEqual(req.body, {
                send_messages: false,
                pin_messages: 'for_everyone',
                can_press_buttons: null,
            });
        });

        test('chatUpdateParticipantRights: Zod rejects an invalid enum right', async () => {
            await assert.rejects(
                sdk.api.chatUpdateParticipantRights({
                    path: { chat_id: 'c1', user_id: 'u1' },
                    body: { edit_messages: 'bogus' as 'any' },
                }),
                (e) => e instanceof ZodError,
            );
        });

        test('chatUpdateParticipantRights: backend 422 (no rights provided) rejects', async () => {
            server.respondWith({ status: 422, body: { status: false, message: 'no rights' } });
            await assert.rejects(
                sdk.api.chatUpdateParticipantRights({ path: { chat_id: 'c1', user_id: 'u1' }, body: {} }),
                (e) => (e as HttpErr).status === 422,
            );
        });

        test('chatDeleteParticipantRights: DELETE /chats/{chat_id}/participants/{user_id}/rights', async () => {
            server.respondWith({ status: 200, body: { status: true } });
            await sdk.api.chatDeleteParticipantRights({ path: { chat_id: 'c1', user_id: 'u1' } });
            assert.equal(server.lastRequest!.method, 'DELETE');
            assert.equal(server.lastRequest!.path, '/api/v1/chats/c1/participants/u1/rights');
        });
    });

    describe('surface', () => {
        test('.api exposes all 30 operationIds', () => {
            const names = Object.keys(sdk.api).sort();
            assert.equal(names.length, 30);
            for (const expected of [
                'chatList',
                'chatCreate',
                'chatShow',
                'chatUpdate',
                'chatDelete',
                'chatParticipants',
                'chatAddParticipants',
                'chatGetParticipantRights',
                'chatUpdateParticipantRights',
                'chatDeleteParticipantRights',
                'chatDeleteParticipants',
                'chatMessages',
                'chatSendMessage',
                'chatUpdateMessage',
                'chatSendTyping',
                'chatSetWebhook',
                'chatSetS3Credentials',
                'userCreate',
                'userShow',
                'userUpdate',
                'userDelete',
                'userChats',
                'userAddFcmToken',
                'tenantSetS3Credentials',
                'tenantSetWebhookSettings',
                'tenantSetFirebaseConfigForJs',
                'tenantSetFirebaseServiceAccount',
                'tenantSetFirebaseFcmVapid',
                'tenantSetPushNotificationsSettings',
                'tenantClearData',
            ]) {
                assert.ok(names.includes(expected), `missing ${expected}`);
            }
        });
    });
});
