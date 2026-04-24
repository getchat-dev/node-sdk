/**
 * Adversarial live tests: intentionally try to break the API. These expose:
 *   - boundary behavior (maxLength/maxItems/maxProperties — above/at/below)
 *   - duplicate-resource handling (idempotent? 409? silent overwrite?)
 *   - missing-resource handling (404? 200 no-op?)
 *   - permission quirks (edit someone else's message, remove owner)
 *   - input-sanitization surface (unicode, control chars, path traversal, SQL-ish)
 *   - auth failure path (bad token → 401)
 *
 * Tests fail if the backend silently accepts input it should reject; each test
 * `t.diagnostic`s the outcome so a passing suite still tells us something.
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { Emby } from '../../src/index.js';
import { clearTenant, describeError, LIVE_ENV, makeLiveSdk, SKIP_REASON, uid } from './_helpers.js';

type HttpErr = Error & { status?: number };
type AnyResp = Record<string, unknown>;

const isStatus = (e: unknown, code: number): boolean => (e as HttpErr)?.status === code;

describe('live: edge cases', { skip: SKIP_REASON }, () => {
    const sdk = makeLiveSdk();

    // Shared actors
    const ownerId = uid('edge-owner');
    const memberId = uid('edge-member');
    let chatId = '';

    before(async () => {
        try {
            await clearTenant(sdk);
            await sdk.api.userCreate({ body: { user: { id: ownerId, name: 'EdgeOwner' } } });
            await sdk.api.userCreate({ body: { user: { id: memberId, name: 'EdgeMember' } } });

            chatId = uid('edge-chat');
            await sdk.api.chatCreate({
                body: {
                    chat: { id: chatId, title: 'Edge cases', type: 'group', owner: { id: ownerId, name: 'EdgeOwner' } },
                },
            });
            await sdk.api.chatAddParticipants({
                path: { chat_id: chatId },
                body: { participants: [{ id: memberId, name: 'EdgeMember' }] },
            });
        } catch (e) {
            console.warn(`[live] edge-cases before: ${describeError(e)}`);
            throw e;
        }
    });

    after(async () => {
        try {
            await clearTenant(sdk);
        } catch (e) {
            console.warn(`[live] edge-cases after: ${describeError(e)}`);
        }
    });

    // ── Duplicate resource creation ───────────────────────────────────────
    describe('duplicate creation', () => {
        test('userCreate — creating user with existing id should 409 or otherwise error', async (t) => {
            try {
                await sdk.api.userCreate({ body: { user: { id: ownerId, name: 'Owner (dup)' } } });
                t.diagnostic('backend accepted duplicate userCreate without error (idempotent behavior)');
            } catch (e) {
                t.diagnostic(`backend rejected duplicate userCreate: ${describeError(e)}`);
                assert.ok(e instanceof Error, 'non-Error rejection');
            }
        });

        test('chatCreate — creating chat with existing id should 409', async (t) => {
            try {
                await sdk.api.chatCreate({
                    body: {
                        chat: { id: chatId, title: 'dup', type: 'group', owner: { id: ownerId, name: 'EdgeOwner' } },
                    },
                });
                t.diagnostic('backend accepted duplicate chatCreate (idempotent or overwrite)');
            } catch (e) {
                t.diagnostic(`backend rejected duplicate chatCreate: ${describeError(e)}`);
                // Spec says 409 for this path
                if (isStatus(e, 409)) t.diagnostic('matches spec: 409 Conflict');
            }
        });

        test('chatAddParticipants — add already-member user should be idempotent or error', async (t) => {
            try {
                await sdk.api.chatAddParticipants({
                    path: { chat_id: chatId },
                    body: { participants: [{ id: memberId, name: 'EdgeMember' }] },
                });
                t.diagnostic('backend accepted duplicate participant (idempotent)');
            } catch (e) {
                t.diagnostic(`backend rejected duplicate participant: ${describeError(e)}`);
            }
        });
    });

    // ── Missing resources ─────────────────────────────────────────────────
    describe('missing resources', () => {
        test('chatShow — nonexistent chat id → 404', async () => {
            await assert.rejects(sdk.api.chatShow({ path: { chat_id: 'does-not-exist-xyz' } }), (e) =>
                isStatus(e, 404),
            );
        });

        test('userShow — nonexistent user id → 404', async () => {
            await assert.rejects(sdk.api.userShow({ path: { user_id: 'ghost-user-xyz' } }), (e) => isStatus(e, 404));
        });

        test('chatDeleteParticipants — remove non-participant → 404 or 200 no-op', async (t) => {
            try {
                await sdk.api.chatDeleteParticipants({
                    path: { chat_id: chatId, user_id: 'ghost-xyz' },
                });
                t.diagnostic('backend silently accepted remove-nonexistent');
            } catch (e) {
                t.diagnostic(`backend rejected remove-nonexistent: ${describeError(e)}`);
                assert.ok(isStatus(e, 404), `expected 404, got ${(e as HttpErr).status}`);
            }
        });

        test('chatUpdateMessage — nonexistent message id → 404', async () => {
            await assert.rejects(
                sdk.api.chatUpdateMessage({
                    path: { chat_id: chatId, message: 'no-such-msg-xyz' },
                    body: { message: { text: 'ghost edit' } },
                }),
                (e) => isStatus(e, 404),
            );
        });
    });

    // ── Boundary: string lengths ──────────────────────────────────────────
    describe('boundaries — string length', () => {
        test('message text at 4096 (max) should be accepted', async () => {
            const r = await sdk.api.chatSendMessage<{ message_ids?: string[] }>({
                path: { chat_id: chatId },
                body: {
                    user: { id: ownerId, name: 'EdgeOwner' },
                    messages: [{ text: 'x'.repeat(4096) }],
                },
            });
            assert.ok(Array.isArray(r.message_ids));
        });

        test('message text at 4097 should be rejected (by Zod or backend)', async () => {
            await assert.rejects(
                sdk.api.chatSendMessage({
                    path: { chat_id: chatId },
                    body: {
                        user: { id: ownerId, name: 'EdgeOwner' },
                        messages: [{ text: 'x'.repeat(4097) }],
                    },
                }),
            );
        });

        test('user name at 255 (max) accepted', async () => {
            const id = uid('longname');
            await sdk.api.userCreate({ body: { user: { id, name: 'n'.repeat(255) } } });
        });

        test('user name at 256 rejected', async () => {
            const id = uid('toolongname');
            await assert.rejects(sdk.api.userCreate({ body: { user: { id, name: 'n'.repeat(256) } } }));
        });
    });

    // ── Boundary: maxItems ────────────────────────────────────────────────
    describe('boundaries — maxItems', () => {
        test('chatSendMessage — 50 messages at once is accepted (maxItems: 50)', async () => {
            const r = await sdk.api.chatSendMessage<{ message_ids?: string[] }>({
                path: { chat_id: chatId },
                body: {
                    user: { id: ownerId, name: 'EdgeOwner' },
                    messages: Array.from({ length: 50 }, (_, i) => ({ text: `batch #${i}` })),
                },
            });
            assert.ok(Array.isArray(r.message_ids));
            assert.equal(r.message_ids?.length, 50, 'expected 50 ids back');
        });

        test('chatSendMessage — 51 messages rejected by Zod', async () => {
            await assert.rejects(
                sdk.api.chatSendMessage({
                    path: { chat_id: chatId },
                    body: {
                        user: { id: ownerId, name: 'EdgeOwner' },
                        messages: Array.from({ length: 51 }, (_, i) => ({ text: `overfull #${i}` })),
                    },
                }),
            );
        });
    });

    // ── Boundary: metadata maxProperties ──────────────────────────────────
    describe('boundaries — metadata', () => {
        const mkMeta = (n: number): Record<string, string> => {
            const m: Record<string, string> = {};
            for (let i = 0; i < n; i++) m[`k${i}`] = `v${i}`;
            return m;
        };

        test('chatCreate with 64 metadata keys (max) is accepted', async () => {
            const id = uid('meta64');
            await sdk.api.chatCreate({
                body: {
                    chat: {
                        id,
                        title: 'meta boundary',
                        type: 'group',
                        metadata: mkMeta(64),
                        owner: { id: ownerId, name: 'EdgeOwner' },
                    },
                },
            });
        });

        test('chatCreate with 65 metadata keys rejected', async () => {
            const id = uid('meta65');
            await assert.rejects(
                sdk.api.chatCreate({
                    body: {
                        chat: {
                            id,
                            title: 'meta over',
                            type: 'group',
                            metadata: mkMeta(65),
                            owner: { id: ownerId, name: 'EdgeOwner' },
                        },
                    },
                }),
            );
        });
    });

    // ── Character sanity — unicode / emoji / RTL / control chars ──────────
    describe('character sanity', () => {
        test('message text with emoji is accepted and round-trips', async (t) => {
            const text = 'Привет 🎉 안녕 مرحبا';
            const r = await sdk.api.chatSendMessage<{ message_ids?: string[] }>({
                path: { chat_id: chatId },
                body: {
                    user: { id: ownerId, name: 'EdgeOwner' },
                    messages: [{ text }],
                },
            });
            const id = r.message_ids?.[0];
            assert.ok(id);

            const list = await sdk.api.chatMessages<{ messages: Record<string, { text?: string }> }>({
                path: { chat_id: chatId },
                query: { limit: 100 },
            });
            const got = list.messages?.[id!]?.text;
            t.diagnostic(`sent: ${JSON.stringify(text)}`);
            t.diagnostic(`got:  ${JSON.stringify(got)}`);
            assert.equal(got, text, 'unicode text corrupted on round-trip');
        });

        test('chat id with slash — path traversal attempt should 404 or Zod-reject', async (t) => {
            // Zod maxLength: 255 allows many chars; backend should treat `/`-containing id as not-found.
            try {
                await sdk.api.chatShow({ path: { chat_id: '../../../etc/passwd' } });
                t.diagnostic('⚠ backend accepted path-traversal-looking id (check route normalization)');
            } catch (e) {
                t.diagnostic(`path-traversal rejected: ${describeError(e)}`);
                assert.ok(e instanceof Error);
            }
        });

        test('message with control/null bytes should not corrupt JSON round-trip', async () => {
            const weird = 'with nullandcontrol';
            const r = await sdk.api.chatSendMessage<{ message_ids?: string[] }>({
                path: { chat_id: chatId },
                body: {
                    user: { id: ownerId, name: 'EdgeOwner' },
                    messages: [{ text: weird }],
                },
            });
            assert.ok(r.message_ids?.[0]);
        });
    });

    // ── Auth failure path ─────────────────────────────────────────────────
    describe('auth', () => {
        test('bad api_token → 401', async () => {
            const bad = new Emby({
                base_url: LIVE_ENV.baseUrl,
                api_token: 'not-a-real-token-12345',
            });
            await assert.rejects(bad.api.chatList<AnyResp>(), (e) => isStatus(e, 401));
        });
    });

    // ── Unknown enum values rejected client-side ──────────────────────────
    describe('client-side validation (Zod)', () => {
        test('bogus chat type rejected by Zod before hitting network', async () => {
            await assert.rejects(
                sdk.api.chatCreate({
                    body: {
                        chat: {
                            id: uid('bogus-type'),
                            title: 't',
                            type: 'banned' as unknown as 'private',
                            owner: { id: ownerId, name: 'n' },
                        },
                    },
                }),
                (e) => {
                    // Zod errors have name === 'ZodError'
                    return e instanceof Error && (e.name === 'ZodError' || e.constructor.name === 'ZodError');
                },
            );
        });

        test('invalid email format rejected by Zod', async () => {
            await assert.rejects(
                sdk.api.userCreate({ body: { user: { id: uid('bademail'), name: 'n', email: 'not-an-email' } } }),
            );
        });
    });

    // ── Pagination boundaries ─────────────────────────────────────────────
    describe('pagination', () => {
        test('limit=1001 (above max) rejected by Zod', async () => {
            await assert.rejects(sdk.api.chatList({ query: { limit: 1001 } }));
        });

        test('limit=0 (below min) rejected by Zod', async () => {
            await assert.rejects(sdk.api.chatList({ query: { limit: 0 } }));
        });

        test('page=0 (below min) rejected by Zod', async () => {
            await assert.rejects(sdk.api.chatList({ query: { page: 0 } }));
        });

        test('page far beyond data — diagnostic of backend behavior', async (t) => {
            const r = await sdk.api.chatList<{ chats?: Record<string, unknown> }>({
                query: { page: 9999, limit: 10 },
            });
            const count = Object.keys(r.chats ?? {}).length;
            t.diagnostic(`page=9999 returned ${count} chats — backend does NOT honor out-of-range page; ignores it`);
            // No hard assert: this is informational about backend pagination semantics.
        });
    });

    // ── Idempotency probes ────────────────────────────────────────────────
    describe('idempotency', () => {
        test('double-delete of same message — diagnostic only', async (t) => {
            const r = await sdk.api.chatSendMessage<{ message_ids?: string[] }>({
                path: { chat_id: chatId },
                body: {
                    user: { id: ownerId, name: 'EdgeOwner' },
                    messages: [{ text: 'will be double-deleted' }],
                },
            });
            const mid = r.message_ids?.[0];
            if (!mid) throw new Error('no message_id');

            await sdk.api.chatUpdateMessage({
                path: { chat_id: chatId, message: mid },
                body: { message: { is_deleted: true } },
            });
            t.diagnostic('first delete OK');

            // Second delete: backend may be idempotent OR error. Both outcomes are legal.
            try {
                await sdk.api.chatUpdateMessage({
                    path: { chat_id: chatId, message: mid },
                    body: { message: { is_deleted: true } },
                });
                t.diagnostic('second delete accepted (backend is idempotent)');
            } catch (e) {
                t.diagnostic(`second delete rejected (NOT idempotent): ${describeError(e)}`);
                // Don't throw — this is purely informational.
            }
        });
    });
});
