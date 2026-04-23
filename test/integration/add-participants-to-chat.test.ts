import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { Emby } from '../../src/index';
import type { Participant } from '../../src/types';
import { loadFixture } from '../helpers/loadFixture';
import { type MockServer, startMockServer } from '../helpers/mockServer';
import { makeSdk } from '../helpers/sdkFactory';

type HttpErr = Error & { status?: number };
type JsonBody = Record<string, unknown>;

describe('Emby.addParticipantsToChat()', () => {
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

    test('throws on empty participants list', () => {
        assert.throws(() => sdk.addParticipantsToChat('c1', []), /array of participant objects/);
        assert.throws(() => sdk.addParticipantsToChat('c1'), /array of participant objects/);
    });

    test('POST /chats/c1/participants with normalized list', async () => {
        server.respondWith(loadFixture('chats/add-participants/success'));

        await sdk.addParticipantsToChat('c1', [
            { id: 'p1', name: 'Alice' },
            { id: 'p2', name: 'Bob', email: 'b@x', picture: 'https://p', link: 'https://l' },
        ]);

        const req = server.lastRequest!;
        const body = req.body as JsonBody;
        assert.equal(req.method, 'POST');
        assert.equal(req.path, '/api/v1/chats/c1/participants');
        assert.deepEqual(body.participants, [
            { id: 'p1', name: 'Alice', is_bot: false },
            { id: 'p2', name: 'Bob', email: 'b@x', picture: 'https://p', link: 'https://l', is_bot: false },
        ]);
    });

    test('is_bot=true preserved through normalization', async () => {
        server.respondWith(loadFixture('chats/add-participants/with-bot'));

        await sdk.addParticipantsToChat('c1', [{ id: 'bot-1', name: 'Bot', is_bot: true }]);

        assert.deepEqual((server.lastRequest!.body as JsonBody).participants, [
            { id: 'bot-1', name: 'Bot', is_bot: true },
        ]);
    });

    test('unknown keys in participant are dropped by normalization', async () => {
        server.respondWith(loadFixture('chats/add-participants/success'));

        await sdk.addParticipantsToChat('c1', [
            { id: 'p1', name: 'A', bogus: 'drop', internal: 42 } as unknown as Participant,
        ]);

        assert.deepEqual((server.lastRequest!.body as JsonBody).participants, [{ id: 'p1', name: 'A', is_bot: false }]);
    });

    test('500 server error', async () => {
        server.respondWith(loadFixture('chats/add-participants/server-error'));
        await assert.rejects(
            sdk.addParticipantsToChat('c1', [{ id: 'p1', name: 'A' }]),
            (err) => (err as HttpErr).status === 500,
        );
    });
});
