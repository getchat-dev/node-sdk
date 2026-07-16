/**
 * Live probe: participant `rights` set through the three attachment entry points —
 * `createChat`, `addParticipantsToChat`, `sendMessage` — read back with
 * `getParticipantRights`. The PUT/GET/DELETE round-trip itself is covered by
 * participant-rights.test.ts; here the question is whether rights *arrive* through
 * each entry point and how the backend resolves the tricky corners:
 *
 *   - a participant with rights next to one without (no cross-contamination)
 *   - empty `{}` and `null`-valued rights at attach time
 *   - the same participant listed twice with CONFLICTING rights in one call
 *   - the chat owner listing themselves as a restricted participant
 *   - re-adding an existing participant with new/absent rights (upsert or ignore?)
 *   - a sender muting THEMSELVES in the very sendMessage call that attaches them
 *   - PUT overrides layered on top of attach-time rights (merge across entry points)
 *
 * Assertion policy: everything with a definable expectation is HARD-asserted — the
 * tests exist to go red the moment something is off, not to stay green. That
 * includes pinned contracts observed on the live backend (owner rights ignored,
 * re-add doesn't upsert, PUT merges with attach-time rights, null dropped at
 * attach; duplicates accepted with first-entry-wins; self/owner rights ignored);
 * a deliberate backend policy change should update the pin here. 5xx responses
 * and leaked internal DB errors are always failures — the duplicate/self-mute
 * cases caught a real `Chat::addUser` bug (raw Mongo 422/500) that was fixed
 * backend-side on 2026-07-16; these pins guard against its return.
 * `t.diagnostic` only supplements asserts with context, never replaces them.
 *
 * Requires a non-production tenant (EMBY_BASE_URL + EMBY_API_TOKEN in .env);
 * skips itself otherwise. `tenant.clearData({ sync: true })` runs before + after.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Emby } from '../../src/index.js';
import { describeError, makeLiveSdk, SKIP_REASON, setupSuite, uid } from './_helpers.js';

type AnyResp = Record<string, unknown>;
type Rights = Record<string, unknown>;

/** Try to post as `userId`; report whether a message was actually created. */
async function trySend(sdk: Emby, chatId: string, userId: string): Promise<{ sent: boolean; detail: string }> {
    try {
        const r = await sdk.sendMessage<{ message_ids?: string[] }>(
            chatId,
            { id: userId, name: userId },
            undefined,
            `probe from ${userId}`,
        );
        const sent = Array.isArray(r.message_ids) && r.message_ids.length > 0;
        return { sent, detail: `message_ids=${JSON.stringify(r.message_ids)}` };
    } catch (e) {
        return { sent: false, detail: describeError(e) };
    }
}

async function readRights(sdk: Emby, chatId: string, userId: string): Promise<Rights> {
    const got = await sdk.getParticipantRights(chatId, userId);
    return (got.rights ?? {}) as Rights;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. createChat
// ─────────────────────────────────────────────────────────────────────────────

describe('live: rights via createChat participants', { skip: SKIP_REASON }, () => {
    const sdk = makeLiveSdk();
    setupSuite(sdk);

    const ownerId = uid('owner');
    const restrictedId = uid('restricted');
    const plainId = uid('plain');
    const chatId = uid('chat-create-rights');

    test('setup: users', async () => {
        for (const [id, name] of [
            [ownerId, 'Owner'],
            [restrictedId, 'Restricted'],
            [plainId, 'Plain'],
        ]) {
            assert.notEqual((await sdk.createUser<AnyResp>({ id, name })).status, false);
        }
    });

    test('rights passed at creation round-trip into getParticipantRights', async (t) => {
        const r = await sdk.createChat<AnyResp>(
            { id: chatId, title: 'Create-rights chat', type: 'group', owner: { id: ownerId, name: 'Owner' } },
            [
                {
                    id: restrictedId,
                    name: 'Restricted',
                    rights: { send_messages: false, edit_messages: 'my', pin_messages: 'for_everyone' },
                },
                { id: plainId, name: 'Plain' },
            ],
        );
        assert.notEqual(r.status, false, 'createChat returned status=false');

        const rights = await readRights(sdk, chatId, restrictedId);
        t.diagnostic(`restricted rights after create: ${JSON.stringify(rights)}`);
        for (const key of ['send_messages', 'edit_messages', 'pin_messages']) {
            assert.ok(key in rights, `${key} passed at creation did not round-trip`);
        }
    });

    test('the participant WITHOUT rights is not contaminated by their neighbor', async (t) => {
        const rights = await readRights(sdk, chatId, plainId);
        t.diagnostic(`plain participant rights: ${JSON.stringify(rights)}`);
        assert.equal(
            Object.keys(rights).length,
            0,
            `expected no overrides for the bare participant, got ${JSON.stringify(rights)}`,
        );
    });

    test('send_messages:false set at creation actually blocks posting', async (t) => {
        const { sent, detail } = await trySend(sdk, chatId, restrictedId);
        t.diagnostic(`muted-at-creation send attempt: ${detail}`);
        assert.ok(!sent, 'a participant muted at chat creation still managed to post');
    });

    test('private chat: rights on the (required) participants round-trip too', async (t) => {
        const privateId = uid('chat-private-rights');
        const r = await sdk.createChat<AnyResp>(
            { id: privateId, title: 'Private rights', type: 'private', owner: { id: ownerId, name: 'Owner' } },
            [{ id: plainId, name: 'Plain', rights: { can_press_buttons: false } }],
        );
        assert.notEqual(r.status, false, 'private chat creation failed');

        const rights = await readRights(sdk, privateId, plainId);
        t.diagnostic(`private-chat participant rights: ${JSON.stringify(rights)}`);
        assert.ok('can_press_buttons' in rights, 'right did not round-trip in a private chat');
    });

    test('edge: rights:{} stores no overrides (nothing invented)', async (t) => {
        const emptyChatId = uid('chat-empty-rights');
        await sdk.createChat<AnyResp>(
            { id: emptyChatId, title: 'Empty rights', type: 'group', owner: { id: ownerId, name: 'Owner' } },
            [{ id: plainId, name: 'Plain', rights: {} }],
        );
        const rights = await readRights(sdk, emptyChatId, plainId);
        t.diagnostic(`rights after attach with {}: ${JSON.stringify(rights)}`);
        assert.equal(Object.keys(rights).length, 0, `rights:{} produced overrides: ${JSON.stringify(rights)}`);
    });

    test('edge: a null right at creation is dropped (pinned contract)', async () => {
        const nullChatId = uid('chat-null-right');
        const r = await sdk.createChat<AnyResp>(
            { id: nullChatId, title: 'Null right', type: 'group', owner: { id: ownerId, name: 'Owner' } },
            [{ id: plainId, name: 'Plain', rights: { send_messages: null } }],
        );
        assert.notEqual(r.status, false, 'creation with a null right failed outright');

        // `null` means "clear override" on PUT; at attach time there is nothing to
        // clear, so it must be dropped (observed backend contract) — a stored null
        // would later read as a falsy override and silently mute the member.
        const rights = await readRights(sdk, nullChatId, plainId);
        assert.ok(
            !('send_messages' in rights),
            `a null right at attach time must be dropped, got ${JSON.stringify(rights)}`,
        );
    });

    test('edge: same participant listed twice with CONFLICTING rights — first entry wins', async (t) => {
        // Pinned contract (observed after the 2026-07-16 Chat::addUser duplicate-user
        // fix): creation succeeds and the FIRST entry's rights stick — the second
        // entry hits the same "already attached → rights ignored" path that the
        // re-add tests pin. Before the fix this leaked a raw MongoDB modifier error;
        // any rejection here is a regression.
        const dupChatId = uid('chat-dup-conflict');
        const r = await sdk.createChat<AnyResp>(
            { id: dupChatId, title: 'Dup conflict', type: 'group', owner: { id: ownerId, name: 'Owner' } },
            [
                { id: plainId, name: 'Plain', rights: { send_messages: false } },
                { id: plainId, name: 'Plain', rights: { send_messages: true } },
            ],
        );
        assert.notEqual(r.status, false, 'creation with duplicate participants failed');

        const rights = await readRights(sdk, dupChatId, plainId);
        t.diagnostic(`rights after conflicting duplicates: ${JSON.stringify(rights)}`);
        assert.ok('send_messages' in rights, 'no override stored for the duplicated participant');
        assert.ok(
            ['false', '0'].includes(String(rights.send_messages)),
            `expected the FIRST duplicate entry (send_messages:false) to win, got ${JSON.stringify(rights.send_messages)}`,
        );
    });

    test('edge: the owner lists THEMSELVES as a muted participant', async (t) => {
        const selfChatId = uid('chat-owner-self');
        const r = await sdk.createChat<AnyResp>(
            { id: selfChatId, title: 'Owner self-mute', type: 'group', owner: { id: ownerId, name: 'Owner' } },
            [{ id: ownerId, name: 'Owner', rights: { send_messages: false } }],
        );
        assert.notEqual(r.status, false, 'owner-as-participant creation failed outright');

        // Pinned contract (observed): rights for the owner are silently ignored —
        // no override is stored and the owner keeps posting. If the backend starts
        // storing/enforcing owner mutes, that's a policy change this test must catch.
        const rights = await readRights(sdk, selfChatId, ownerId);
        assert.equal(
            Object.keys(rights).length,
            0,
            `owner rights are expected to be ignored, but got stored: ${JSON.stringify(rights)}`,
        );
        const { sent, detail } = await trySend(sdk, selfChatId, ownerId);
        t.diagnostic(`owner send attempt: ${detail}`);
        assert.ok(sent, 'the owner could not post in their own chat');
    });

    test('chat.owner.rights IS the supported way to restrict the owner', async (t) => {
        // Backend (2026-07-16): "owner is added as a participant too, so it may
        // carry per-chat rights" — rights ride `chat.owner.rights`, NOT the
        // participants[] entry the previous test pins as ignored. Stored rights
        // must also bite: a stored-but-unenforced mute is a failure.
        const ownerRightsChatId = uid('chat-owner-rights');
        const r = await sdk.createChat<AnyResp>({
            id: ownerRightsChatId,
            title: 'Owner rights via chat.owner',
            type: 'group',
            owner: { id: ownerId, name: 'Owner', rights: { send_messages: false, pin_messages: 'none' } },
        });
        assert.notEqual(r.status, false, 'createChat with owner.rights failed');

        const rights = await readRights(sdk, ownerRightsChatId, ownerId);
        t.diagnostic(`owner rights via chat.owner: ${JSON.stringify(rights)}`);
        assert.ok('send_messages' in rights, 'chat.owner.rights did not round-trip into getParticipantRights');
        assert.ok('pin_messages' in rights, 'enum right on chat.owner did not round-trip');

        const { sent, detail } = await trySend(sdk, ownerRightsChatId, ownerId);
        t.diagnostic(`muted owner send attempt: ${detail}`);
        assert.ok(!sent, 'owner muted via chat.owner.rights still managed to post');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. addParticipantsToChat
// ─────────────────────────────────────────────────────────────────────────────

describe('live: rights via addParticipantsToChat', { skip: SKIP_REASON }, () => {
    const sdk = makeLiveSdk();
    setupSuite(sdk);

    const ownerId = uid('owner');
    const mutedId = uid('muted');
    const freeId = uid('free');
    const chatId = uid('chat-add-rights');

    test('setup: users + empty group chat', async () => {
        for (const [id, name] of [
            [ownerId, 'Owner'],
            [mutedId, 'Muted'],
            [freeId, 'Free'],
        ]) {
            assert.notEqual((await sdk.createUser<AnyResp>({ id, name })).status, false);
        }
        assert.notEqual(
            (
                await sdk.createChat<AnyResp>({
                    id: chatId,
                    title: 'Add-rights chat',
                    type: 'group',
                    owner: { id: ownerId, name: 'Owner' },
                })
            ).status,
            false,
        );
    });

    test('one batch, mixed: rights land on the right participant only', async (t) => {
        const r = await sdk.addParticipantsToChat<AnyResp>(chatId, [
            { id: mutedId, name: 'Muted', rights: { send_messages: false, delete_messages: 'any' } },
            { id: freeId, name: 'Free' },
        ]);
        assert.notEqual(r.status, false, 'addParticipantsToChat returned status=false');

        const muted = await readRights(sdk, chatId, mutedId);
        const free = await readRights(sdk, chatId, freeId);
        t.diagnostic(`muted: ${JSON.stringify(muted)}; free: ${JSON.stringify(free)}`);
        assert.ok('send_messages' in muted, 'send_messages did not round-trip through addParticipants');
        assert.ok('delete_messages' in muted, 'delete_messages did not round-trip through addParticipants');
        assert.equal(Object.keys(free).length, 0, `bare neighbor got contaminated: ${JSON.stringify(free)}`);
    });

    test('enforcement: the added-muted cannot post, their bare neighbor can', async (t) => {
        const mutedTry = await trySend(sdk, chatId, mutedId);
        t.diagnostic(`muted send: ${mutedTry.detail}`);
        assert.ok(!mutedTry.sent, 'participant added with send_messages:false still posted');

        const freeTry = await trySend(sdk, chatId, freeId);
        t.diagnostic(`free send: ${freeTry.detail}`);
        assert.ok(freeTry.sent, 'the unrestricted neighbor could not post — over-blocking');
    });

    test('edge: re-adding an EXISTING member with new rights is IGNORED (pinned contract)', async () => {
        // Observed: for an already-attached member the rights payload of a re-add is
        // silently ignored — the API for changing rights is updateParticipantRights.
        // If a re-add ever starts upserting rights, that's a policy change to catch.
        const r = await sdk.addParticipantsToChat<AnyResp>(chatId, [
            { id: freeId, name: 'Free', rights: { send_messages: false } },
        ]);
        assert.notEqual(r.status, false, 're-add with rights failed outright');

        const rights = await readRights(sdk, chatId, freeId);
        assert.ok(
            !('send_messages' in rights),
            `re-add unexpectedly applied rights to an existing member: ${JSON.stringify(rights)}`,
        );
        const { sent, detail } = await trySend(sdk, chatId, freeId);
        assert.ok(sent, `re-add half-applied the mute — rights read empty but the send is blocked (${detail})`);
    });

    test('edge: re-adding a rights-holder WITHOUT rights must not silently wipe them', async (t) => {
        const before = await readRights(sdk, chatId, mutedId);
        assert.ok('send_messages' in before, 'precondition lost: muted member has no override');

        await sdk.addParticipantsToChat<AnyResp>(chatId, [{ id: mutedId, name: 'Muted' }]);

        const after = await readRights(sdk, chatId, mutedId);
        t.diagnostic(`rights after bare re-add: ${JSON.stringify(after)}`);
        // A bare re-add carries no rights payload at all — absence must mean
        // "no statement", not "clear everything" (that's what DELETE is for).
        assert.ok('send_messages' in after, 'a bare re-add wiped existing right overrides');
    });

    test('PUT layers on top of attach-time rights (merge across entry points)', async (t) => {
        const upd = await sdk.updateParticipantRights(chatId, mutedId, { react_messages: false });
        assert.notEqual(upd.status, false);

        // Pinned contract (observed): PUT merges with attach-time rights — keys the
        // PUT does not mention must survive it (same merge semantics the plain
        // PUT/GET suite pins for consecutive PUTs).
        const rights = await readRights(sdk, chatId, mutedId);
        t.diagnostic(`attach-time + PUT rights: ${JSON.stringify(rights)}`);
        assert.ok('react_messages' in rights, 'the PUT override did not land');
        assert.ok('send_messages' in rights, 'a later PUT wiped attach-time rights — merge semantics broken');
        assert.ok('delete_messages' in rights, 'a later PUT wiped an attach-time enum right — merge semantics broken');
    });

    test('deleteParticipantRights clears attach-time rights too', async () => {
        const del = await sdk.deleteParticipantRights(chatId, mutedId);
        assert.notEqual(del.status, false);

        const rights = await readRights(sdk, chatId, mutedId);
        assert.equal(Object.keys(rights).length, 0, `DELETE left overrides behind: ${JSON.stringify(rights)}`);

        const { sent } = await trySend(sdk, chatId, mutedId);
        assert.ok(sent, 'after clearing all overrides the member still cannot post');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. sendMessage
// ─────────────────────────────────────────────────────────────────────────────

describe('live: rights via sendMessage participants', { skip: SKIP_REASON }, () => {
    const sdk = makeLiveSdk();
    setupSuite(sdk);

    const senderId = uid('sender');
    const recipientId = uid('recipient');
    const bystanderId = uid('bystander');

    test('setup: users', async () => {
        for (const [id, name] of [
            [senderId, 'Sender'],
            [recipientId, 'Recipient'],
            [bystanderId, 'Bystander'],
        ]) {
            assert.notEqual((await sdk.createUser<AnyResp>({ id, name })).status, false);
        }
    });

    const chatId = uid('chat-send-rights');

    test('contract: sending into an unknown chat WITHOUT chat.create is a 404', async (t) => {
        // Backend: SendMessageRequest only auto-creates when `chat.create` is truthy
        // (default false); otherwise → 404 "Can't find chat resource".
        try {
            await sdk.sendMessage(
                { id: uid('chat-never-created'), title: 'Nope', type: 'group' },
                { id: senderId, name: 'Sender' },
                undefined,
                'this must not create a chat',
            );
            assert.fail('sendMessage into an unknown chat succeeded without chat.create');
        } catch (e) {
            t.diagnostic(`rejected as expected: ${describeError(e)}`);
            assert.equal((e as Error & { status?: number }).status, 404);
        }
    });

    test('sendMessage with chat.create attaches participants with their rights', async (t) => {
        const r = await sdk.sendMessage<{ status?: boolean; message_ids?: string[] }>(
            { id: chatId, title: 'Send-rights chat', type: 'group', create: true },
            { id: senderId, name: 'Sender' },
            [{ id: recipientId, name: 'Recipient', rights: { send_messages: false, edit_messages: 'none' } }],
            'first message creates the chat',
        );
        assert.ok(Array.isArray(r.message_ids) && r.message_ids.length === 1, 'the founding message was not created');

        const rights = await readRights(sdk, chatId, recipientId);
        t.diagnostic(`recipient rights after sendMessage-create: ${JSON.stringify(rights)}`);
        assert.ok('send_messages' in rights, 'rights on sendMessage participants did not round-trip');
        assert.ok('edit_messages' in rights, 'enum right on sendMessage participants did not round-trip');
    });

    test("rights do not leak onto the SENDER's own record", async (t) => {
        const rights = await readRights(sdk, chatId, senderId);
        t.diagnostic(`sender rights: ${JSON.stringify(rights)}`);
        assert.equal(
            Object.keys(rights).length,
            0,
            `the sender inherited overrides meant for a participant: ${JSON.stringify(rights)}`,
        );
    });

    test('enforcement: the recipient muted via sendMessage cannot reply', async (t) => {
        const { sent, detail } = await trySend(sdk, chatId, recipientId);
        t.diagnostic(`muted recipient reply attempt: ${detail}`);
        assert.ok(!sent, 'recipient muted via sendMessage participants still replied');
    });

    test('edge: sendMessage listing an EXISTING member with different rights', async () => {
        // bystander joins bare first, then a later send lists them with a mute.
        await sdk.addParticipantsToChat(chatId, [{ id: bystanderId, name: 'Bystander' }]);

        const r = await sdk.sendMessage<{ message_ids?: string[] }>(
            chatId,
            { id: senderId, name: 'Sender' },
            [{ id: bystanderId, name: 'Bystander', rights: { send_messages: false } }],
            'second message re-lists an existing member',
        );
        assert.ok(Array.isArray(r.message_ids) && r.message_ids.length === 1, 'the message itself failed');

        // Pinned contract (observed): same as addParticipants — rights for an
        // already-attached member are ignored; changing rights is what
        // updateParticipantRights is for.
        const rights = await readRights(sdk, chatId, bystanderId);
        assert.ok(
            !('send_messages' in rights),
            `sendMessage unexpectedly upserted rights on an existing member: ${JSON.stringify(rights)}`,
        );
        const { sent, detail } = await trySend(sdk, chatId, bystanderId);
        assert.ok(sent, `rights read empty but the member's send is blocked — half-applied state (${detail})`);
    });

    test('edge: the sender mutes THEMSELVES in the very message that attaches them', async (t) => {
        // Pinned contract (observed after the 2026-07-16 Chat::addUser duplicate-user
        // fix): the founding message is created, the self-mute is silently dropped
        // (the same "rights for the acting user are ignored" policy the owner test
        // pins), and follow-up sends keep working. Before the fix this was a raw
        // HTTP 500 (BulkWriteException) — any rejection here is a regression.
        const selfChatId = uid('chat-self-mute');
        const r = await sdk.sendMessage<{ message_ids?: string[] }>(
            { id: selfChatId, title: 'Self-mute paradox', type: 'group', create: true },
            { id: senderId, name: 'Sender' },
            [{ id: senderId, name: 'Sender', rights: { send_messages: false } }],
            'am I allowed to say this?',
        );
        assert.ok(Array.isArray(r.message_ids) && r.message_ids.length === 1, 'the founding message was not created');

        const rights = await readRights(sdk, selfChatId, senderId);
        t.diagnostic(`self-mute stored rights: ${JSON.stringify(rights)}`);
        assert.equal(
            Object.keys(rights).length,
            0,
            `rights for the acting sender are expected to be ignored, got ${JSON.stringify(rights)}`,
        );

        const followUp = await trySend(sdk, selfChatId, senderId);
        assert.ok(followUp.sent, `no self-mute stored, yet the follow-up send is blocked (${followUp.detail})`);
    });
});
