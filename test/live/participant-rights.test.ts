/**
 * Live round-trip for the two hand-written rights wrappers:
 * `updateParticipantRights` (PUT) and `getParticipantRights` (GET). We set an
 * override, read it back, flip it, read again, then clear it with `null` — mixing
 * the two calls to check each change actually lands on the backend.
 *
 * Strong invariants (a set value round-trips; flipping it changes the read value)
 * are asserted; backend-defined semantics (merge-vs-replace across calls, what
 * `null` does) are recorded via `t.diagnostic` rather than hard-asserted — the
 * exact behavior is what this probe surfaces.
 *
 * Requires a non-production tenant (EMBY_BASE_URL + EMBY_API_TOKEN in .env);
 * skips itself otherwise. `tenant.clearData({ sync: true })` runs before + after.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { describeError, makeLiveSdk, SKIP_REASON, setupSuite, uid } from './_helpers.js';

type AnyResp = Record<string, unknown>;

describe('live: participant rights (get/update round-trip)', { skip: SKIP_REASON }, () => {
    const sdk = makeLiveSdk();
    setupSuite(sdk); // clearTenant before + after

    const ownerId = uid('owner');
    const memberId = uid('member');
    const chatId = uid('chat-group');

    // send_messages value observed right after we set it to `false` — compared later
    // to prove the flip to `true` actually changed the stored override.
    let mutedValue: unknown;

    test('setup: users + group chat + member participant', async () => {
        assert.notEqual((await sdk.createUser<AnyResp>({ id: ownerId, name: 'Owner' })).status, false);
        assert.notEqual((await sdk.createUser<AnyResp>({ id: memberId, name: 'Member' })).status, false);
        assert.notEqual(
            (
                await sdk.createChat<AnyResp>({
                    id: chatId,
                    title: 'Rights chat',
                    type: 'group',
                    owner: { id: ownerId, name: 'Owner' },
                })
            ).status,
            false,
        );
        await sdk.addParticipantsToChat(chatId, [{ id: memberId, name: 'Member' }]);

        const list = await sdk.getChatParticipants<{ participants?: Array<{ id: string }> }>(chatId);
        const ids = (list.participants ?? []).map((p) => p.id);
        assert.ok(ids.includes(memberId), `member not a participant: ${ids.join(', ') || '(empty)'}`);
    });

    test('get on a fresh participant returns a rights object', async (t) => {
        const got = await sdk.getParticipantRights(chatId, memberId);
        t.diagnostic(`baseline rights: ${JSON.stringify(got.rights)}`);
        assert.equal(typeof got.rights, 'object', 'expected a rights object (possibly empty)');
    });

    test('control: the member can send before being muted', async () => {
        const r = await sdk.api.chatSendMessage<{ message_ids?: string[] }>({
            path: { chat_id: chatId },
            body: { user: { id: memberId, name: 'Member' }, messages: [{ text: 'before mute' }] },
        });
        assert.ok(Array.isArray(r.message_ids) && r.message_ids.length === 1, 'baseline send did not create a message');
    });

    test('update sets overrides; get reflects them', async (t) => {
        const upd = await sdk.updateParticipantRights(chatId, memberId, {
            send_messages: false, // mute in this chat
            pin_messages: 'for_everyone',
        });
        assert.notEqual(upd.status, false, 'updateParticipantRights returned status=false');

        const got = await sdk.getParticipantRights(chatId, memberId);
        const rights = (got.rights ?? {}) as Record<string, unknown>;
        t.diagnostic(`rights after set: ${JSON.stringify(rights)}`);
        assert.ok('send_messages' in rights, 'send_messages override did not round-trip');
        assert.ok('pin_messages' in rights, 'pin_messages override did not round-trip');
        mutedValue = rights.send_messages;
    });

    test('send_messages: false blocks the member from sending via the API', async (t) => {
        // The member was just muted (send_messages: false) in the step above. Per the
        // spec, the API must reject the send — a muted participant must not post a
        // message. Robust to both enforcement styles: a hard error OR a response with
        // no message id both count as "did not pass"; a created message id fails.
        let created: string | undefined;
        let rejected = false;
        try {
            const r = await sdk.api.chatSendMessage<{ message_ids?: string[] }>({
                path: { chat_id: chatId },
                body: { user: { id: memberId, name: 'Member' }, messages: [{ text: 'should be blocked' }] },
            });
            created = r.message_ids?.[0];
            t.diagnostic(`send returned without error; message_ids=${JSON.stringify(r.message_ids)}`);
        } catch (e) {
            rejected = true;
            t.diagnostic(`send rejected: ${describeError(e)}`);
        }
        assert.ok(rejected || !created, 'a muted participant (send_messages: false) still managed to post a message');
    });

    test('flipping a right changes the read-back value', async (t) => {
        const upd = await sdk.updateParticipantRights(chatId, memberId, { send_messages: true });
        assert.notEqual(upd.status, false);

        const got = await sdk.getParticipantRights(chatId, memberId);
        const rights = (got.rights ?? {}) as Record<string, unknown>;
        t.diagnostic(`rights after flip: ${JSON.stringify(rights)}`);
        assert.ok('send_messages' in rights, 'send_messages missing after update');
        assert.notEqual(
            String(rights.send_messages),
            String(mutedValue),
            'send_messages did not change on the false→true update',
        );
        // Whether an omitted key keeps its prior override (merge) or is reset (replace)
        // is backend-defined — record it, don't assert.
        t.diagnostic(
            'pin_messages' in rights
                ? `pin_messages persisted (${JSON.stringify(rights.pin_messages)}) → merge semantics`
                : 'pin_messages absent → replace semantics',
        );
    });

    test('unmuting (send_messages: true) lets the member send again', async () => {
        const r = await sdk.api.chatSendMessage<{ message_ids?: string[] }>({
            path: { chat_id: chatId },
            body: { user: { id: memberId, name: 'Member' }, messages: [{ text: 'after unmute' }] },
        });
        assert.ok(
            Array.isArray(r.message_ids) && r.message_ids.length === 1,
            'send after unmute did not create a message',
        );
    });

    test('null clears an override', async (t) => {
        const upd = await sdk.updateParticipantRights(chatId, memberId, { send_messages: null });
        assert.notEqual(upd.status, false);

        const got = await sdk.getParticipantRights(chatId, memberId);
        const rights = (got.rights ?? {}) as Record<string, unknown>;
        t.diagnostic(`rights after null-clear of send_messages: ${JSON.stringify(rights)}`);
        // null semantics (drop the key / store null / revert to link value) are
        // backend-defined — surface the outcome instead of asserting one shape.
        t.diagnostic(
            'send_messages' in rights
                ? `send_messages still present as ${JSON.stringify(rights.send_messages)} — null stored, not dropped`
                : 'send_messages key removed — null clears the override',
        );
    });
});
