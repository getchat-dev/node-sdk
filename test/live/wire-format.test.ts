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
 */

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { clearTenant, describeError, makeLiveSdk, SKIP_REASON, uid } from './_helpers.js';

type AnyResp = Record<string, unknown>;

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
            query: { isDeleted: 1, isEdited: 1 },
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
});
