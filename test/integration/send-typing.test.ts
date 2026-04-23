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

    test('PUT /chats/c1/typing with { user: userId }', async () => {
        server.respondWith(loadFixture('chats/send-typing/success'));

        await sdk.sendTyping('c1', 'u-author');

        const req = server.lastRequest!;
        assert.equal(req.method, 'PUT');
        assert.equal(req.path, '/api/v1/chats/c1/typing');
        assert.deepEqual(req.body, { user: 'u-author' });
    });

    test('500 server error', async () => {
        server.respondWith(loadFixture('chats/send-typing/server-error'));
        await assert.rejects(sdk.sendTyping('c1', 'u-author'), (err) => (err as HttpErr).status === 500);
    });
});
