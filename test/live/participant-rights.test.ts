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
import { makeLiveSdk, setupSuite, SKIP_REASON, uid } from './_helpers.js';

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
