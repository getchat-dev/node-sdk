import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { Emby } from '../../src/index';
import { loadFixture } from '../helpers/loadFixture';
import { type MockServer, startMockServer } from '../helpers/mockServer';
import { makeSdk } from '../helpers/sdkFactory';

type HttpErr = Error & { status?: number };

describe('Emby.sendTyping()', () => {
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

    test('PUT /chats/c1/typing/u-author (no body) — spec format, BREAKING change in 1.13', async () => {
        server.respondWith(loadFixture('chats/send-typing/success'));

        await sdk.sendTyping('c1', 'u-author');

        const req = server.lastRequest!;
        assert.equal(req.method, 'PUT');
        assert.equal(req.path, '/api/v1/chats/c1/typing/u-author');
        // chatSendTyping has no requestBody in the spec; requestApi sends "{}" for PUT
        // when no body is supplied — this is harmless and matches existing behavior.
        assert.equal(req.rawBody, '{}');
    });

    test('optional time rides the URL query: PUT /chats/c1/typing/u-author?time=7', async () => {
        server.respondWith(loadFixture('chats/send-typing/success'));

        await sdk.sendTyping('c1', 'u-author', 7);

        const req = server.lastRequest!;
        assert.equal(req.method, 'PUT');
        assert.equal(req.path, '/api/v1/chats/c1/typing/u-author?time=7');
    });

    test('out-of-range time is rejected by input validation before sending', async () => {
        await assert.rejects(sdk.sendTyping('c1', 'u-author', 0));
        await assert.rejects(sdk.sendTyping('c1', 'u-author', 61));
        assert.equal(server.lastRequest, undefined);
    });

    test('500 server error', async () => {
        server.respondWith(loadFixture('chats/send-typing/server-error'));
        await assert.rejects(sdk.sendTyping('c1', 'u-author'), (err) => (err as HttpErr).status === 500);
    });
});
