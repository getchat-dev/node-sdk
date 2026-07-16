import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { Emby } from '../../src/index';
import { type MockServer, startMockServer } from '../helpers/mockServer';
import { makeSdk } from '../helpers/sdkFactory';

type JsonBody = Record<string, unknown>;

// `rights` on a participant must survive normalizeParticipant on every wrapper
// that attaches participants (it used to be silently stripped by the whitelist).
describe('participant `rights` pass-through', () => {
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

    const participants = (body: JsonBody) => body.participants as Array<Record<string, unknown>>;

    test('createChat forwards participants[].rights; bare participants stay bare', async () => {
        server.respondWith({ status: 201, body: { status: true } });

        await sdk.createChat({ id: 'c1', title: 'G', type: 'group' }, [
            { id: 'u1', name: 'U1', rights: { send_messages: false, edit_messages: 'my' } },
            { id: 'u2', name: 'U2' },
        ]);

        const parts = participants(server.lastRequest!.body as JsonBody);
        assert.deepEqual(parts[0].rights, { send_messages: false, edit_messages: 'my' });
        assert.ok(!('rights' in parts[1]), 'a participant without rights must not gain a rights key');
    });

    test('createChat forwards chat.owner.rights (owner is attached as a participant)', async () => {
        server.respondWith({ status: 201, body: { status: true } });

        await sdk.createChat({
            id: 'c1',
            title: 'G',
            type: 'group',
            owner: { id: 'boss', name: 'Boss', rights: { send_messages: false } },
        });

        const chat = (server.lastRequest!.body as JsonBody).chat as JsonBody;
        assert.deepEqual((chat.owner as JsonBody).rights, { send_messages: false });
    });

    test('sendMessage forwards participants[].rights', async () => {
        server.respondWith({ status: 200, body: { status: true, message_ids: ['m1'] } });

        await sdk.sendMessage(
            'c1',
            { id: 'owner', name: 'Owner' },
            [{ id: 'u1', rights: { send_messages: false, pin_messages: 'for_everyone' } }],
            'hi',
        );

        const parts = participants(server.lastRequest!.body as JsonBody);
        assert.deepEqual(parts[0].rights, { send_messages: false, pin_messages: 'for_everyone' });
    });

    test('addParticipantsToChat forwards participants[].rights', async () => {
        server.respondWith({ status: 200, body: { status: true } });

        await sdk.addParticipantsToChat('c1', [{ id: 'u1', rights: { delete_messages: 'any', send_typing: null } }]);

        const parts = participants(server.lastRequest!.body as JsonBody);
        assert.deepEqual(parts[0].rights, { delete_messages: 'any', send_typing: null });
    });

    test('a malformed rights value is rejected by Zod before sending', async () => {
        await assert.rejects(
            sdk.addParticipantsToChat('c1', [
                { id: 'u1', rights: { edit_messages: 'everything' } as unknown as { edit_messages: 'any' } },
            ]),
        );
        assert.equal(server.lastRequest, undefined, 'invalid rights must not reach the wire');
    });
});
