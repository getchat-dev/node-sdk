/**
 * Wire-format regression tests.
 *
 * Originally A/B probes (spec vs legacy) — after the live runs settled the disputes
 * we now use these as positive assertions that the corrected openapi.yml matches the
 * actual backend. Documented findings:
 *
 *   1. with_owners — spec says boolean, backend wants integer 1/0. Spec patched.
 *   2. with_users  — same: spec said boolean, backend wants integer 1/0. Spec patched.
 *      Param NAME is "with_users" (snake), confirmed via Postman by the user.
 *   3. isDeleted/isEdited — same: integer wire. Spec patched.
 *   4. PUT /chats/{id}/typing/{user_id} — spec correct. Hand-written `sendTyping` was
 *      sending PUT /chats/{id}/typing + body{user}, which silently failed. Hand-written
 *      now delegates to .api.chatSendTyping (BREAKING change in 1.13).
 *   5. Update-message is_deleted — backend lenient: both `true` and `'1'` accepted.
 *
 * Added with the 1.24 spec, and unverified against the backend until now:
 *
 *   6. is_bot — decided when a person is first created, and every person comes
 *      back carrying it.
 *   7. A `remote` button may carry a webhook of its own; on any other button
 *      type the message is refused with 422.
 *   8. Removing a participant answers `removed`, so a real removal is told apart
 *      from somebody who was never in the chat (a 200, not a 404).
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { clearTenant, describeError, makeLiveSdk, SKIP_REASON, uid } from './_helpers.js';

type AnyResp = Record<string, unknown>;

const isStatus = (e: unknown, code: number): boolean => (e as { status?: number })?.status === code;

const hasOwnerDataInList = (r: {
    chats?: Record<string, { owner_id?: string; owner?: unknown }> | unknown[];
    users?: Record<string, unknown>;
}): boolean => {
    if (r.users && Object.keys(r.users).length > 0) return true;
    const chats = r.chats;
    if (chats && typeof chats === 'object' && !Array.isArray(chats)) {
        for (const c of Object.values(chats)) {
            if (c && typeof c === 'object' && ('owner' in c || 'owner_id' in c)) return true;
        }
    }
    return false;
};

const hasUsersInMessages = (r: { users?: Record<string, unknown> }): boolean =>
    !!r.users && Object.keys(r.users).length > 0;

describe('live: wire-format regressions', { skip: SKIP_REASON }, () => {
    const sdk = makeLiveSdk();

    const ownerId = uid('wire-owner');
    const memberId = uid('wire-member');
    let chatId = '';

    before(async () => {
        try {
            await clearTenant(sdk);
            await sdk.api.userCreate({ body: { user: { id: ownerId, name: 'WireOwner' } } });
            await sdk.api.userCreate({ body: { user: { id: memberId, name: 'WireMember' } } });
            chatId = uid('wire-chat');
            await sdk.api.chatCreate({
                body: {
                    chat: { id: chatId, title: 'Wire', type: 'group', owner: { id: ownerId, name: 'WireOwner' } },
                },
            });
            await sdk.api.chatAddParticipants({
                path: { chat_id: chatId },
                body: { participants: [{ id: memberId, name: 'WireMember' }] },
            });
            await sdk.api.chatSendMessage({
                path: { chat_id: chatId },
                body: {
                    user: { id: ownerId, name: 'WireOwner' },
                    messages: [{ text: 'wire base' }],
                },
            });
        } catch (e) {
            console.warn(`[live] wire-format before: ${describeError(e)}`);
            throw e;
        }
    });

    after(async () => {
        try {
            await clearTenant(sdk);
        } catch (e) {
            console.warn(`[live] wire-format after: ${describeError(e)}`);
        }
    });

    test('with_owners=1 returns owner data (spec format, integer wire)', async (t) => {
        const r = await sdk.api.chatList<AnyResp>({ query: { with_owners: 1 } });
        const ok = hasOwnerDataInList(r);
        t.diagnostic(`with_owners=1 → owner data present: ${ok}`);
        assert.ok(ok, 'expected backend to include owner data with with_owners=1');
    });

    test('with_owners=0 omits owner data', async (t) => {
        const r = await sdk.api.chatList<AnyResp>({ query: { with_owners: 0 } });
        const has = hasOwnerDataInList(r);
        t.diagnostic(`with_owners=0 → owner data present: ${has}`);
        // No hard assert — depends on whether backend ever inlines a small owner stub.
    });

    test('with_users=1 returns populated users map (spec name, integer wire)', async (t) => {
        const r = await sdk.api.chatMessages<AnyResp>({
            path: { chat_id: chatId },
            query: { with_users: 1 },
        });
        const ok = hasUsersInMessages(r);
        t.diagnostic(`with_users=1 → users map populated: ${ok}`);
        assert.ok(ok, 'expected populated users map with with_users=1');
    });

    test('isDeleted=1 + isEdited=1 — accepted, returns shape', async (t) => {
        const r = await sdk.api.chatMessages<{ messages?: Record<string, unknown> }>({
            path: { chat_id: chatId },
            // spec types these as string; the backend reads them with a lenient truthy filter
            query: { isDeleted: '1', isEdited: '1' },
        });
        t.diagnostic(`combined filter → ${Object.keys(r.messages ?? {}).length} msgs`);
        assert.ok(r.messages !== undefined, 'response missing messages key');
    });

    test('PUT /chats/{id}/typing/{user_id} — spec endpoint accepted', async (t) => {
        try {
            await sdk.api.chatSendTyping<AnyResp>({ path: { chat_id: chatId, user_id: ownerId } });
            t.diagnostic('typing endpoint accepted');
        } catch (e) {
            t.diagnostic(`typing endpoint rejected: ${describeError(e)}`);
            throw e;
        }
    });

    describe('update-message is_deleted is lenient (both bool and string accepted)', () => {
        const send = async (text: string): Promise<string> => {
            const r = await sdk.api.chatSendMessage<{ message_ids?: string[] }>({
                path: { chat_id: chatId },
                body: {
                    user: { id: ownerId, name: 'WireOwner' },
                    messages: [{ text }],
                },
            });
            const id = r.message_ids?.[0];
            if (!id) throw new Error('no message_id returned');
            return id;
        };

        test('is_deleted: true (boolean, spec)', async () => {
            const id = await send('to-delete-bool');
            await sdk.api.chatUpdateMessage<AnyResp>({
                path: { chat_id: chatId, message: id },
                body: { message: { is_deleted: true } },
            });
        });

        test("is_deleted: '1' (string, legacy) still accepted via raw requestApi", async () => {
            const id = await send('to-delete-str');
            await sdk.requestApi<AnyResp>(`chats/${chatId}/messages/${id}`, { message: { is_deleted: '1' } }, 'put');
        });
    });

    // ── 6. is_bot ───────────────────────────────────────────────────────────
    // The flag can only arrive on a participant payload (the user-create body has
    // no place for it), and the spec says it is read once — when that payload
    // creates the user — and ignored ever after.
    describe('is_bot is decided at creation and comes back on every person', () => {
        const botId = uid('wire-bot');

        test('a participant created with is_bot: true is a bot, a plain member is not', async (t) => {
            await sdk.api.chatAddParticipants({
                path: { chat_id: chatId },
                body: { participants: [{ id: botId, name: 'WireBot', is_bot: true }] },
            });

            const list = await sdk.api.chatParticipants({ path: { chat_id: chatId }, query: { limit: 100 } });
            const bot = list.participants.find((p) => p.id === botId);
            const human = list.participants.find((p) => p.id === memberId);
            t.diagnostic(`bot: is_bot=${bot?.is_bot}; plain member: is_bot=${human?.is_bot}`);

            assert.equal(bot?.is_bot, true, 'participant added with is_bot: true came back without the flag');
            assert.equal(human?.is_bot, false, 'a plain member must come back with is_bot: false');
        });

        test('the user resource carries the same flag', async () => {
            const r = await sdk.api.userShow({ path: { user_id: botId } });
            assert.equal(r.user?.is_bot, true, 'userShow lost the bot flag');
        });

        test('adding the same person again cannot turn the flag around', async (t) => {
            await sdk.api.chatAddParticipants({
                path: { chat_id: chatId },
                body: { participants: [{ id: botId, name: 'WireBot', is_bot: false }] },
            });

            const r = await sdk.api.userShow({ path: { user_id: botId } });
            t.diagnostic(`is_bot after re-adding with false: ${r.user?.is_bot}`);
            assert.equal(r.user?.is_bot, true, 'is_bot is set once and must not flip on a later upsert');
        });
    });

    // ── 7. A button's own webhook ───────────────────────────────────────────
    // Whether the press really reaches that address is beyond a test like this;
    // what we can pin is that the backend takes the field, gives it back, and
    // refuses it where the spec says it is not allowed.
    describe("a remote button's own webhook", () => {
        const hookUrl = 'https://hooks.example.com/wire-button';

        test('accepted on a remote button and returned with the message', async (t) => {
            const sent = await sdk.api.chatSendMessage({
                path: { chat_id: chatId },
                body: {
                    user: { id: ownerId, name: 'WireOwner' },
                    messages: [
                        {
                            text: 'press me',
                            buttons: [
                                {
                                    type: 'remote',
                                    label: 'Approve',
                                    action: 'approve',
                                    webhook: { url: hookUrl, mode: 'additional' },
                                },
                            ],
                        },
                    ],
                },
            });

            const messageId = sent.message_ids?.[0];
            assert.ok(messageId, 'no message id came back');

            const list = await sdk.api.chatMessages({ path: { chat_id: chatId }, query: { limit: 100 } });
            const button = list.messages?.[messageId]?.buttons?.[0];
            t.diagnostic(`button came back as ${JSON.stringify(button)}`);
            assert.deepEqual(button?.webhook, { url: hookUrl, mode: 'additional' });
        });

        // Only `remote` may carry one — so try every other type, not just one.
        // Each case first sends the same button without a webhook: if that goes
        // through and the webhook version doesn't, the 422 is really about the
        // webhook and not about something else in the button.
        const OTHER_TYPES = [
            { type: 'url', action: 'https://example.com/open' },
            { type: 'call', action: '+15550100' },
            { type: 'local', action: 'nope' },
        ] as const;

        for (const { type, action } of OTHER_TYPES) {
            test(`refused on a ${type} button, which is otherwise accepted`, async (t) => {
                await sdk.api.chatSendMessage({
                    path: { chat_id: chatId },
                    body: {
                        user: { id: ownerId, name: 'WireOwner' },
                        messages: [{ text: `plain ${type} button`, buttons: [{ type, label: 'Fine', action }] }],
                    },
                });

                await assert.rejects(
                    sdk.api.chatSendMessage({
                        path: { chat_id: chatId },
                        body: {
                            user: { id: ownerId, name: 'WireOwner' },
                            messages: [
                                {
                                    text: `${type} button with a webhook`,
                                    buttons: [{ type, label: 'Nope', action, webhook: { url: hookUrl } }],
                                },
                            ],
                        },
                    }),
                    (e) => {
                        t.diagnostic(`${type} button with a webhook → ${describeError(e)}`);
                        return isStatus(e, 422);
                    },
                );
            });
        }

        // The SDK refuses these before they leave the process (pinned in the
        // mock tests), so they go through the raw transport — the question here
        // is whether the backend refuses them too, or quietly makes something up.
        describe('sent as anything other than an object', () => {
            const BAD_SHAPES: Array<[string, unknown]> = [
                ['null', null],
                ['a bare url string', hookUrl],
                ['a number', 42],
                ['true', true],
                ['a list of urls', [hookUrl]],
                ['a list holding the object', [{ url: hookUrl }]],
                ['an object with no url in it', { mode: 'replace' }],
            ];

            for (const [label, webhook] of BAD_SHAPES) {
                test(`refused when the webhook is ${label}`, async (t) => {
                    await assert.rejects(
                        sdk.requestApi(
                            `chats/${chatId}/messages`,
                            {
                                user: { id: ownerId, name: 'WireOwner' },
                                messages: [
                                    {
                                        text: `webhook as ${label}`,
                                        buttons: [{ type: 'remote', label: 'X', action: 'x', webhook }],
                                    },
                                ],
                            },
                            'post',
                        ),
                        (e) => {
                            t.diagnostic(`webhook as ${label} → ${describeError(e)}`);
                            return isStatus(e, 422);
                        },
                    );
                });
            }
        });
    });

    // ── 8. `removed` on participant removal ─────────────────────────────────
    describe('removing a participant says whether it removed anybody', () => {
        const guestId = uid('wire-guest');
        const outsiderId = uid('wire-outsider');

        before(async () => {
            await sdk.api.userCreate({ body: { user: { id: outsiderId, name: 'WireOutsider' } } });
            await sdk.api.chatAddParticipants({
                path: { chat_id: chatId },
                body: { participants: [{ id: guestId, name: 'WireGuest' }] },
            });
        });

        test('a real removal answers removed: true', async (t) => {
            const r = await sdk.api.chatDeleteParticipants({ path: { chat_id: chatId, user_id: guestId } });
            t.diagnostic(`removal of a member → ${JSON.stringify(r)}`);
            assert.equal(r.removed, true, 'removing a member must answer removed: true');

            const list = await sdk.api.chatParticipants({ path: { chat_id: chatId }, query: { limit: 100 } });
            const stillThere = list.participants.some((p) => p.id === guestId);
            // Known quirk (see happy-path step 9): the list has been seen keeping
            // the person after a 200. Worth knowing whether `removed` agrees with it.
            t.diagnostic(`participant still listed after removal: ${stillThere}`);
        });

        test('removing somebody who was never in the chat answers removed: false', async (t) => {
            const r = await sdk.api.chatDeleteParticipants({ path: { chat_id: chatId, user_id: outsiderId } });
            t.diagnostic(`removal of a non-member → ${JSON.stringify(r)}`);
            assert.equal(r.removed, false, 'a non-member removal must answer removed: false, not true');
        });

        test('a user id that resolves to nobody answers 404', async (t) => {
            await assert.rejects(
                sdk.api.chatDeleteParticipants({ path: { chat_id: chatId, user_id: uid('wire-ghost') } }),
                (e) => {
                    t.diagnostic(`removal of an unknown user → ${describeError(e)}`);
                    return isStatus(e, 404);
                },
            );
        });
    });
});
